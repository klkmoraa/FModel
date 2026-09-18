import { DEG } from '../../geometry/angle';
import { boxFromPoints, emptyBox, expandBox, isEmptyBox } from '../../geometry/bbox';
import { tessellateCurve } from '../../geometry/curves';
import type { PolyVertex } from '../../geometry/polyline';
import type { Vec2 } from '../../geometry/vec';
import { dist } from '../../geometry/vec';
import { nearestAci, parseHex } from '../../document/colors';
import type { CadDocument } from '../../document/document';
import { LT_CONTINUOUS_ID, paperExtents } from '../../document/defaults';
import type {
  ArrowType,
  ColorValue,
  DimensionEntity,
  DimStyleRecord,
  DrawingUnits,
  Entity,
  HatchEntity,
  Id,
  InsertEntity,
  LayoutRecord,
  Loop,
  PageSetup,
  TextHAlign,
  TextVAlign,
  ViewportEntity,
} from '../../document/types';
import { MODEL_SPACE_ID } from '../../document/types';
import type { ModelContext } from '../../model/context';
import { buildDimension } from '../../model/dimension';
import { findPattern, userPatternLines } from '../../model/hatchPatterns';
import { explodeItems } from '../../model/kinds/annotation';
import { insertAttributes, variantKey } from '../../model/kinds/insert';
import { smoothedCurves } from '../../model/kinds/polylines';
import { kindOf } from '../../model/registry';
import { encodeDefinition, FMODEL_APPID, FMODEL_DYN_DICT, instanceXdata, xrecordBody } from './dynamicData';
import { dxfName, HandleSeed, TagBuffer } from './tags';

/** Informe de exportación con la misma estructura conceptual que el de importación. */
export interface DxfExportReport {
  version: 'AC1024';
  exported: Record<string, number>;
  transformed: Record<string, { count: number; reason: string }>;
  ignored: Record<string, { count: number; reason: string }>;
  warnings: string[];
  blocks: number;
  layouts: number;
}

const INSUNITS_CODE: Record<DrawingUnits, number> = { unitless: 0, in: 1, ft: 2, mi: 3, mm: 4, cm: 5, m: 6, km: 7, yd: 10 };
const HALIGN: Record<TextHAlign, number> = { left: 0, center: 1, right: 2, aligned: 3, middle: 4, fit: 5 };
const VALIGN: Record<TextVAlign, number> = { baseline: 0, bottom: 1, middle: 2, top: 3 };
const LUNITS: Record<string, number> = { scientific: 1, decimal: 2, engineering: 3, architectural: 4, fractional: 5 };
const AUNITS: Record<string, number> = { degrees: 0, dms: 1, grads: 2, radians: 3, surveyor: 4 };
/** Flechas que se escriben como bloque propio en el estilo; el resto usa la cerrada rellena por defecto. */
const ARROW_BLOCKS: Partial<Record<ArrowType, string>> = { tick: '_OBLIQUE', architectural: '_ARCHTICK', none: '_NONE' };

interface OwnerCtx {
  /** handle del BLOCK_RECORD propietario */
  br: string;
  paper: boolean;
  buf: TagBuffer;
}

interface BlockOut {
  name: string;
  br: string;
  blockHandle: string;
  endHandle: string;
  flags: number;
  base: Vec2;
  description: string;
  units: DrawingUnits;
  explodable: boolean;
  scaleUniformly: boolean;
  /** handle del LAYOUT (bloques de espacio papel) */
  layout?: string;
  buf: TagBuffer;
}

function sanitizeText(s: string): string {
  return s.replace(/\r?\n/g, '\\P');
}

/**
 * Contenido MTEXT: el marcado propio \b1/\i1 se traduce a grupos {\f…|b1|i1;…} como los
 * escribe AutoCAD, y los saltos de línea a \P.
 */
function mtextContents(contents: string, font: string): string {
  let bold = false;
  let italic = false;
  let open = false;
  let out = '';
  const family = font.replace(/\.(ttf|otf|shx)$/i, '') || 'Arial';
  for (let i = 0; i < contents.length; i++) {
    const ch = contents[i];
    if (ch === '\n') {
      out += '\\P';
      continue;
    }
    if (ch === '\\' && (contents[i + 1] === 'b' || contents[i + 1] === 'i') && (contents[i + 2] === '0' || contents[i + 2] === '1')) {
      if (contents[i + 1] === 'b') bold = contents[i + 2] === '1';
      else italic = contents[i + 2] === '1';
      if (open) out += '}';
      open = bold || italic;
      if (open) out += `{\\f${family}|b${bold ? 1 : 0}|i${italic ? 1 : 0}|c0|p34;`;
      i += 2;
      continue;
    }
    out += ch;
  }
  return open ? `${out}}` : out;
}

function transparencyCode(t: number): number {
  const alpha = Math.round(255 * (1 - Math.max(0, Math.min(90, t)) / 100));
  return 0x02000000 | alpha;
}

function trueColorInt(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (r << 16) | (g << 8) | b;
}

/** Nombre de papel DXF con dimensiones (formato de los PC3 «none_device»). */
function paperName(page: PageSetup): string {
  const w = Math.min(page.width, page.height).toFixed(2);
  const h = Math.max(page.width, page.height).toFixed(2);
  const base = page.paper.replace(/\s*\(.*\)/, '').replace(/\s+/g, '_');
  return `${base}_(${w}_x_${h}_MM)`;
}

/**
 * Exporta el documento a DXF R2010 (AC1024, UTF-8): tablas, bloques, espacio modelo,
 * presentaciones con viewports y objetos. Las entidades sin equivalente DXF fiable se
 * convierten a geometría simple y se informa de ello; nada se omite en silencio.
 */
export function exportDxf(doc: CadDocument, ctx: ModelContext): { text: string; report: DxfExportReport } {
  const data = doc.data;
  const s = data.settings;
  const H = new HandleSeed(0x30);
  const report: DxfExportReport = { version: 'AC1024', exported: {}, transformed: {}, ignored: {}, warnings: [], blocks: 0, layouts: 0 };
  const ok = (t: string) => (report.exported[t] = (report.exported[t] ?? 0) + 1);
  const transformed = (t: string, reason: string) => ((report.transformed[t] ??= { count: 0, reason }).count++);
  const ignored = (t: string, reason: string) => ((report.ignored[t] ??= { count: 0, reason }).count++);

  // ------------------------------------------------------------------ handles fijos
  const T = { VPORT: H.next(), LTYPE: H.next(), LAYER: H.next(), STYLE: H.next(), VIEW: H.next(), UCS: H.next(), APPID: H.next(), DIMSTYLE: H.next(), BLOCK_RECORD: H.next() };
  const OBJ = { root: H.next(), group: H.next(), layout: H.next(), mlinestyleDict: H.next(), mlineStandard: H.next(), plotSettings: H.next(), plotStyleName: H.next(), placeholder: H.next(), imageDict: '', imageVars: '', rasterVars: '', wipeoutDict: '', wipeoutVars: '' };

  // ------------------------------------------------------------------ nombres únicos de tablas
  const unique = (used: Set<string>, name: string) => {
    let n = name;
    let i = 1;
    while (used.has(n.toUpperCase())) n = `${name}_${i++}`;
    used.add(n.toUpperCase());
    return n;
  };
  const layerNames = new Map<Id, string>();
  const layerHandles = new Map<Id, string>();
  {
    const used = new Set<string>();
    for (const l of [...data.layers.values()].sort((a, b) => a.order - b.order)) {
      layerNames.set(l.id, l.name === '0' ? '0' : unique(used, dxfName(l.name, 'Capa')));
      layerHandles.set(l.id, H.next());
    }
    if (![...data.layers.values()].some((l) => l.name === '0')) report.warnings.push('El dibujo no tenía capa «0»; se añadió.');
  }
  const ltNames = new Map<Id, string>();
  const ltHandles = new Map<Id, string>();
  {
    const used = new Set<string>(['BYBLOCK', 'BYLAYER']);
    for (const lt of data.linetypes.values()) {
      ltNames.set(lt.id, lt.id === LT_CONTINUOUS_ID ? 'Continuous' : unique(used, dxfName(lt.name, 'Tipo')));
      if (lt.id === LT_CONTINUOUS_ID) used.add('CONTINUOUS');
      ltHandles.set(lt.id, H.next());
    }
  }
  const ltName = (id: string | undefined) => (!id || id === 'ByLayer' ? 'ByLayer' : id === 'ByBlock' ? 'ByBlock' : (ltNames.get(id) ?? 'Continuous'));
  const styleNames = new Map<Id, string>();
  const styleHandles = new Map<Id, string>();
  {
    const used = new Set<string>();
    for (const st of data.textStyles.values()) {
      styleNames.set(st.id, unique(used, dxfName(st.name, 'Estilo')));
      styleHandles.set(st.id, H.next());
    }
  }
  const styleName = (id: Id) => styleNames.get(id) ?? 'Standard';
  const dimNames = new Map<Id, string>();
  const dimHandles = new Map<Id, string>();
  {
    const used = new Set<string>();
    for (const ds of data.dimStyles.values()) {
      dimNames.set(ds.id, unique(used, dxfName(ds.name, 'Cota')));
      dimHandles.set(ds.id, H.next());
    }
  }

  // ------------------------------------------------------------------ bloques y espacios
  const blocks: BlockOut[] = [];
  const blockNames = new Set<string>(['*MODEL_SPACE', '*PAPER_SPACE']);
  const newBlock = (name: string, flags: number, base: Vec2, extra: Partial<BlockOut> = {}): BlockOut => {
    const b: BlockOut = { name, br: H.next(), blockHandle: H.next(), endHandle: H.next(), flags, base, description: '', units: s.insUnits, explodable: true, scaleUniformly: false, buf: new TagBuffer(), ...extra };
    blocks.push(b);
    return b;
  };
  const model = newBlock('*Model_Space', 0, { x: 0, y: 0 });
  const layoutHandles = new Map<Id, string>();
  const modelLayoutHandle = H.next();
  const layouts = [...data.layouts.values()].sort((a, b) => a.tabOrder - b.tabOrder);
  const paperBlocks = new Map<Id, BlockOut>();
  layouts.forEach((l, i) => {
    const lh = H.next();
    layoutHandles.set(l.id, lh);
    paperBlocks.set(l.id, newBlock(i === 0 ? '*Paper_Space' : `*Paper_Space${i - 1}`, 0, { x: 0, y: 0 }, { layout: lh }));
  });
  model.layout = modelLayoutHandle;
  if (!layouts.length) {
    // AutoCAD exige al menos una presentación
    const lh = H.next();
    layoutHandles.set('*fm-default-layout', lh);
    paperBlocks.set('*fm-default-layout', newBlock('*Paper_Space', 0, { x: 0, y: 0 }, { layout: lh }));
  }
  const userBlockNames = new Map<Id, string>();
  const userBlocks = new Map<Id, BlockOut>();
  for (const b of data.blocks.values()) {
    const base = b.name.startsWith('*') ? b.name.slice(1) : b.name;
    const name = unique(blockNames, dxfName(base, 'Bloque'));
    userBlockNames.set(b.id, name);
    if (b.kind === 'xref') transformed('XREF', 'Las referencias externas se exportan incrustadas como bloque con su contenido cargado.');
    userBlocks.set(b.id, newBlock(name, 0, b.basePoint, { description: b.description, units: b.units, explodable: b.explodable, scaleUniformly: b.scaleUniformly }));
  }
  // variantes estáticas de bloques dinámicos
  const variantBlocks = new Map<string, string>();

  const entityHandles = new Map<Id, string>();
  const setHandle = (e: Entity, handle: string) => {
    if (e.id) entityHandles.set(e.id, handle);
  };
  // los grupos se asignan antes para que sus miembros declaren el reactor persistente
  const groupHandles = new Map<Id, string>();
  const reactorsOf = new Map<Id, string[]>();
  for (const g of data.groups.values()) {
    const gh = H.next();
    groupHandles.set(g.id, gh);
    for (const m of g.members) reactorsOf.set(m, [...(reactorsOf.get(m) ?? []), gh]);
  }
  const images: { handle: string; defHandle: string; reactor: string; name: string; path: string; w: number; h: number }[] = [];
  let dimBlockSeq = 0;
  let wipeouts = 0;

  // ------------------------------------------------------------------ cabecera común de entidades
  const head = (o: OwnerCtx, type: string, e: Pick<Entity, 'layer' | 'color' | 'linetype' | 'linetypeScale' | 'lineweight' | 'transparency' | 'visible'>, handle = H.next(), ownerOverride?: string) => {
    const b = o.buf;
    b.tag(0, type);
    b.tag(5, handle);
    const reactors = 'id' in e && typeof e.id === 'string' ? reactorsOf.get(e.id) : undefined;
    if (reactors) {
      b.tag(102, '{ACAD_REACTORS');
      for (const r of reactors) b.tag(330, r);
      b.tag(102, '}');
    }
    b.tag(330, ownerOverride ?? o.br);
    b.tag(100, 'AcDbEntity');
    if (o.paper) b.tag(67, 1);
    b.tag(8, layerNames.get(e.layer) ?? '0');
    const lt = ltName(e.linetype);
    if (lt !== 'ByLayer') b.tag(6, lt);
    writeColor(b, e.color);
    if (e.lineweight !== -1) b.tag(370, e.lineweight);
    if (e.transparency === 'ByBlock') b.tag(440, 0x01000000);
    else if (typeof e.transparency === 'number') b.tag(440, transparencyCode(e.transparency));
    if (e.linetypeScale && e.linetypeScale !== 1) b.tag(48, e.linetypeScale);
    if (!e.visible) b.tag(60, 1);
    return handle;
  };

  function writeColor(b: TagBuffer, c: ColorValue) {
    if (c === 'ByLayer') return;
    if (c === 'ByBlock') return b.tag(62, 0);
    if (c.startsWith('aci:')) return b.tag(62, Number(c.slice(4)) || 7);
    if (c.startsWith('#')) {
      b.tag(62, nearestAci(c));
      b.tag(420, trueColorInt(c));
    }
  }

  const textFont = (styleId: Id) => data.textStyles.get(styleId)?.font ?? 'Arial';

  // ------------------------------------------------------------------ entidades
  function writeEntity(o: OwnerCtx, e: Entity) {
    if (e.construction) transformed('Construcción', 'La geometría de construcción se exporta como geometría normal (el DXF no tiene ese concepto).');
    switch (e.type) {
      case 'point': {
        setHandle(e, head(o, 'POINT', e));
        o.buf.tag(100, 'AcDbPoint');
        o.buf.point(10, e.position);
        return ok('POINT');
      }
      case 'line': {
        setHandle(e, head(o, 'LINE', e));
        o.buf.tag(100, 'AcDbLine');
        o.buf.point(10, e.start);
        o.buf.point(11, e.end);
        return ok('LINE');
      }
      case 'ray':
      case 'xline': {
        setHandle(e, head(o, e.type === 'ray' ? 'RAY' : 'XLINE', e));
        o.buf.tag(100, e.type === 'ray' ? 'AcDbRay' : 'AcDbXline');
        o.buf.point(10, e.origin);
        o.buf.point(11, e.direction);
        return ok(e.type.toUpperCase());
      }
      case 'circle': {
        setHandle(e, head(o, 'CIRCLE', e));
        o.buf.tag(100, 'AcDbCircle');
        o.buf.point(10, e.center);
        o.buf.tag(40, e.radius);
        return ok('CIRCLE');
      }
      case 'arc': {
        setHandle(e, head(o, 'ARC', e));
        o.buf.tag(100, 'AcDbCircle');
        o.buf.point(10, e.center);
        o.buf.tag(40, e.radius);
        o.buf.tag(100, 'AcDbArc');
        o.buf.tag(50, e.startAngle / DEG);
        o.buf.tag(51, e.endAngle / DEG);
        return ok('ARC');
      }
      case 'ellipse': {
        setHandle(e, head(o, 'ELLIPSE', e));
        o.buf.tag(100, 'AcDbEllipse');
        o.buf.point(10, e.center);
        o.buf.point(11, e.majorAxis);
        o.buf.tag(40, e.ratio);
        o.buf.tag(41, e.startParam);
        o.buf.tag(42, e.endParam);
        return ok('ELLIPSE');
      }
      case 'lwpolyline':
        setHandle(e, writeLwPolyline(o, e, e.vertices, e.closed, e.constantWidth));
        return ok('LWPOLYLINE');
      case 'polyline2d': {
        if (e.smoothing === 'none') {
          setHandle(e, writeLwPolyline(o, e, e.vertices, e.closed));
          return ok('LWPOLYLINE');
        }
        const pts = smoothedCurves(e).flatMap((c, i) => (i ? tessellateCurve(c, 1e-3).slice(1) : tessellateCurve(c, 1e-3)));
        setHandle(e, writeLwPolyline(o, e, pts, e.closed));
        return transformed('POLYLINE (suavizada)', 'Las polilíneas ajustadas o spline se exportan como LWPOLYLINE con la curva suavizada aproximada (tolerancia 0,001).');
      }
      case 'spline': {
        const sp = e.spline;
        setHandle(e, head(o, 'SPLINE', e));
        const b = o.buf;
        b.tag(100, 'AcDbSpline');
        b.point(210, { x: 0, y: 0 }, 1);
        const rational = !!sp.weights && sp.weights.some((w) => Math.abs(w - 1) > 1e-12);
        b.tag(70, 8 | (sp.closed ? 1 : 0) | (rational ? 4 : 0));
        b.tag(71, sp.degree);
        b.tag(72, sp.knots.length);
        b.tag(73, sp.ctrl.length);
        b.tag(74, e.method === 'fit' && sp.fit ? sp.fit.length : 0);
        b.tag(42, 1e-10);
        b.tag(43, 1e-10);
        if (e.method === 'fit' && sp.fit) b.tag(44, e.fitTolerance || 1e-10);
        for (const k of sp.knots) b.tag(40, k);
        if (rational) for (const w of sp.weights!) b.tag(41, w);
        for (const p of sp.ctrl) b.point(10, p);
        if (e.method === 'fit' && sp.fit) for (const p of sp.fit) b.point(11, p);
        return ok('SPLINE');
      }
      case 'region': {
        for (const loop of e.loops) writeLwPolyline(o, e, loop.vertices, true);
        return transformed('REGION', 'Las regiones requieren datos ACIS propietarios: cada contorno se exporta como LWPOLYLINE cerrada.');
      }
      case 'hatch':
        setHandle(e, writeHatch(o, e));
        if (e.background) transformed('HATCH (color de fondo)', 'El color de fondo del sombreado no se exporta; el patrón sí.');
        return ok('HATCH');
      case 'text': {
        setHandle(e, head(o, 'TEXT', e));
        writeTextBody(o.buf, e.position, e.alignPoint, ctx.resolveFields(e.text, e), e.height, e.rotation, e.widthFactor, e.oblique, e.style, e.halign, e.valign);
        o.buf.tag(100, 'AcDbText');
        o.buf.tag(73, VALIGN[e.valign]);
        if (e.text.includes('{{')) transformed('Campos', 'Los campos se exportan con su valor actual como texto fijo.');
        return ok('TEXT');
      }
      case 'mtext': {
        setHandle(e, head(o, 'MTEXT', e));
        const b = o.buf;
        b.tag(100, 'AcDbMText');
        b.point(10, e.position);
        b.tag(40, e.height);
        b.tag(41, e.width);
        b.tag(71, e.attachment);
        b.tag(72, 5);
        const text = mtextContents(ctx.resolveFields(e.contents, e), textFont(e.style));
        for (let i = 0; i < text.length; i += 250) {
          const chunk = text.slice(i, i + 250);
          b.tag(i + 250 >= text.length ? 1 : 3, chunk);
        }
        if (!text.length) b.tag(1, '');
        b.tag(7, styleName(e.style));
        b.point(11, { x: Math.cos(e.rotation), y: Math.sin(e.rotation) });
        b.tag(73, 1);
        b.tag(44, e.lineSpacing || 1);
        if (e.background) {
          b.tag(90, e.background.color === 'Background' ? 3 : 1);
          if (e.background.color !== 'Background') b.tag(63, e.background.color.startsWith('aci:') ? Number(e.background.color.slice(4)) : nearestAci(e.background.color));
          b.tag(45, 1 + (e.background.offset || 0.5));
          b.tag(441, 0);
        }
        return ok('MTEXT');
      }
      case 'leader': {
        setHandle(e, head(o, 'LEADER', e));
        const b = o.buf;
        b.tag(100, 'AcDbLeader');
        b.tag(3, dimNames.get(e.style) ?? 'Standard');
        b.tag(71, e.arrow === 'none' ? 0 : 1);
        b.tag(72, e.splined ? 1 : 0);
        b.tag(73, 3);
        b.tag(74, 1);
        b.tag(75, e.hookline ? 1 : 0);
        b.tag(40, 0);
        b.tag(41, 0);
        b.tag(76, e.vertices.length);
        for (const v of e.vertices) b.point(10, v);
        return ok('LEADER');
      }
      case 'insert':
        return writeInsert(o, e);
      case 'attdef': {
        setHandle(e, head(o, 'ATTDEF', e));
        writeTextBody(o.buf, e.position, undefined, e.defaultValue, e.height, e.rotation, 1, 0, e.style, e.halign, e.valign);
        const b = o.buf;
        b.tag(100, 'AcDbAttributeDefinition');
        b.tag(280, 0);
        b.tag(3, e.prompt);
        b.tag(2, dxfName(e.tag, 'TAG').replace(/\s/g, '_'));
        b.tag(70, (e.invisible ? 1 : 0) | (e.constant ? 2 : 0) | (e.verify ? 4 : 0) | (e.preset ? 8 : 0));
        b.tag(74, VALIGN[e.valign]);
        b.tag(280, e.lockPosition ? 1 : 0);
        return ok('ATTDEF');
      }
      case 'dimension':
        return writeDimension(o, e);
      case 'wipeout': {
        const box = boxFromPoints(e.vertices);
        const w = Math.max(box.maxX - box.minX, 1e-9);
        const h = Math.max(box.maxY - box.minY, 1e-9);
        setHandle(e, head(o, 'WIPEOUT', e));
        const b = o.buf;
        b.tag(100, 'AcDbWipeout');
        b.tag(90, 0);
        b.point(10, { x: box.minX, y: box.minY });
        b.point(11, { x: w, y: 0 });
        b.point(12, { x: 0, y: h });
        b.point2(13, { x: 1, y: 1 });
        b.tag(340, '0');
        b.tag(70, 7);
        b.tag(280, 1);
        b.tag(281, 50);
        b.tag(282, 50);
        b.tag(283, 0);
        b.tag(360, '0');
        b.tag(71, 2);
        const verts = e.vertices.map((p) => ({ x: (p.x - box.minX) / w - 0.5, y: 0.5 - (p.y - box.minY) / h }));
        verts.push(verts[0]);
        b.tag(91, verts.length);
        for (const v of verts) b.point2(14, v);
        b.tag(290, 0);
        wipeouts++;
        return ok('WIPEOUT');
      }
      case 'image': {
        const asset = data.assets.get(e.assetId);
        const pw = asset?.width ?? 0;
        const ph = asset?.height ?? 0;
        if (!asset || !pw || !ph) return ignored('IMAGE', 'La imagen no tiene recurso o dimensiones en píxeles.');
        const handle = head(o, 'IMAGE', e);
        setHandle(e, handle);
        const defHandle = H.next();
        const reactor = H.next();
        const b = o.buf;
        b.tag(100, 'AcDbRasterImage');
        b.tag(90, 0);
        b.point(10, e.position);
        b.point(11, { x: e.u.x / pw, y: e.u.y / pw });
        b.point(12, { x: e.v.x / ph, y: e.v.y / ph });
        b.point2(13, { x: pw, y: ph });
        b.tag(340, defHandle);
        b.tag(70, 7);
        b.tag(280, e.clipEnabled && e.clip ? 1 : 0);
        b.tag(281, Math.round(e.brightness ?? 50));
        b.tag(282, Math.round(e.contrast ?? 50));
        b.tag(283, Math.round(e.fade ?? 0));
        b.tag(360, reactor);
        const clip = e.clipEnabled && e.clip && e.clip.length > 2 ? e.clip.map((q) => ({ x: q.x * pw - 0.5, y: (1 - q.y) * ph - 0.5 })) : null;
        if (clip) {
          b.tag(71, 2);
          b.tag(91, clip.length + 1);
          for (const q of [...clip, clip[0]]) b.point2(14, q);
        } else {
          b.tag(71, 1);
          b.tag(91, 2);
          b.point2(14, { x: -0.5, y: -0.5 });
          b.point2(14, { x: pw - 0.5, y: ph - 0.5 });
        }
        images.push({ handle, defHandle, reactor, name: dxfName(asset.name.replace(/\.[^.]+$/, ''), 'imagen'), path: asset.path ?? asset.name, w: pw, h: ph });
        return transformed('IMAGE', 'Las imágenes se referencian como archivo externo con su nombre original: guarda la imagen junto al DXF.');
      }
      case 'pdfunderlay':
        return ignored('PDFUNDERLAY', 'Los calcos PDF referencian un archivo externo con escala dependiente del programa: vuelve a adjuntarlo en el destino.');
      case 'viewport':
        return writeViewport(o, e);
      case 'mline':
      case 'table':
      case 'mleader':
      case 'array': {
        const parts = kindOf(e).explode?.(e, ctx) ?? [];
        for (const p of parts) writeEntity(o, p);
        const reasons: Record<string, string> = {
          mline: 'Las multilíneas se exportan descompuestas en líneas y arcos (los estilos MLINE no se conservan).',
          table: 'Las tablas se exportan descompuestas en líneas y textos (ACAD_TABLE no se genera).',
          mleader: 'Las directrices múltiples se exportan descompuestas en líneas, rellenos y textos.',
          array: 'Las matrices asociativas se exportan como objetos individuales.',
        };
        return transformed(e.type.toUpperCase(), reasons[e.type]);
      }
    }
  }

  function writeLwPolyline(o: OwnerCtx, e: Entity, vertices: PolyVertex[] | Vec2[], closed: boolean, constantWidth?: number): string {
    const handle = head(o, 'LWPOLYLINE', e);
    const b = o.buf;
    b.tag(100, 'AcDbPolyline');
    b.tag(90, vertices.length);
    b.tag(70, closed ? 1 : 0);
    if (constantWidth) b.tag(43, constantWidth);
    for (const v of vertices as PolyVertex[]) {
      b.point2(10, v);
      if (!constantWidth && (v.startWidth || v.endWidth)) {
        b.tag(40, v.startWidth ?? 0);
        b.tag(41, v.endWidth ?? 0);
      }
      if (v.bulge) b.tag(42, v.bulge);
    }
    return handle;
  }

  function writeTextBody(b: TagBuffer, position: Vec2, alignPoint: Vec2 | undefined, text: string, height: number, rotation: number, widthFactor: number, oblique: number, style: Id, halign: TextHAlign, valign: TextVAlign) {
    b.tag(100, 'AcDbText');
    b.point(10, position);
    b.tag(40, height);
    b.tag(1, sanitizeText(text));
    if (rotation) b.tag(50, rotation / DEG);
    if (widthFactor !== 1) b.tag(41, widthFactor);
    if (oblique) b.tag(51, oblique / DEG);
    b.tag(7, styleName(style));
    if (halign !== 'left' || valign !== 'baseline') {
      b.tag(72, HALIGN[halign]);
      b.point(11, alignPoint ?? position);
    }
  }

  function writeHatch(o: OwnerCtx, e: HatchEntity): string {
    const handle = head(o, 'HATCH', e);
    const b = o.buf;
    const p = e.pattern;
    const solid = p.type === 'solid' || p.type === 'gradient';
    b.tag(100, 'AcDbHatch');
    b.point(10, { x: 0, y: 0 });
    b.point(210, { x: 0, y: 0 }, 1);
    b.tag(2, solid ? 'SOLID' : p.type === 'user' ? '_USER' : p.name.toUpperCase());
    b.tag(70, solid ? 1 : 0);
    b.tag(71, 0);
    b.tag(91, e.loops.length);
    e.loops.forEach((loop: Loop, i) => {
      const hasBulge = loop.vertices.some((v) => v.bulge);
      b.tag(92, (i === 0 ? 1 : 0) | 2);
      b.tag(72, hasBulge ? 1 : 0);
      b.tag(73, 1);
      b.tag(93, loop.vertices.length);
      for (const v of loop.vertices) {
        b.point2(10, v);
        if (hasBulge) b.tag(42, v.bulge ?? 0);
      }
      b.tag(97, 0);
    });
    b.tag(75, e.islandStyle === 'outer' ? 1 : e.islandStyle === 'ignore' ? 2 : 0);
    b.tag(76, p.type === 'user' ? 0 : 1);
    if (!solid) {
      const lines = p.type === 'user' ? userPatternLines(p.spacing, p.double) : (findPattern(p.name)?.lines ?? null);
      if (!lines) {
        transformed('HATCH (patrón)', `El patrón «${p.name}» no está en la biblioteca de exportación: se escribe sin definición y el programa de destino debe tenerlo.`);
      }
      const angle = p.angle;
      const k = p.type === 'user' ? 1 : p.scale || 1;
      b.tag(52, angle / DEG);
      b.tag(41, k);
      b.tag(77, p.double ? 1 : 0);
      b.tag(78, lines?.length ?? 0);
      for (const ln of lines ?? []) {
        const a = ln.angle * DEG + angle;
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        const la = ln.angle * DEG;
        // desplazamiento del patrón (dx a lo largo, dy perpendicular) girado por la línea y el sombreado
        const ox = (ln.dx * Math.cos(la) - ln.dy * Math.sin(la)) * k;
        const oy = (ln.dx * Math.sin(la) + ln.dy * Math.cos(la)) * k;
        b.tag(53, a / DEG);
        b.tag(43, (ln.x * ca - ln.y * sa) * k + e.origin.x);
        b.tag(44, (ln.x * sa + ln.y * ca) * k + e.origin.y);
        b.tag(45, ox * ca - oy * sa);
        b.tag(46, ox * sa + oy * ca);
        b.tag(79, ln.dashes.length);
        for (const d of ln.dashes) b.tag(49, d * k);
      }
    }
    b.tag(98, 0);
    if (p.type === 'gradient' && p.gradient) {
      const g = p.gradient;
      b.tag(450, 1);
      b.tag(451, 0);
      b.tag(452, 0);
      b.tag(453, 2);
      b.tag(460, g.angle);
      b.tag(461, g.centered ? 0 : 1);
      b.tag(462, 0);
      for (const [i, c] of [g.color1, g.color2].entries()) {
        b.tag(463, i);
        const hex = c.startsWith('#') ? c : '#808080';
        b.tag(63, c.startsWith('aci:') ? Number(c.slice(4)) : nearestAci(hex));
        b.tag(421, trueColorInt(hex));
      }
      b.tag(470, g.name.toUpperCase());
    }
    return handle;
  }

  function writeInsert(o: OwnerCtx, e: InsertEntity) {
    const def = data.blocks.get(e.blockId);
    if (!def) return ignored('INSERT', 'Referencia a una definición de bloque inexistente.');
    let name = userBlockNames.get(def.id)!;
    if (def.dynamic) {
      const key = `${def.id}|${variantKey(e)}`;
      let vname = variantBlocks.get(key);
      if (!vname) {
        vname = unique(blockNames, dxfName(`${name}_V${variantBlocks.size + 1}`, 'Variante'));
        variantBlocks.set(key, vname);
        const vb = newBlock(vname, 0, def.basePoint, { description: `${def.name} (variante dinámica)`, units: def.units });
        const ev = ctx.evaluateBlock(def.id, e.dynamic);
        const bo: OwnerCtx = { br: vb.br, paper: false, buf: vb.buf };
        for (const be of ev.entities) writeEntity(bo, be);
      }
      name = vname;
      transformed('Bloque dinámico', 'Cada estado usado se exporta como bloque estático para otros programas; FModel conserva parámetros, acciones y estados al reimportar.');
    }
    const handle = head(o, 'INSERT', e);
    setHandle(e, handle);
    const attrs = insertAttributes(e, ctx);
    const b = o.buf;
    b.tag(100, 'AcDbBlockReference');
    if (attrs.length) b.tag(66, 1);
    b.tag(2, name);
    b.point(10, e.position);
    if (e.scale.x !== 1) b.tag(41, e.scale.x);
    if (e.scale.y !== 1) b.tag(42, e.scale.y);
    if (e.rotation) b.tag(50, e.rotation / DEG);
    if (e.grid && (e.grid.columns > 1 || e.grid.rows > 1)) {
      b.tag(70, e.grid.columns);
      b.tag(71, e.grid.rows);
      b.tag(44, e.grid.columnSpacing);
      b.tag(45, e.grid.rowSpacing);
    }
    if (def.dynamic) {
      const xd = instanceXdata(userBlockNames.get(def.id)!, e.dynamic);
      if (xd.reduce((n, [, v]) => n + v.length, 0) > 12000) report.warnings.push(`Instancia de «${def.name}» con estado demasiado grande: se exporta solo como variante estática.`);
      else for (const [c, v] of xd) b.tag(c, c === 1070 ? Number(v) : v);
    }
    ok('INSERT');
    if (!attrs.length) return;
    for (const a of attrs) {
      head(o, 'ATTRIB', { ...e, layer: a.def.layer === 'layer-0' ? e.layer : a.def.layer }, H.next(), handle);
      writeTextBody(b, a.position, undefined, ctx.resolveFields(a.text, e), a.height, a.rotation, 1, 0, a.def.style, 'left', 'baseline');
      b.tag(100, 'AcDbAttribute');
      b.tag(280, 0);
      b.tag(2, dxfName(a.tag, 'TAG').replace(/\s/g, '_'));
      b.tag(70, 0);
      b.tag(280, a.def.lockPosition ? 1 : 0);
      ok('ATTRIB');
    }
    b.tag(0, 'SEQEND');
    b.tag(5, H.next());
    b.tag(330, handle);
    b.tag(100, 'AcDbEntity');
    if (o.paper) b.tag(67, 1);
    b.tag(8, layerNames.get(e.layer) ?? '0');
  }

  function writeDimension(o: OwnerCtx, e: DimensionEntity) {
    if (e.dimType === 'arclength') {
      for (const p of explodeItems(e, buildDimension(e, ctx).items, ctx)) writeEntity(o, p);
      return transformed('DIMENSION (longitud de arco)', 'Las cotas de longitud de arco se exportan descompuestas (ARC_DIMENSION no se genera).');
    }
    const geom = buildDimension(e, ctx);
    // bloque anónimo con la representación exacta
    const bname = `*D${++dimBlockSeq}`;
    const db = newBlock(bname, 1, { x: 0, y: 0 });
    const dbo: OwnerCtx = { br: db.br, paper: false, buf: db.buf };
    for (const p of explodeItems(e, geom.items, ctx)) writeEntity(dbo, p);
    const handle = head(o, 'DIMENSION', e);
    setHandle(e, handle);
    const b = o.buf;
    const typeCode = { linear: 0, aligned: 1, angular: 2, diametric: 3, radial: 4, angular3p: 5, ordinate: 6, arclength: 0 }[e.dimType];
    const textPos = e.textPosition ?? geom.textPosition ?? e.p3;
    b.tag(100, 'AcDbDimension');
    b.tag(280, 0);
    b.tag(2, bname);
    b.tag(3, dimNames.get(e.style) ?? 'Standard');
    const defPoint = e.dimType === 'radial' || e.dimType === 'angular3p' ? (e.dimType === 'radial' ? (e.center ?? e.p2) : (e.arcPoint ?? e.p3)) : e.dimType === 'diametric' ? e.p3 : e.dimType === 'angular' ? (e.p4 ?? e.p3) : e.dimType === 'ordinate' ? (e.origin ?? { x: 0, y: 0 }) : e.p3;
    b.point(10, defPoint);
    b.point(11, textPos);
    b.tag(70, typeCode | 32 | (e.textPosition ? 128 : 0) | (e.dimType === 'ordinate' && e.axis === 'x' ? 64 : 0));
    b.tag(71, 5);
    b.tag(1, e.textOverride ?? '');
    if (Number.isFinite(geom.measurement)) b.tag(42, geom.measurement);
    switch (e.dimType) {
      case 'linear':
      case 'aligned':
        b.tag(100, 'AcDbAlignedDimension');
        b.point(13, e.p1);
        b.point(14, e.p2);
        if (e.dimType === 'linear') {
          b.tag(50, e.rotation / DEG);
          b.tag(100, 'AcDbRotatedDimension');
        }
        break;
      case 'angular':
        b.tag(100, 'AcDb2LineAngularDimension');
        b.point(13, e.p1);
        b.point(14, e.p2);
        b.point(15, e.p3);
        b.point(16, e.arcPoint ?? textPos);
        break;
      case 'angular3p':
        b.tag(100, 'AcDb3PointAngularDimension');
        b.point(13, e.p1);
        b.point(14, e.p2);
        b.point(15, e.center ?? { x: 0, y: 0 });
        break;
      case 'radial':
        b.tag(100, 'AcDbRadialDimension');
        b.point(15, e.p1);
        b.tag(40, dist(e.p1, textPos));
        break;
      case 'diametric':
        b.tag(100, 'AcDbDiametricDimension');
        b.point(15, e.p1);
        b.tag(40, 0);
        break;
      case 'ordinate':
        b.tag(100, 'AcDbOrdinateDimension');
        b.point(13, e.p1);
        b.point(14, e.p2);
        break;
    }
    if (e.assoc?.length) transformed('Asociatividad de cotas', 'Las cotas se exportan con su geometría actual; la asociatividad con los objetos no se conserva.');
    return ok('DIMENSION');
  }

  let viewportSeq = 1;
  function writeViewport(o: OwnerCtx, e: ViewportEntity) {
    if (!o.paper) return ignored('VIEWPORT', 'Viewport fuera de una presentación.');
    let clipHandle: string | null = null;
    if (e.clipBoundary && e.clipBoundary.length > 2) clipHandle = writeLwPolyline(o, { ...e, visible: true }, e.clipBoundary, true);
    const handle = head(o, 'VIEWPORT', e);
    setHandle(e, handle);
    const b = o.buf;
    b.tag(100, 'AcDbViewport');
    b.point(10, e.center);
    b.tag(40, e.width);
    b.tag(41, e.height);
    b.tag(68, e.on ? 1 : 0);
    b.tag(69, ++viewportSeq);
    b.point2(12, e.viewCenter);
    b.point2(13, { x: 0, y: 0 });
    b.point2(14, { x: 10, y: 10 });
    b.point2(15, { x: 10, y: 10 });
    b.point(16, { x: 0, y: 0 }, 1);
    b.point(17, { x: 0, y: 0 }, 0);
    b.tag(42, 50);
    b.tag(43, 0);
    b.tag(44, 0);
    b.tag(45, e.height / (e.scale || 1));
    b.tag(50, 0);
    b.tag(51, e.viewTwist / DEG);
    b.tag(72, 1000);
    for (const lid of e.frozenLayers) {
      const lh = layerHandles.get(lid);
      if (lh) b.tag(331, lh);
    }
    if (clipHandle) b.tag(340, clipHandle);
    b.tag(90, 32864 | (e.displayLocked ? 16384 : 0) | (clipHandle ? 65536 : 0));
    b.tag(1, '');
    b.tag(281, 0);
    b.tag(71, 1);
    b.tag(74, 0);
    b.point(110, { x: 0, y: 0 });
    b.point(111, { x: 1, y: 0 });
    b.point(112, { x: 0, y: 1 });
    b.tag(79, 0);
    b.tag(146, 0);
    if (Object.keys(e.layerOverrides ?? {}).length) transformed('VIEWPORT (sobrescrituras de capa)', 'Las sobrescrituras de color/tipo/grosor por viewport no se exportan; la congelación por viewport sí.');
    return ok('VIEWPORT');
  }

  // ------------------------------------------------------------------ recorrido de espacios
  const modelCtx: OwnerCtx = { br: model.br, paper: false, buf: new TagBuffer() };
  for (const e of doc.entitiesOf(MODEL_SPACE_ID)) writeEntity(modelCtx, e);
  const firstLayoutCtx: OwnerCtx | null = layouts.length ? { br: paperBlocks.get(layouts[0].id)!.br, paper: true, buf: new TagBuffer() } : null;
  layouts.forEach((l, i) => {
    const pb = paperBlocks.get(l.id)!;
    const oc: OwnerCtx = i === 0 ? firstLayoutCtx! : { br: pb.br, paper: true, buf: pb.buf };
    for (const e of doc.entitiesOf(l.id)) writeEntity(oc, e);
  });
  for (const def of data.blocks.values()) {
    const ub = userBlocks.get(def.id)!;
    const oc: OwnerCtx = { br: ub.br, paper: false, buf: ub.buf };
    for (const e of doc.entitiesOf(def.id)) writeEntity(oc, e);
  }
  // definiciones dinámicas propias de FModel (XRECORD con IDs de entidad → handles)
  const dynRecords = [...data.blocks.values()]
    .filter((d) => d.dynamic)
    .map((d) => ({ name: userBlockNames.get(d.id)!, handle: H.next(), json: encodeDefinition(d.dynamic!, (id) => entityHandles.get(id)) }));
  const fmDict = dynRecords.length ? H.next() : '';
  report.blocks = data.blocks.size + variantBlocks.size;
  report.layouts = layouts.length;

  const groupsOut = [...data.groups.values()].map((g) => ({
    name: dxfName(g.name, 'Grupo'),
    handle: groupHandles.get(g.id)!,
    description: g.description,
    selectable: g.selectable,
    members: g.members.map((id) => entityHandles.get(id)).filter((h): h is string => !!h),
  }));
  if (images.length) {
    OBJ.imageDict = H.next();
    OBJ.imageVars = H.next();
  }
  if (wipeouts) OBJ.wipeoutVars = H.next();

  // ------------------------------------------------------------------ extensión del modelo
  const ext = emptyBox();
  for (const e of doc.entitiesOf(MODEL_SPACE_ID)) {
    try {
      const eb = kindOf(e).bbox(e, ctx);
      if (Number.isFinite(eb.minX) && Number.isFinite(eb.maxX)) expandBox(ext, eb);
    } catch {
      /* sin caja */
    }
  }

  // ------------------------------------------------------------------ escritura final
  const out = new TagBuffer();
  const t = (c: number, v: string | number | boolean) => out.tag(c, v);
  const hvar = (name: string, code: number, value: string | number) => {
    t(9, name);
    t(code, value);
  };
  const hpoint = (name: string, p: Vec2, z = true) => {
    t(9, name);
    if (z) out.point(10, p);
    else out.point2(10, p);
  };

  // HEADER (el $HANDSEED se escribe al final con el valor definitivo)
  t(0, 'SECTION');
  t(2, 'HEADER');
  hvar('$ACADVER', 1, 'AC1024');
  hvar('$ACADMAINTVER', 70, 6);
  hvar('$DWGCODEPAGE', 3, 'ANSI_1252');
  hvar('$LASTSAVEDBY', 1, 'FModel 2D CAD');
  hpoint('$INSBASE', { x: 0, y: 0 });
  hpoint('$EXTMIN', isEmptyBox(ext) ? { x: 0, y: 0 } : { x: ext.minX, y: ext.minY });
  hpoint('$EXTMAX', isEmptyBox(ext) ? { x: 0, y: 0 } : { x: ext.maxX, y: ext.maxY });
  hpoint('$LIMMIN', { x: 0, y: 0 }, false);
  hpoint('$LIMMAX', { x: 420, y: 297 }, false);
  hvar('$LTSCALE', 40, s.ltscale || 1);
  hvar('$PSLTSCALE', 70, s.psltscale ? 1 : 0);
  hvar('$TEXTSIZE', 40, s.textHeight || 2.5);
  hvar('$TEXTSTYLE', 7, styleName(s.currentTextStyle));
  hvar('$CLAYER', 8, layerNames.get(s.currentLayer) ?? '0');
  hvar('$CELTYPE', 6, ltName(s.currentLinetype));
  hvar('$DIMSTYLE', 2, dimNames.get(s.currentDimStyle) ?? 'Standard');
  hvar('$LUNITS', 70, LUNITS[s.linearFormat] ?? 2);
  hvar('$LUPREC', 70, s.linearPrecision);
  hvar('$AUNITS', 70, AUNITS[s.angleFormat] ?? 0);
  hvar('$AUPREC', 70, s.anglePrecision);
  hvar('$ANGBASE', 50, s.angleBase / DEG);
  hvar('$PDMODE', 70, s.pointDisplay.mode);
  hvar('$PDSIZE', 40, s.pointDisplay.size);
  hvar('$INSUNITS', 70, INSUNITS_CODE[s.units] ?? 0);
  hvar('$MEASUREMENT', 70, ['in', 'ft', 'yd', 'mi'].includes(s.units) ? 0 : 1);
  hvar('$LWDISPLAY', 290, 0);
  const handSeedIndex = out.lines.length;
  hvar('$HANDSEED', 5, 'FFFF');
  t(0, 'ENDSEC');

  // CLASSES
  t(0, 'SECTION');
  t(2, 'CLASSES');
  const cls = (dxf: string, cpp: string, app: string, flags: number, entity: boolean) => {
    t(0, 'CLASS');
    t(1, dxf);
    t(2, cpp);
    t(3, app);
    t(90, flags);
    t(91, 0);
    t(280, 0);
    t(281, entity ? 1 : 0);
  };
  cls('ACDBDICTIONARYWDFLT', 'AcDbDictionaryWithDefault', 'ObjectDBX Classes', 0, false);
  cls('ACDBPLACEHOLDER', 'AcDbPlaceHolder', 'ObjectDBX Classes', 0, false);
  cls('LAYOUT', 'AcDbLayout', 'ObjectDBX Classes', 0, false);
  if (wipeouts) {
    cls('WIPEOUT', 'AcDbWipeout', 'WipeOut|AutoCAD Express Tool|expresstools@autodesk.com', 127, true);
    cls('WIPEOUTVARIABLES', 'AcDbWipeoutVariables', 'WipeOut|AutoCAD Express Tool|expresstools@autodesk.com', 0, false);
  }
  if (images.length) {
    cls('IMAGE', 'AcDbRasterImage', 'ISM', 2175, true);
    cls('IMAGEDEF', 'AcDbRasterImageDef', 'ISM', 0, false);
    cls('IMAGEDEF_REACTOR', 'AcDbRasterImageDefReactor', 'ISM', 1, false);
    cls('RASTERVARIABLES', 'AcDbRasterVariables', 'ISM', 0, false);
  }
  t(0, 'ENDSEC');

  // TABLES
  t(0, 'SECTION');
  t(2, 'TABLES');
  const table = (name: keyof typeof T, count: number, body: () => void, dimstyle = false) => {
    t(0, 'TABLE');
    t(2, name);
    t(5, T[name]);
    t(330, '0');
    t(100, 'AcDbSymbolTable');
    t(70, count);
    if (dimstyle) t(100, 'AcDbDimStyleTable');
    body();
    t(0, 'ENDTAB');
  };
  const record = (type: string, handle: string, table: string, subclass: string, name: string, flags = 0, handleCode = 5) => {
    t(0, type);
    t(handleCode, handle);
    t(330, table);
    t(100, 'AcDbSymbolTableRecord');
    t(100, subclass);
    t(2, name);
    t(70, flags);
  };

  table('VPORT', 1, () => {
    record('VPORT', H.next(), T.VPORT, 'AcDbViewportTableRecord', '*Active');
    const c = isEmptyBox(ext) ? { x: 0, y: 0 } : { x: (ext.minX + ext.maxX) / 2, y: (ext.minY + ext.maxY) / 2 };
    out.point2(10, { x: 0, y: 0 });
    out.point2(11, { x: 1, y: 1 });
    out.point2(12, c);
    out.point2(13, { x: 0, y: 0 });
    out.point2(14, { x: 10, y: 10 });
    out.point2(15, { x: 10, y: 10 });
    out.point(16, { x: 0, y: 0 }, 1);
    out.point(17, { x: 0, y: 0 }, 0);
    t(40, isEmptyBox(ext) ? 297 : Math.max(ext.maxY - ext.minY, 1) * 1.1);
    t(41, 1.6);
    t(42, 50);
    t(43, 0);
    t(44, 0);
    t(50, 0);
    t(51, 0);
    t(71, 0);
    t(72, 1000);
    t(73, 1);
    t(74, 3);
    t(75, 0);
    t(76, 0);
    t(77, 0);
    t(78, 0);
    t(281, 0);
    t(65, 1);
  });

  const lts = [...data.linetypes.values()].filter((lt) => lt.id !== LT_CONTINUOUS_ID);
  table('LTYPE', lts.length + 3, () => {
    for (const [name, handle] of [
      ['ByBlock', H.next()],
      ['ByLayer', H.next()],
      ['Continuous', ltHandles.get(LT_CONTINUOUS_ID) ?? H.next()],
    ] as const) {
      record('LTYPE', handle, T.LTYPE, 'AcDbLinetypeTableRecord', name);
      t(3, name === 'Continuous' ? 'Solid line' : '');
      t(72, 65);
      t(73, 0);
      t(40, 0);
    }
    for (const lt of lts) {
      record('LTYPE', ltHandles.get(lt.id)!, T.LTYPE, 'AcDbLinetypeTableRecord', ltNames.get(lt.id)!);
      t(3, lt.description);
      t(72, 65);
      t(73, lt.pattern.length);
      t(40, lt.pattern.reduce((a, v) => a + Math.abs(v), 0));
      for (const v of lt.pattern) {
        t(49, v);
        t(74, 0);
      }
    }
  });

  const layerList = [...data.layers.values()].sort((a, b) => a.order - b.order);
  const hasZero = layerList.some((l) => l.name === '0');
  table('LAYER', layerList.length + (hasZero ? 0 : 1), () => {
    if (!hasZero) {
      record('LAYER', H.next(), T.LAYER, 'AcDbLayerTableRecord', '0');
      t(62, 7);
      t(6, 'Continuous');
      t(370, -3);
      t(390, OBJ.placeholder);
    }
    for (const l of layerList) {
      record('LAYER', layerHandles.get(l.id)!, T.LAYER, 'AcDbLayerTableRecord', layerNames.get(l.id)!, (l.frozen ? 1 : 0) | (l.newViewportFrozen ? 2 : 0) | (l.locked ? 4 : 0));
      const aci = l.color.startsWith('aci:') ? Number(l.color.slice(4)) || 7 : l.color.startsWith('#') ? nearestAci(l.color) : 7;
      t(62, l.on ? aci : -aci);
      if (l.color.startsWith('#')) t(420, trueColorInt(l.color));
      t(6, ltName(l.linetype));
      if (!l.plot) t(290, 0);
      t(370, l.lineweight);
      t(390, OBJ.placeholder);
      if (l.transparency > 0) {
        t(1001, 'AcCmTransparency');
        t(1071, transparencyCode(l.transparency));
      }
      if (l.description) {
        t(1001, 'AcAecLayerStandard');
        t(1000, '');
        t(1000, l.description);
      }
    }
  });

  const styles = [...data.textStyles.values()];
  table('STYLE', styles.length, () => {
    for (const st of styles) {
      record('STYLE', styleHandles.get(st.id)!, T.STYLE, 'AcDbTextStyleTableRecord', styleNames.get(st.id)!);
      t(40, st.height);
      t(41, st.widthFactor || 1);
      t(50, st.oblique / DEG);
      t(71, 0);
      t(42, st.height || s.textHeight || 2.5);
      const f = st.font.trim();
      t(3, /\.(shx|ttf|otf)$/i.test(f) ? f : /mono|courier/i.test(f) ? 'cour.ttf' : /serif|times/i.test(f) && !/sans/i.test(f) ? 'times.ttf' : 'arial.ttf');
      t(4, '');
    }
  });
  if (styles.some((st) => !/\.(shx|ttf|otf)$/i.test(st.font.trim()))) transformed('Fuentes', 'Las fuentes web (Inter, IBM Plex…) se asignan a arial.ttf, cour.ttf o times.ttf en los estilos DXF.');

  table('VIEW', 0, () => {});
  table('UCS', 0, () => {});

  const appids = ['ACAD', 'AcCmTransparency', 'AcAecLayerStandard', FMODEL_APPID];
  table('APPID', appids.length, () => {
    for (const a of appids) record('APPID', H.next(), T.APPID, 'AcDbRegAppTableRecord', a);
  });

  // bloques de flecha usados por los estilos
  const arrowBlocks = new Map<string, BlockOut>();
  const arrowBlock = (type: ArrowType): string | null => {
    const bn = ARROW_BLOCKS[type];
    if (!bn) return null;
    let blk = arrowBlocks.get(bn);
    if (!blk) {
      blk = newBlock(bn, 0, { x: 0, y: 0 });
      arrowBlocks.set(bn, blk);
      if (bn !== '_NONE') {
        const bo: OwnerCtx = { br: blk.br, paper: false, buf: blk.buf };
        const base = { layer: [...data.layers.values()].find((l) => l.name === '0')?.id ?? '', color: 'ByBlock', linetype: 'ByBlock', linetypeScale: 1, lineweight: -2, transparency: 'ByLayer' as const, visible: true };
        head(bo, 'LINE', base);
        bo.buf.tag(100, 'AcDbLine');
        bo.buf.point(10, { x: -0.5, y: -0.5 });
        bo.buf.point(11, { x: 0.5, y: 0.5 });
      }
    }
    return blk.br;
  };

  const dimstyles = [...data.dimStyles.values()];
  const dsArrows = new Map<Id, [string | null, string | null]>();
  for (const ds of dimstyles) dsArrows.set(ds.id, [arrowBlock(ds.arrow1), arrowBlock(ds.arrow2)]);
  if (dimstyles.some((ds) => ![ds.arrow1, ds.arrow2].every((a) => a === 'closed-filled' || ARROW_BLOCKS[a]))) {
    transformed('DIMSTYLE (flechas)', 'Las flechas abierta, punto, cerrada vacía e integral se declaran como cerrada rellena en el estilo; la geometría exportada de cada cota conserva su flecha real.');
  }
  table(
    'DIMSTYLE',
    dimstyles.length,
    () => {
      for (const ds of dimstyles) writeDimStyle(ds);
    },
    true,
  );

  function writeDimStyle(ds: DimStyleRecord) {
    record('DIMSTYLE', dimHandles.get(ds.id)!, T.DIMSTYLE, 'AcDbDimStyleTableRecord', dimNames.get(ds.id)!, 0, 105);
    const [a1, a2] = dsArrows.get(ds.id) ?? [null, null];
    t(3, `${ds.prefix}<>${ds.suffix}`);
    t(40, ds.overallScale || 1);
    t(41, ds.arrowSize);
    t(42, ds.extLineOffset);
    t(43, ds.baselineSpacing);
    t(44, ds.extLineExtension);
    t(45, ds.roundOff);
    t(46, ds.dimLineExtension);
    t(47, ds.tolUpper);
    t(48, ds.tolLower);
    t(140, ds.textHeight);
    t(141, ds.centerMark);
    t(144, ds.linearFactor || 1);
    t(146, ds.tolHeightFactor || 1);
    t(147, ds.textGap);
    t(71, ds.tolerance === 'symmetrical' || ds.tolerance === 'deviation' ? 1 : 0);
    t(72, ds.tolerance === 'limits' ? 1 : 0);
    t(73, ds.textAlignment === 'horizontal' ? 1 : 0);
    t(74, ds.textAlignment === 'horizontal' ? 1 : 0);
    t(75, ds.suppressExt1 ? 1 : 0);
    t(76, ds.suppressExt2 ? 1 : 0);
    t(77, ds.textVertical === 'above' ? 1 : 0);
    t(78, (ds.suppressLeadingZeros ? 4 : 0) | (ds.suppressTrailingZeros ? 8 : 0));
    t(69, ds.textFill === 'background' ? 1 : 0);
    t(170, ds.altUnits ? 1 : 0);
    t(143, ds.altFactor || 25.4);
    t(171, ds.altPrecision);
    t(4, `${ds.altPrefix}[]${ds.altSuffix}`);
    const colorCode = (c: ColorValue) => (c === 'ByBlock' ? 0 : c === 'ByLayer' ? 256 : c.startsWith('aci:') ? Number(c.slice(4)) : c.startsWith('#') ? nearestAci(c) : 256);
    t(176, colorCode(ds.dimColor));
    t(177, colorCode(ds.extColor));
    t(178, colorCode(ds.textColor));
    t(179, ds.anglePrecision);
    t(271, ds.precision);
    t(272, ds.tolPrecision);
    t(275, AUNITS[ds.angleFormat] ?? 0);
    t(277, LUNITS[ds.unitFormat] ?? 2);
    t(278, ds.decimalSeparator === ',' ? 44 : 46);
    t(371, ds.dimLineweight);
    t(372, ds.extLineweight);
    const txsty = styleHandles.get(ds.textStyle);
    if (txsty) t(340, txsty);
    if (a1 || a2) {
      t(173, 1);
      if (a1) t(343, a1);
      if (a2) t(344, a2);
    }
  }

  const allBlocks = blocks;
  table('BLOCK_RECORD', allBlocks.length, () => {
    for (const b of allBlocks) {
      record('BLOCK_RECORD', b.br, T.BLOCK_RECORD, 'AcDbBlockTableRecord', b.name);
      t(340, b.layout ?? '0');
      t(70, INSUNITS_CODE[b.units] ?? 0);
      t(280, b.explodable ? 1 : 0);
      t(281, b.scaleUniformly ? 1 : 0);
    }
  });
  t(0, 'ENDSEC');

  // BLOCKS
  t(0, 'SECTION');
  t(2, 'BLOCKS');
  for (const b of allBlocks) {
    const paper = b.name.toUpperCase().startsWith('*PAPER_SPACE');
    t(0, 'BLOCK');
    t(5, b.blockHandle);
    t(330, b.br);
    t(100, 'AcDbEntity');
    if (paper) t(67, 1);
    t(8, '0');
    t(100, 'AcDbBlockBegin');
    t(2, b.name);
    t(70, b.flags);
    out.point(10, b.base);
    t(3, b.name);
    t(1, '');
    if (b.description) t(4, b.description);
    out.append(b.buf);
    t(0, 'ENDBLK');
    t(5, b.endHandle);
    t(330, b.br);
    t(100, 'AcDbEntity');
    if (paper) t(67, 1);
    t(8, '0');
    t(100, 'AcDbBlockEnd');
  }
  t(0, 'ENDSEC');

  // ENTITIES
  t(0, 'SECTION');
  t(2, 'ENTITIES');
  out.append(modelCtx.buf);
  if (firstLayoutCtx) out.append(firstLayoutCtx.buf);
  t(0, 'ENDSEC');

  // OBJECTS
  t(0, 'SECTION');
  t(2, 'OBJECTS');
  const dict = (handle: string, owner: string, entries: [string, string][]) => {
    t(0, 'DICTIONARY');
    t(5, handle);
    t(330, owner);
    t(100, 'AcDbDictionary');
    t(281, 1);
    for (const [k, v] of entries) {
      t(3, k);
      t(350, v);
    }
  };
  const rootEntries: [string, string][] = [
    ['ACAD_GROUP', OBJ.group],
    ['ACAD_LAYOUT', OBJ.layout],
    ['ACAD_MLINESTYLE', OBJ.mlinestyleDict],
    ['ACAD_PLOTSETTINGS', OBJ.plotSettings],
    ['ACAD_PLOTSTYLENAME', OBJ.plotStyleName],
  ];
  if (images.length) {
    rootEntries.push(['ACAD_IMAGE_DICT', OBJ.imageDict], ['ACAD_IMAGE_VARS', OBJ.imageVars]);
  }
  if (wipeouts) rootEntries.push(['ACAD_WIPEOUT_VARS', OBJ.wipeoutVars]);
  if (fmDict) rootEntries.push([FMODEL_DYN_DICT, fmDict]);
  dict(OBJ.root, '0', rootEntries);
  dict(
    OBJ.group,
    OBJ.root,
    groupsOut.map((g) => [g.name, g.handle]),
  );
  const layoutEntries: [string, string][] = [['Model', modelLayoutHandle]];
  layouts.forEach((l) => layoutEntries.push([dxfName(l.name, 'Layout'), layoutHandles.get(l.id)!]));
  if (!layouts.length) layoutEntries.push(['Layout1', layoutHandles.get('*fm-default-layout')!]);
  dict(OBJ.layout, OBJ.root, layoutEntries);
  dict(OBJ.mlinestyleDict, OBJ.root, [['Standard', OBJ.mlineStandard]]);
  dict(OBJ.plotSettings, OBJ.root, []);
  if (fmDict) {
    dict(fmDict, OBJ.root, dynRecords.map((r): [string, string] => [r.name, r.handle]));
    for (const r of dynRecords) {
      t(0, 'XRECORD');
      t(5, r.handle);
      t(330, fmDict);
      t(100, 'AcDbXrecord');
      for (const [c, v] of xrecordBody(r.name, r.json)) t(c, c === 280 || c === 90 ? Number(v) : v);
    }
  }
  t(0, 'ACDBDICTIONARYWDFLT');
  t(5, OBJ.plotStyleName);
  t(330, OBJ.root);
  t(100, 'AcDbDictionary');
  t(281, 1);
  t(3, 'Normal');
  t(350, OBJ.placeholder);
  t(100, 'AcDbDictionaryWithDefault');
  t(340, OBJ.placeholder);
  t(0, 'ACDBPLACEHOLDER');
  t(5, OBJ.placeholder);
  t(330, OBJ.plotStyleName);

  t(0, 'MLINESTYLE');
  t(5, OBJ.mlineStandard);
  t(330, OBJ.mlinestyleDict);
  t(100, 'AcDbMlineStyle');
  t(2, 'Standard');
  t(70, 0);
  t(3, '');
  t(62, 256);
  t(51, 90);
  t(52, 90);
  t(71, 2);
  t(49, 0.5);
  t(62, 256);
  t(6, 'BYLAYER');
  t(49, -0.5);
  t(62, 256);
  t(6, 'BYLAYER');

  for (const g of groupsOut) {
    t(0, 'GROUP');
    t(5, g.handle);
    t(330, OBJ.group);
    t(100, 'AcDbGroup');
    t(300, g.description);
    t(70, 0);
    t(71, g.selectable ? 1 : 0);
    for (const m of g.members) t(340, m);
  }

  const writeLayout = (handle: string, name: string, tab: number, br: string, page: PageSetup | null, isModel: boolean) => {
    const p = page;
    t(0, 'LAYOUT');
    t(5, handle);
    t(330, OBJ.layout);
    t(100, 'AcDbPlotSettings');
    t(1, '');
    t(2, 'none_device');
    t(4, p ? paperName(p) : 'ISO_A3_(297.00_x_420.00_MM)');
    t(6, '');
    t(40, p?.margins.left ?? 7.5);
    t(41, p?.margins.bottom ?? 20);
    t(42, p?.margins.right ?? 7.5);
    t(43, p?.margins.top ?? 20);
    const ext2 = p ? paperExtents(p) : { width: 420, height: 297 };
    t(44, Math.min(ext2.width, ext2.height));
    t(45, Math.max(ext2.width, ext2.height));
    t(46, p?.offset.x ?? 0);
    t(47, p?.offset.y ?? 0);
    t(48, p?.window?.min.x ?? 0);
    t(49, p?.window?.min.y ?? 0);
    t(140, p?.window?.max.x ?? 0);
    t(141, p?.window?.max.y ?? 0);
    // escala personalizada: 142 mm de papel por 143 unidades de dibujo
    const scaled = !!p && (p.plotArea === 'layout' || p.plotScale > 0);
    t(142, p && p.plotScale > 0 && p.plotArea !== 'layout' ? p.plotScale : 1);
    t(143, 1);
    t(70, (isModel ? 1024 : 0) | (p?.center ? 4 : 0) | (p?.plotLineweights ? 128 : 0) | (p?.plotPaperspaceLast ? 512 : 0));
    t(72, 1);
    t(73, p?.orientation === 'landscape' ? 1 : 0);
    t(74, !p ? 5 : p.plotArea === 'layout' ? 5 : p.plotArea === 'extents' ? 1 : 4);
    t(7, p?.plotStyle === 'monochrome' ? 'monochrome.ctb' : p?.plotStyle === 'grayscale' ? 'grayscale.ctb' : '');
    t(75, scaled ? 16 : 0);
    t(76, 0);
    t(77, 2);
    t(78, 300);
    t(147, 1);
    t(148, 0);
    t(149, 0);
    t(100, 'AcDbLayout');
    t(1, name);
    t(70, 1);
    t(71, tab);
    out.point2(10, { x: 0, y: 0 });
    out.point2(11, { x: ext2.width, y: ext2.height });
    out.point(12, { x: 0, y: 0 });
    out.point(14, { x: 1e20, y: 1e20 }, 1e20);
    out.point(15, { x: -1e20, y: -1e20 }, -1e20);
    t(146, 0);
    out.point(13, { x: 0, y: 0 });
    out.point(16, { x: 1, y: 0 });
    out.point(17, { x: 0, y: 1 });
    t(76, 1);
    t(330, br);
  };
  writeLayout(modelLayoutHandle, 'Model', 0, model.br, doc.settings.modelPage ?? null, true);
  layouts.forEach((l: LayoutRecord, i) => writeLayout(layoutHandles.get(l.id)!, dxfName(l.name, 'Layout'), i + 1, paperBlocks.get(l.id)!.br, l.page, false));
  if (!layouts.length) writeLayout(layoutHandles.get('*fm-default-layout')!, 'Layout1', 1, paperBlocks.get('*fm-default-layout')!.br, null, false);

  if (images.length) {
    dict(
      OBJ.imageDict,
      OBJ.root,
      images.map((im) => [im.name, im.defHandle]),
    );
    t(0, 'RASTERVARIABLES');
    t(5, OBJ.imageVars);
    t(330, OBJ.root);
    t(100, 'AcDbRasterVariables');
    t(90, 0);
    t(70, 1);
    t(71, 1);
    t(72, INSUNITS_CODE[s.units] === 4 ? 1 : 0);
    for (const im of images) {
      t(0, 'IMAGEDEF');
      t(5, im.defHandle);
      t(330, OBJ.imageDict);
      t(100, 'AcDbRasterImageDef');
      t(90, 0);
      t(1, im.path);
      out.point2(10, { x: im.w, y: im.h });
      out.point2(11, { x: 1, y: 1 });
      t(280, 1);
      t(281, 0);
      t(0, 'IMAGEDEF_REACTOR');
      t(5, im.reactor);
      t(330, im.handle);
      t(100, 'AcDbRasterImageDefReactor');
      t(90, 2);
      t(330, im.handle);
    }
  }
  if (wipeouts) {
    t(0, 'WIPEOUTVARIABLES');
    t(5, OBJ.wipeoutVars);
    t(330, OBJ.root);
    t(100, 'AcDbWipeoutVariables');
    t(70, 0);
  }
  t(0, 'ENDSEC');
  t(0, 'EOF');

  out.lines[handSeedIndex + 3] = H.seed;
  return { text: out.toString(), report };
}

/** Nombres de tipo legibles para el informe (mismas claves que el importador). */
export function exportSummary(r: DxfExportReport): { es: string; en: string } {
  const n = Object.values(r.exported).reduce((a, b) => a + b, 0);
  const tr = Object.values(r.transformed).reduce((a, b) => a + b.count, 0);
  const ig = Object.values(r.ignored).reduce((a, b) => a + b.count, 0);
  return {
    es: `DXF R2010: ${n} objeto(s) nativos, ${tr} conversión(es), ${ig} omitido(s); ${r.blocks} bloque(s), ${r.layouts} presentación(es).`,
    en: `DXF R2010: ${n} native object(s), ${tr} conversion(s), ${ig} skipped; ${r.blocks} block(s), ${r.layouts} layout(s).`,
  };
}
