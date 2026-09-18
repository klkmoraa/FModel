import type { Vec2 } from '../geometry/vec';
import type { PolyVertex } from '../geometry/polyline';
import { CadDocument } from '../document/document';
import { createDocumentData, defaultPageSetup, DIMSTYLE_ISO_ID, ISO_DIMSTYLE, LT_CONTINUOUS_ID, TEXTSTYLE_STANDARD_ID } from '../document/defaults';
import { newId } from '../document/ids';
import type {
  ArcEntity,
  BlockRecord,
  CircleEntity,
  DimensionEntity,
  DimStyleProps,
  DocumentData,
  DrawingUnits,
  Entity,
  HatchEntity,
  HatchPatternRef,
  Id,
  InsertEntity,
  LineEntity,
  LwPolylineEntity,
  MTextAttachment,
  MTextEntity,
  TextEntity,
  TextHAlign,
  TextVAlign,
  ViewportEntity,
} from '../document/types';
import { BYLAYER, LW_BYLAYER, MODEL_SPACE_ID } from '../document/types';
import type { LibraryBlock } from '../blocks/library';
import { insertLibraryBlock } from '../blocks/library';

export type P = [number, number];

const v = ([x, y]: P): Vec2 => ({ x, y });
export const deg = (a: number) => (a * Math.PI) / 180;

interface Style {
  layer?: Id;
  color?: string;
  linetype?: string;
  lineweight?: number;
  linetypeScale?: number;
}

/**
 * Construye documentos de plantilla con las mismas entidades que crean los comandos
 * (cotas, sombreados, bloques, presentaciones), no con geometría que las imita.
 * Todo pasa por una transacción del documento, así que los índices quedan coherentes.
 */
export class TemplateBuilder {
  readonly doc: CadDocument;
  private owner: Id = MODEL_SPACE_ID;
  private layerId: Id = 'layer-0';
  private pending: Array<Omit<Entity, 'id' | 'order'>> = [];

  constructor(title: string, units: DrawingUnits = 'mm') {
    this.doc = new CadDocument(createDocumentData({ title, units }));
  }

  // --------------------------------------------------------------- tablas

  layer(id: Id, name: string, color: string, lineweight = -3, linetype = 'Continuous', opts: { plot?: boolean; description?: string } = {}): Id {
    const lt = linetype === 'Continuous' ? LT_CONTINUOUS_ID : `lt-${linetype.toLowerCase()}`;
    this.doc.transact('TPL LAYER', (tx) =>
      tx.add('layers', {
        id,
        name,
        color,
        linetype: this.doc.data.linetypes.has(lt) ? lt : LT_CONTINUOUS_ID,
        lineweight,
        transparency: 0,
        on: true,
        frozen: false,
        locked: false,
        plot: opts.plot ?? true,
        description: opts.description ?? '',
        order: this.doc.data.layers.size,
      }),
    );
    return id;
  }

  /** Estilo de cota ISO-25 escalado para una escala de dibujo (1:50 → factor 50). */
  dimStyle(id: Id, name: string, overallScale: number, props: Partial<DimStyleProps> = {}): Id {
    this.doc.transact('TPL DIMSTYLE', (tx) => tx.add('dimStyles', { id, name, ...ISO_DIMSTYLE, overallScale, ...props }));
    return id;
  }

  settings(patch: Partial<DocumentData['settings']>): void {
    this.doc.transact('TPL SETTINGS', (tx) => tx.setSettings(patch));
  }

  // ------------------------------------------------------------- contexto

  use(layerId: Id): this {
    this.layerId = layerId;
    return this;
  }

  /** Dibuja dentro de otro propietario (bloque o presentación) y restaura el anterior. */
  within(owner: Id, fn: () => void): void {
    this.flush();
    const prev = this.owner;
    this.owner = owner;
    try {
      fn();
    } finally {
      this.flush();
      this.owner = prev;
    }
  }

  private push<E extends Entity>(props: Omit<E, keyof import('../document/types').EntityBase> & { type: E['type'] }, s: Style = {}): void {
    this.pending.push({
      owner: this.owner,
      layer: s.layer ?? this.layerId,
      color: s.color ?? BYLAYER,
      linetype: s.linetype ?? BYLAYER,
      linetypeScale: s.linetypeScale ?? 1,
      lineweight: s.lineweight ?? LW_BYLAYER,
      transparency: 0,
      visible: true,
      ...props,
    } as Omit<Entity, 'id' | 'order'>);
  }

  private flush(): void {
    if (!this.pending.length) return;
    const batch = this.pending;
    this.pending = [];
    this.doc.transact('TPL ENTITIES', (tx) => {
      for (const e of batch) tx.addEntity(e as never);
    });
  }

  // ------------------------------------------------------------ geometría

  line(a: P, b: P, s?: Style): this {
    this.push<LineEntity>({ type: 'line', start: v(a), end: v(b) }, s);
    return this;
  }

  pline(points: Array<P | [number, number, number]>, closed = false, s?: Style & { width?: number }): this {
    const vertices: PolyVertex[] = points.map(([x, y, bulge]) => (bulge ? { x, y, bulge } : { x, y }));
    this.push<LwPolylineEntity>({ type: 'lwpolyline', vertices, closed, ...(s?.width ? { constantWidth: s.width } : {}) }, s);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, s?: Style): this {
    return this.pline([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, s);
  }

  circle(c: P, r: number, s?: Style): this {
    this.push<CircleEntity>({ type: 'circle', center: v(c), radius: r }, s);
    return this;
  }

  /** Ángulos en grados, CCW. */
  arc(c: P, r: number, a0: number, a1: number, s?: Style): this {
    this.push<ArcEntity>({ type: 'arc', center: v(c), radius: r, startAngle: deg(a0), endAngle: deg(a1) }, s);
    return this;
  }

  text(
    str: string,
    at: P,
    height: number,
    o: { h?: TextHAlign; v?: TextVAlign; rot?: number; style?: Id } & Style = {},
  ): this {
    const aligned = (o.h && o.h !== 'left') || (o.v && o.v !== 'baseline');
    this.push<TextEntity>(
      {
        type: 'text',
        text: str,
        position: v(at),
        ...(aligned ? { alignPoint: v(at) } : {}),
        height,
        rotation: deg(o.rot ?? 0),
        widthFactor: 1,
        oblique: 0,
        style: o.style ?? TEXTSTYLE_STANDARD_ID,
        halign: o.h ?? 'left',
        valign: o.v ?? 'baseline',
      },
      o,
    );
    return this;
  }

  mtext(contents: string, at: P, width: number, height: number, o: { attach?: MTextAttachment; spacing?: number; style?: Id } & Style = {}): this {
    this.push<MTextEntity>(
      {
        type: 'mtext',
        contents,
        position: v(at),
        width,
        height,
        rotation: 0,
        style: o.style ?? TEXTSTYLE_STANDARD_ID,
        attachment: o.attach ?? 1,
        lineSpacing: o.spacing ?? 1,
      },
      o,
    );
    return this;
  }

  /** Sombreado de uno o varios contornos (el primero exterior; los siguientes, huecos). */
  hatch(loops: Array<Array<P | [number, number, number]>>, pattern: string | 'SOLID', o: { scale?: number; angle?: number } & Style = {}): this {
    const ref: HatchPatternRef =
      pattern === 'SOLID'
        ? { type: 'solid', name: 'SOLID', angle: 0, scale: 1, spacing: 1, double: false }
        : { type: 'predefined', name: pattern, angle: deg(o.angle ?? 0), scale: o.scale ?? 1, spacing: 1, double: false };
    this.push<HatchEntity>(
      {
        type: 'hatch',
        loops: loops.map((l) => ({ closed: true as const, vertices: l.map(([x, y, bulge]) => (bulge ? { x, y, bulge } : { x, y })) })),
        pattern: ref,
        origin: { x: 0, y: 0 },
        islandStyle: 'normal',
      },
      o,
    );
    return this;
  }

  /**
   * Directriz: flecha rellena en el primer punto, tramo final horizontal y nota a continuación.
   * `arrow` es la longitud de la punta en unidades de dibujo.
   */
  leader(points: P[], note: string, height: number, arrow: number, o: Style & { textLayer?: Id } = {}): this {
    const [tip, next] = points;
    const ang = Math.atan2(next[1] - tip[1], next[0] - tip[0]);
    const w = arrow / 3;
    const bx = tip[0] + Math.cos(ang) * arrow;
    const by = tip[1] + Math.sin(ang) * arrow;
    const px = -Math.sin(ang) * w;
    const py = Math.cos(ang) * w;
    this.hatch([[tip, [bx + px, by + py], [bx - px, by - py]]], 'SOLID', o);
    this.pline(points, false, o);
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const right = last[0] >= prev[0];
    this.mtext(note, [last[0] + (right ? height * 0.6 : -height * 0.6), last[1]], height * 40, height, {
      attach: right ? 4 : 6,
      layer: o.textLayer ?? o.layer,
    });
    return this;
  }

  hatchRect(x: number, y: number, w: number, h: number, pattern: string, o: { scale?: number; angle?: number } & Style = {}): this {
    return this.hatch([[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]], pattern, o);
  }

  // ---------------------------------------------------------------- cotas

  /** Cota lineal real: `at` es un punto por el que pasa la línea de cota. */
  dimLinear(a: P, b: P, at: P, style: Id = DIMSTYLE_ISO_ID, o: { vertical?: boolean; text?: string } & Style = {}): this {
    this.push<DimensionEntity>(
      {
        type: 'dimension',
        dimType: 'linear',
        style,
        overrides: {},
        p1: v(a),
        p2: v(b),
        p3: v(at),
        rotation: o.vertical ? Math.PI / 2 : 0,
        ...(o.text ? { textOverride: o.text } : {}),
      },
      o,
    );
    return this;
  }

  /** Cadena de cotas horizontales (o verticales) sobre una misma línea. */
  dimChain(points: number[], fixed: number, at: number, style: Id, o: { vertical?: boolean } & Style = {}): this {
    for (let i = 0; i < points.length - 1; i++) {
      const a: P = o.vertical ? [fixed, points[i]] : [points[i], fixed];
      const b: P = o.vertical ? [fixed, points[i + 1]] : [points[i + 1], fixed];
      const p: P = o.vertical ? [at, points[i]] : [points[i], at];
      this.dimLinear(a, b, p, style, o);
    }
    return this;
  }

  dimRadial(center: P, onCurve: P, textAt: P, style: Id = DIMSTYLE_ISO_ID, diametric = false, s?: Style): this {
    this.push<DimensionEntity>(
      { type: 'dimension', dimType: diametric ? 'diametric' : 'radial', style, overrides: {}, center: v(center), p1: v(onCurve), p2: v(center), p3: v(textAt), rotation: 0 },
      s,
    );
    return this;
  }

  // --------------------------------------------------------------- bloques

  /** Define un bloque; `draw` dibuja en coordenadas locales (base en el origen). */
  block(name: string, draw: () => void, description = ''): Id {
    this.flush();
    const id = newId('blk');
    const rec: BlockRecord = { id, name, kind: 'normal', basePoint: { x: 0, y: 0 }, description, units: this.doc.settings.units, explodable: true, scaleUniformly: false, annotative: false, revision: 1 };
    this.doc.transact('TPL BLOCK', (tx) => tx.add('blocks', rec));
    const prevLayer = this.layerId;
    this.within(id, () => {
      this.layerId = 'layer-0';
      draw();
    });
    this.layerId = prevLayer;
    return id;
  }

  /** Trae un bloque (dinámico o no) de la biblioteca de FModel. */
  libraryBlock(item: LibraryBlock): Id {
    this.flush();
    const name = insertLibraryBlock(this.doc, item);
    return this.doc.findByName('blocks', name)!.id;
  }

  insert(blockId: Id, at: P, o: { rot?: number; sx?: number; sy?: number; dyn?: Record<string, number> } & Style = {}): this {
    const dynamic = o.dyn ? this.dynamicState(blockId, o.dyn) : undefined;
    this.push<InsertEntity>(
      {
        type: 'insert',
        blockId,
        position: v(at),
        scale: { x: o.sx ?? 1, y: o.sy ?? o.sx ?? 1 },
        rotation: deg(o.rot ?? 0),
        attributes: [],
        ...(dynamic ? { dynamic } : {}),
      },
      o,
    );
    return this;
  }

  /** Valores de instancia por nombre de parámetro («Ancho», «Largo»…). */
  private dynamicState(blockId: Id, byName: Record<string, number>): InsertEntity['dynamic'] {
    const def = this.doc.data.blocks.get(blockId)?.dynamic;
    if (!def) return undefined;
    const values: Record<Id, number> = {};
    for (const p of def.parameters) {
      const val = byName[p.name] ?? byName[p.label];
      if (val !== undefined) values[p.id] = val;
    }
    return { values };
  }

  // --------------------------------------------------------- presentación

  layout(name: string, paper: 'ISO A3' | 'ISO A4' = 'ISO A3', orientation: 'portrait' | 'landscape' = 'landscape'): Id {
    this.flush();
    const id = newId('layout');
    const order = this.doc.data.layouts.size + 1;
    this.doc.transact('TPL LAYOUT', (tx) => tx.add('layouts', { id, name, tabOrder: order, page: defaultPageSetup(paper, orientation) }));
    return id;
  }

  /** Viewport en papel: `box` en mm de papel, `view` centro en modelo, `scale` papel/modelo (1:50 → 1/50). */
  viewport(box: { x: number; y: number; w: number; h: number }, view: P, scale: number, scaleName: string, s?: Style): this {
    this.push<ViewportEntity>(
      {
        type: 'viewport',
        center: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
        width: box.w,
        height: box.h,
        viewCenter: v(view),
        scale,
        viewTwist: 0,
        displayLocked: true,
        on: true,
        frozenLayers: [],
        layerOverrides: {},
        scaleName,
      },
      s,
    );
    return this;
  }

  /** Quita la presentación vacía que trae todo documento nuevo si ya hay otra. */
  build(): DocumentData {
    this.flush();
    const layouts = [...this.doc.data.layouts.values()];
    if (layouts.length > 1 && this.doc.entitiesOf('layout-1').length === 0) {
      this.doc.transact('TPL CLEAN', (tx) => tx.remove('layouts', 'layout-1'));
    }
    return this.doc.data;
  }
}
