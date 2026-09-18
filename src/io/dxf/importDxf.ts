import { TAU, DEG } from '../../geometry/angle';
import { splineThroughPoints } from '../../geometry/spline';
import type { Vec2 } from '../../geometry/vec';
import { normalize } from '../../geometry/vec';
import type { CadDocument } from '../../document/document';
import { createDocumentData, defaultPageSetup, DIMSTYLE_ISO_ID, ISO_DIMSTYLE, LAYER0_ID, LT_CONTINUOUS_ID, PAPER_SIZES, TEXTSTYLE_STANDARD_ID } from '../../document/defaults';
import { newId } from '../../document/ids';
import type {
  ArrowType,
  BlockRecord,
  DimensionEntity,
  DimType,
  DrawingUnits,
  Entity,
  EntityBase,
  HatchEntity,
  Id,
  LayerRecord,
  Loop,
  MTextAttachment,
  TextEntity,
} from '../../document/types';
import { MODEL_SPACE_ID } from '../../document/types';
import type { DxfFile, DxfRecord } from './parser';
import { parseDxf, R } from './parser';
import { decodeDefinition, readInstanceXdata, readXrecord } from './dynamicData';
import { acadIndex, anonymousRepresentations, instanceNodes, readAcadDynamicBlocks } from './acadDynamic';
import type { PolyVertex } from '../../geometry/polyline';
import { curvesToVertices } from '../../geometry/polyline';
import type { Curve } from '../../geometry/curves';

export interface ImportReport {
  version: string;
  units: DrawingUnits;
  imported: Record<string, number>;
  transformed: Record<string, { count: number; reason: string }>;
  ignored: Record<string, { count: number; reason: string }>;
  layers: number;
  blocks: number;
  layouts: number;
  warnings: string[];
  summary: { es: string; en: string };
}

const INSUNITS: Record<number, DrawingUnits> = { 0: 'unitless', 1: 'in', 2: 'ft', 3: 'mi', 4: 'mm', 5: 'cm', 6: 'm', 7: 'km', 10: 'yd' };

const ARROWS: Record<string, ArrowType> = { '': 'closed-filled', _CLOSEDBLANK: 'closed', _CLOSED: 'closed', _OPEN: 'open', _OPEN30: 'open30', _DOT: 'dot', _DOTSMALL: 'dot-small', _OBLIQUE: 'tick', _ARCHTICK: 'architectural', _INTEGRAL: 'integral', _NONE: 'none' };

export function importDxfIntoDocument(doc: CadDocument, text: string, opts: { replace?: boolean; owner?: Id } = {}): ImportReport {
  return importDxfFile(doc, parseDxf(text), opts);
}

/**
 * Importa la estructura intermedia de un DXF (o de un DWG traducido a ella) en el documento.
 * `format` solo cambia el nombre del formato en el resumen del informe.
 */
/** `acadDynamic: false` importa los bloques dinámicos de AutoCAD como sus representaciones estáticas. */
export function importDxfFile(doc: CadDocument, dxf: DxfFile, opts: { replace?: boolean; owner?: Id; format?: 'DXF' | 'DWG'; acadDynamic?: boolean } = {}): ImportReport {
  const fmt = opts.format ?? 'DXF';
  const report: ImportReport = { version: dxf.version, units: 'mm', imported: {}, transformed: {}, ignored: {}, layers: 0, blocks: 0, layouts: 0, warnings: [], summary: { es: '', en: '' } };
  const ok = (t: string) => (report.imported[t] = (report.imported[t] ?? 0) + 1);
  const transformed = (t: string, reason: string) => {
    const r = (report.transformed[t] ??= { count: 0, reason });
    r.count++;
  };
  const ignored = (t: string, reason: string) => {
    const r = (report.ignored[t] ??= { count: 0, reason });
    r.count++;
  };

  const hv = (name: string, code: number) => dxf.header.get(name)?.find((p) => p[0] === code)?.[1]?.trim();
  const units = INSUNITS[Number(hv('$INSUNITS', 70) ?? (hv('$MEASUREMENT', 70) === '0' ? 1 : 4))] ?? 'mm';
  report.units = units;

  if (opts.replace) doc.replaceData(createDocumentData({ units, title: 'DXF' }));

  doc.transact('IMPORTDXF', (tx) => {
    const s = doc.settings;
    const settingsPatch: Partial<typeof s> = { units, insUnits: units };
    const ltscale = Number(hv('$LTSCALE', 40));
    if (Number.isFinite(ltscale) && ltscale > 0) settingsPatch.ltscale = ltscale;
    const pdmode = Number(hv('$PDMODE', 70));
    if (Number.isFinite(pdmode)) settingsPatch.pointDisplay = { mode: pdmode, size: Number(hv('$PDSIZE', 40) ?? 0) || 0 };
    const textsize = Number(hv('$TEXTSIZE', 40));
    if (Number.isFinite(textsize) && textsize > 0) settingsPatch.textHeight = textsize;
    tx.setSettings(settingsPatch);

    // ---------------------------------------------------------------- tablas
    const ltByName = new Map<string, Id>();
    for (const lt of doc.data.linetypes.values()) ltByName.set(lt.name.toUpperCase(), lt.id);
    for (const rec of dxf.tables.get('LTYPE')?.records ?? []) {
      const r = new R(rec);
      const name = r.str(2);
      if (!name || ['BYLAYER', 'BYBLOCK'].includes(name.toUpperCase())) continue;
      if (ltByName.has(name.toUpperCase())) continue;
      const pattern = r.nums(49);
      const id = newId('lt');
      tx.add('linetypes', { id, name, description: r.str(3), pattern });
      ltByName.set(name.toUpperCase(), id);
    }
    const ltId = (name: string): string => {
      const u = name.toUpperCase();
      if (!name || u === 'BYLAYER') return 'ByLayer';
      if (u === 'BYBLOCK') return 'ByBlock';
      if (u === 'CONTINUOUS') return LT_CONTINUOUS_ID;
      const id = ltByName.get(u);
      if (id) return id;
      report.warnings.push(`Tipo de línea «${name}» no definido: se usa Continuous.`);
      return LT_CONTINUOUS_ID;
    };

    const layerByName = new Map<string, Id>();
    for (const l of doc.data.layers.values()) layerByName.set(l.name.toUpperCase(), l.id);
    for (const rec of dxf.tables.get('LAYER')?.records ?? []) {
      const r = new R(rec);
      const name = r.str(2);
      if (!name) continue;
      const aci = r.num(62, 7);
      const flags = r.num(70);
      const color = r.has(420) ? trueColor(r.num(420)) : `aci:${Math.abs(aci) || 7}`;
      const props: Partial<LayerRecord> = { color, on: aci >= 0, frozen: !!(flags & 1), locked: !!(flags & 4), linetype: ltId(r.str(6, 'Continuous')) === 'ByLayer' ? LT_CONTINUOUS_ID : ltId(r.str(6, 'Continuous')), lineweight: r.has(370) ? r.num(370) : -3, plot: r.has(290) ? r.num(290) !== 0 : true, transparency: r.has(440) ? transparencyOf(r.num(440)) : 0 };
      const existing = layerByName.get(name.toUpperCase());
      if (existing) tx.update('layers', existing, props);
      else {
        const id = newId('layer');
        tx.add('layers', { id, name, description: '', order: layerByName.size, color: 'aci:7', linetype: LT_CONTINUOUS_ID, lineweight: -3, transparency: 0, on: true, frozen: false, locked: false, plot: true, ...props } as LayerRecord);
        layerByName.set(name.toUpperCase(), id);
        report.layers++;
      }
    }
    const layerId = (name: string): Id => {
      if (!name) return LAYER0_ID;
      const id = layerByName.get(name.toUpperCase());
      if (id) return id;
      const nid = newId('layer');
      tx.add('layers', { id: nid, name, description: 'Creada al importar DXF', order: layerByName.size, color: 'aci:7', linetype: LT_CONTINUOUS_ID, lineweight: -3, transparency: 0, on: true, frozen: false, locked: false, plot: true });
      layerByName.set(name.toUpperCase(), nid);
      report.layers++;
      return nid;
    };

    const styleByName = new Map<string, Id>();
    for (const st of doc.data.textStyles.values()) styleByName.set(st.name.toUpperCase(), st.id);
    for (const rec of dxf.tables.get('STYLE')?.records ?? []) {
      const r = new R(rec);
      const name = r.str(2);
      if (!name || styleByName.has(name.toUpperCase())) continue;
      const id = newId('ts');
      const font = r.str(3, 'Inter').replace(/\.(shx|ttf|otf)$/i, '');
      tx.add('textStyles', { id, name, font: /simplex|romans|txt|isocp|arial/i.test(font) ? 'Inter' : font, height: r.num(40), widthFactor: r.num(41, 1) || 1, oblique: r.num(50) * DEG, annotative: false });
      styleByName.set(name.toUpperCase(), id);
    }
    const styleId = (name: string) => styleByName.get(name.toUpperCase()) ?? TEXTSTYLE_STANDARD_ID;

    const dimByName = new Map<string, Id>();
    for (const d of doc.data.dimStyles.values()) dimByName.set(d.name.toUpperCase(), d.id);
    // flechas: DIMBLK (342) o DIMBLK1/DIMBLK2 (343/344) con DIMSAH (173) apuntan a registros de bloque
    const arrowBlockNames = new Map<string, string>();
    for (const rec of dxf.tables.get('BLOCK_RECORD')?.records ?? []) {
      const br = new R(rec);
      arrowBlockNames.set(br.str(5).toUpperCase(), br.str(2).toUpperCase());
    }
    const arrowOf = (handle: string): ArrowType => ARROWS[arrowBlockNames.get(handle.toUpperCase()) ?? ''] ?? 'closed-filled';
    for (const rec of dxf.tables.get('DIMSTYLE')?.records ?? []) {
      const r = new R(rec);
      const name = r.str(2);
      if (!name || dimByName.has(name.toUpperCase())) continue;
      const id = newId('ds');
      const post = r.str(3);
      const [prefix, suffix] = post.includes('<>') ? post.split('<>') : ['', post];
      tx.add('dimStyles', {
        ...ISO_DIMSTYLE,
        id,
        name,
        overallScale: r.num(40, 1) || 1,
        arrowSize: r.num(41, ISO_DIMSTYLE.arrowSize),
        extLineOffset: r.num(42, ISO_DIMSTYLE.extLineOffset),
        extLineExtension: r.num(44, ISO_DIMSTYLE.extLineExtension),
        baselineSpacing: r.num(43, ISO_DIMSTYLE.baselineSpacing),
        textHeight: r.num(140, ISO_DIMSTYLE.textHeight),
        centerMark: r.num(141, ISO_DIMSTYLE.centerMark),
        textGap: Math.abs(r.num(147, ISO_DIMSTYLE.textGap)),
        linearFactor: r.num(144, 1) || 1,
        precision: r.num(271, ISO_DIMSTYLE.precision),
        textVertical: r.num(77, 1) === 0 ? 'centered' : 'above',
        textAlignment: r.num(73, 0) === 1 ? 'horizontal' : 'aligned',
        decimalSeparator: r.num(278, 46) === 44 ? ',' : '.',
        prefix: prefix ?? '',
        suffix: suffix ?? '',
        tolerance: r.num(71) ? 'deviation' : 'none',
        tolUpper: r.num(47),
        tolLower: r.num(48),
        altUnits: r.num(170) === 1,
        altFactor: r.num(143, 25.4),
        roundOff: r.num(45),
        arrow1: arrowOf(r.num(173) === 1 ? r.str(343) : r.str(342)),
        arrow2: arrowOf(r.num(173) === 1 ? r.str(344) : r.str(342)),
      });
      dimByName.set(name.toUpperCase(), id);
    }
    const dimStyleId = (name: string) => dimByName.get(name.toUpperCase()) ?? doc.settings.currentDimStyle ?? DIMSTYLE_ISO_ID;

    const clayer = hv('$CLAYER', 8);
    if (clayer && layerByName.has(clayer.toUpperCase())) tx.setSettings({ currentLayer: layerByName.get(clayer.toUpperCase())! });

    // ---------------------------------------------------------------- presentaciones
    const blockRecordNameByHandle = new Map<string, string>();
    for (const rec of dxf.tables.get('BLOCK_RECORD')?.records ?? []) {
      const r = new R(rec);
      blockRecordNameByHandle.set(r.str(5), r.str(2));
    }
    const layoutByBlockName = new Map<string, Id>();
    const dxfLayouts = dxf.objects.filter((o) => o.type === 'LAYOUT').map((o) => new R(o));
    const existingLayouts = [...doc.data.layouts.values()];
    let tab = 0;
    for (const lr of dxfLayouts.sort((a, b) => a.num(71) - b.num(71))) {
      const name = lr.str(1);
      if (!name || name.toUpperCase() === 'MODEL') continue;
      const brName = blockRecordNameByHandle.get(lr.str(330)) ?? (tab === 0 ? '*Paper_Space' : `*Paper_Space${tab - 1}`);
      const w = lr.num(44);
      const h = lr.num(45);
      const size = w > 0 && h > 0 ? (PAPER_SIZES.find((p) => Math.abs(Math.min(w, h) - p.width) < 2 && Math.abs(Math.max(w, h) - p.height) < 2)?.name ?? 'ISO A3') : 'ISO A3';
      const page = { ...defaultPageSetup(size, w >= h ? 'landscape' : 'portrait') };
      const reuse = opts.replace && tab === 0 ? existingLayouts[0] : undefined;
      const id = reuse?.id ?? newId('layout');
      tx.put('layouts', { id, name, tabOrder: ++tab, page });
      layoutByBlockName.set(brName.toUpperCase(), id);
      report.layouts++;
    }
    const firstLayout = layoutByBlockName.get('*PAPER_SPACE') ?? [...doc.data.layouts.keys()][0];

    // ---------------------------------------------------------------- datos dinámicos de FModel
    const fmDynamic = new Map<string, string>();
    for (const o of dxf.objects) {
      try {
        const x = readXrecord(o);
        if (x) fmDynamic.set(x.blockName.toUpperCase(), x.json);
      } catch (err) {
        report.warnings.push(`Bloque dinámico de FModel no recuperado: ${err instanceof Error ? err.message : String(err)}; se conservan las variantes estáticas.`);
      }
    }
    // variantes estáticas usadas solo por instancias FModel recuperables: no se importan
    const variantRefs = new Map<string, boolean>();
    for (const rec of [...dxf.entities, ...dxf.blocks.flatMap((b) => b.entities)]) {
      if (rec.type !== 'INSERT') continue;
      const name = new R(rec).str(2).toUpperCase();
      const x = readInstanceXdata(rec.pairs);
      const recoverable = !!x && fmDynamic.has(x.baseName.toUpperCase()) && x.baseName.toUpperCase() !== name;
      variantRefs.set(name, (variantRefs.get(name) ?? true) && recoverable);
    }

    // bloques dinámicos de AutoCAD: definiciones traducibles y sus representaciones *U
    const acadDynamic = opts.acadDynamic === false ? new Map<string, ReturnType<typeof readAcadDynamicBlocks> extends Map<string, infer V> ? V : never>() : readAcadDynamicBlocks(dxf);
    const acadAnon = anonymousRepresentations(dxf);
    const acadHandles = acadDynamic.size ? acadIndex(dxf) : new Map<string, DxfRecord>();
    const acadDefinitionOf = (upper: string) => {
      const def = acadAnon.get(upper);
      const d = def ? acadDynamic.get(def) : undefined;
      return d && !d.unsupported.length ? d : undefined;
    };

    // ---------------------------------------------------------------- bloques
    const blockIdByName = new Map<string, Id>();
    const pendingBlocks: { id: Id; def: (typeof dxf.blocks)[number] }[] = [];
    for (const b of dxf.blocks) {
      const upper = b.name.toUpperCase();
      if (upper.startsWith('*MODEL_SPACE') || upper.startsWith('*PAPER_SPACE')) continue;
      if (upper.startsWith('*D')) continue; // cotas: se regeneran nativamente
      if (variantRefs.get(upper) === true) continue;
      if (acadDefinitionOf(upper)) continue; // representación estática de una instancia dinámica
      const isXref = !!(b.flags & 4);
      const existing = doc.findByName('blocks', b.name);
      const id = existing?.id ?? newId('blk');
      blockIdByName.set(upper, id);
      if (existing) continue;
      const rec: BlockRecord = {
        id,
        name: b.name,
        kind: b.flags & 1 ? 'anonymous' : isXref ? 'xref' : 'normal',
        basePoint: b.base,
        description: b.description,
        units,
        explodable: true,
        scaleUniformly: false,
        annotative: false,
        revision: 1,
        ...(isXref ? { xref: { path: '', mode: b.flags & 8 ? 'overlay' : 'attach', status: 'unresolved', layerOverrides: {} } } : {}),
      } as BlockRecord;
      tx.add('blocks', rec);
      pendingBlocks.push({ id, def: b });
      report.blocks++;
    }

    // ---------------------------------------------------------------- entidades
    const common = (r: R, owner: Id): Omit<EntityBase, 'id' | 'type' | 'order'> => {
      const aci = r.has(62) ? r.num(62) : 256;
      const color = r.has(420) ? trueColor(r.num(420)) : aci === 0 ? 'ByBlock' : aci === 256 ? 'ByLayer' : `aci:${Math.abs(aci)}`;
      return {
        owner,
        layer: layerId(r.str(8, '0')),
        color,
        linetype: ltId(r.str(6, 'BYLAYER')),
        linetypeScale: r.num(48, 1) || 1,
        lineweight: r.has(370) ? r.num(370) : -1,
        transparency: !r.has(440) ? 'ByLayer' : (r.num(440) & 0x03000000) === 0x01000000 ? 'ByBlock' : transparencyOf(r.num(440)),
        visible: r.num(60) !== 1,
      };
    };

    const handleToId = new Map<string, Id>();
    let currentHandle = '';
    const add = (e: Omit<Entity, 'id' | 'order'>) => {
      const created = tx.addEntity(e as never) as Entity;
      if (currentHandle && !handleToId.has(currentHandle)) handleToId.set(currentHandle, created.id);
      return created;
    };

    const convertList = (recs: DxfRecord[], ownerFor: (r: R) => Id) => {
      for (let i = 0; i < recs.length; i++) {
        const rec = recs[i];
        const r = new R(rec);
        const owner = ownerFor(r);
        currentHandle = r.str(5).toUpperCase();
        try {
          const consumed = convert(rec, r, owner, recs, i);
          i += consumed;
        } catch (err) {
          report.warnings.push(`${rec.type}: ${err instanceof Error ? err.message : String(err)}`);
          ignored(rec.type, 'error de conversión');
        }
      }
    };


    /** Devuelve cuántos registros adicionales consumió (VERTEX/ATTRIB/SEQEND). */
    const convert = (rec: DxfRecord, r: R, owner: Id, recs: DxfRecord[], index: number): number => {
      const base = common(r, owner);
      switch (rec.type) {
        case 'LINE':
          add({ ...base, type: 'line', start: r.pt(10), end: r.pt(11) } as Entity);
          ok('LINE');
          return 0;
        case 'POINT':
          add({ ...base, type: 'point', position: r.pt(10) } as Entity);
          ok('POINT');
          return 0;
        case 'CIRCLE': {
          const flip = r.num(230, 1) < 0;
          const c = r.pt(10);
          add({ ...base, type: 'circle', center: flip ? { x: -c.x, y: c.y } : c, radius: r.num(40) } as Entity);
          ok('CIRCLE');
          return 0;
        }
        case 'ARC': {
          // extrusión (0,0,−1): el SCO refleja X
          const flip = r.num(230, 1) < 0;
          const c = r.pt(10);
          const a0 = r.num(50) * DEG;
          const a1 = r.num(51) * DEG;
          if (flip) add({ ...base, type: 'arc', center: { x: -c.x, y: c.y }, radius: r.num(40), startAngle: Math.PI - a1, endAngle: Math.PI - a0 } as Entity);
          else add({ ...base, type: 'arc', center: c, radius: r.num(40), startAngle: a0, endAngle: a1 } as Entity);
          ok('ARC');
          return 0;
        }
        case 'ELLIPSE': {
          let major = r.pt(11);
          let ratio = r.num(40, 1);
          let s0 = r.num(41, 0);
          let s1 = r.num(42, TAU);
          if (r.num(230, 1) < 0) {
            // extrusión invertida: reflejar parámetros
            major = { x: -major.x, y: major.y };
            [s0, s1] = [Math.PI - s1, Math.PI - s0];
            transformed('ELLIPSE', 'extrusión −Z proyectada al plano XY');
          }
          if (ratio > 1) ratio = 1;
          const flipped = r.num(230, 1) < 0;
          add({ ...base, type: 'ellipse', center: { x: flipped ? -r.num(10) : r.num(10), y: r.num(20) }, majorAxis: major, ratio, startParam: s0, endParam: s1 } as Entity);
          ok('ELLIPSE');
          return 0;
        }
        case 'LWPOLYLINE': {
          const vertices: PolyVertex[] = [];
          let cur: PolyVertex | null = null;
          for (const [c, v] of rec.pairs) {
            if (c === 10) {
              cur = { x: Number(v), y: 0, bulge: 0 };
              vertices.push(cur);
            } else if (cur && c === 20) cur.y = Number(v);
            else if (cur && c === 42) cur.bulge = Number(v);
            else if (cur && c === 40) cur.startWidth = Number(v);
            else if (cur && c === 41) cur.endWidth = Number(v);
          }
          const cw = r.num(43, 0);
          if (r.num(230, 1) < 0) for (const vx of vertices) Object.assign(vx, { x: -vx.x, bulge: -(vx.bulge ?? 0) });
          add({ ...base, type: 'lwpolyline', vertices, closed: !!(r.num(70) & 1), constantWidth: cw > 0 ? cw : undefined } as Entity);
          ok('LWPOLYLINE');
          return 0;
        }
        case 'POLYLINE': {
          const flags = r.num(70);
          const vertices: PolyVertex[] = [];
          let j = index + 1;
          for (; j < recs.length && recs[j].type === 'VERTEX'; j++) {
            const vr = new R(recs[j]);
            const vf = vr.num(70);
            if (vf & 16) continue; // marco de control de spline
            vertices.push({ x: vr.num(10), y: vr.num(20), bulge: vr.num(42), startWidth: vr.has(40) ? vr.num(40) : undefined, endWidth: vr.has(41) ? vr.num(41) : undefined });
          }
          const consumed = j - index - 1 + (recs[j]?.type === 'SEQEND' ? 1 : 0);
          if (flags & 16 || flags & 64) {
            ignored('POLYLINE', 'mallas poligonales/policaras 3D fuera de alcance 2D');
            return consumed;
          }
          const smoothing = flags & 2 ? 'fit' : flags & 4 ? (r.num(75) === 5 ? 'quadratic' : 'cubic') : 'none';
          if (flags & 8) transformed('POLYLINE', 'polilínea 3D proyectada a 2D');
          if (smoothing === 'none') add({ ...base, type: 'lwpolyline', vertices, closed: !!(flags & 1) } as Entity);
          else add({ ...base, type: 'polyline2d', vertices, closed: !!(flags & 1), smoothing } as Entity);
          ok('POLYLINE');
          return consumed;
        }
        case 'SPLINE': {
          const flags = r.num(70);
          const degree = r.num(71, 3);
          const knots = r.nums(40);
          const weights = r.nums(41);
          const ctrlX = r.nums(10);
          const ctrlY = r.nums(20);
          const fitX = r.nums(11);
          const fitY = r.nums(21);
          const ctrl = ctrlX.map((x, k) => ({ x, y: ctrlY[k] ?? 0 }));
          const fit = fitX.map((x, k) => ({ x, y: fitY[k] ?? 0 }));
          let spline;
          if (ctrl.length > degree && knots.length === ctrl.length + degree + 1) spline = { degree, ctrl, knots, weights: weights.length === ctrl.length && flags & 4 ? weights : undefined, fit: fit.length ? fit : undefined, closed: !!(flags & 1) };
          else if (fit.length >= 2) {
            spline = { ...splineThroughPoints(fit, degree), closed: !!(flags & 1) };
            transformed('SPLINE', 'reconstruida por puntos de ajuste (sin vértices de control válidos)');
          } else throw new Error('spline sin datos suficientes');
          add({ ...base, type: 'spline', spline, method: fit.length ? 'fit' : 'cv', fitTolerance: r.num(44) } as Entity);
          ok('SPLINE');
          return 0;
        }
        case 'TEXT': {
          const h = r.num(72);
          const va = r.num(73);
          const halign = (['left', 'center', 'right', 'aligned', 'middle', 'fit'] as const)[h] ?? 'left';
          const valign = (['baseline', 'bottom', 'middle', 'top'] as const)[va] ?? 'baseline';
          const justified = h !== 0 || va !== 0;
          const pos = justified && halign !== 'aligned' && halign !== 'fit' && r.has(11) ? r.pt(11) : r.pt(10);
          add({ ...base, type: 'text', position: pos, alignPoint: halign === 'aligned' || halign === 'fit' ? r.pt(11) : undefined, text: decodeDxfText(r.raw(1)), height: r.num(40, 2.5), rotation: r.num(50) * DEG, widthFactor: r.num(41, 1) || 1, oblique: r.num(51) * DEG, style: styleId(r.str(7, 'STANDARD')), halign, valign } as TextEntity);
          ok('TEXT');
          return 0;
        }
        case 'MTEXT': {
          const contents = [...r.all(3), ...r.all(1)].join('');
          let rotation = r.num(50) * DEG;
          if (r.has(11)) rotation = Math.atan2(r.num(21), r.num(11));
          add({ ...base, type: 'mtext', position: r.pt(10), width: r.num(41), height: r.num(40, 2.5), rotation, style: styleId(r.str(7, 'STANDARD')), attachment: (Math.min(9, Math.max(1, r.num(71, 1))) as MTextAttachment), lineSpacing: r.num(44, 1) || 1, contents: decodeDxfText(contents) } as Entity);
          ok('MTEXT');
          return 0;
        }
        case 'INSERT': {
          const name = r.str(2);
          const blockId = blockIdByName.get(name.toUpperCase());
          const attributes: { tag: string; value: string; position?: Vec2; height?: number; rotation?: number; invisible?: boolean }[] = [];
          let j = index + 1;
          if (r.num(66) === 1) {
            for (; j < recs.length && recs[j].type === 'ATTRIB'; j++) {
              const ar = new R(recs[j]);
              attributes.push({ tag: ar.str(2), value: decodeDxfText(ar.raw(1)), position: ar.has(11) && (ar.num(72) || ar.num(74)) ? ar.pt(11) : ar.pt(10), height: ar.num(40), rotation: ar.num(50) * DEG, invisible: !!(ar.num(70) & 1) || undefined });
            }
            if (recs[j]?.type === 'SEQEND') j++;
          }
          const consumed = j - index - 1;
          const fm = readInstanceXdata(rec.pairs);
          const acad = acadDefinitionOf(name.toUpperCase());
          const baseId = fm && fmDynamic.has(fm.baseName.toUpperCase()) ? blockIdByName.get(fm.baseName.toUpperCase()) : acad ? blockIdByName.get(acad.name) : undefined;
          const dynState = fm && baseId && !acad ? fm.state : acad && baseId ? acad.state(instanceNodes(dxf, rec, acadHandles)) : undefined;
          if (!blockId && !baseId) {
            ignored('INSERT', `bloque «${name}» no encontrado`);
            return consumed;
          }
          const cols = r.num(70, 1);
          const rows = r.num(71, 1);
          add({ ...base, type: 'insert', blockId: baseId ?? blockId, dynamic: baseId ? dynState : undefined, position: r.pt(10), scale: { x: r.num(41, 1), y: r.num(42, 1) }, rotation: r.num(50) * DEG, attributes, grid: cols > 1 || rows > 1 ? { columns: cols, rows, columnSpacing: r.num(44), rowSpacing: r.num(45) } : undefined } as Entity);
          ok(baseId ? 'INSERT dinámico' : 'INSERT');
          return consumed;
        }
        case 'ATTDEF': {
          const flags = r.num(70);
          const h = r.num(72);
          const va = r.num(74);
          add({ ...base, type: 'attdef', tag: r.str(2), prompt: r.str(3), defaultValue: decodeDxfText(r.raw(1)), position: (h || va) && r.has(11) ? r.pt(11) : r.pt(10), height: r.num(40, 2.5), rotation: r.num(50) * DEG, style: styleId(r.str(7, 'STANDARD')), halign: (['left', 'center', 'right', 'aligned', 'middle', 'fit'] as const)[h] ?? 'left', valign: (['baseline', 'bottom', 'middle', 'top'] as const)[va] ?? 'baseline', invisible: !!(flags & 1), constant: !!(flags & 2), verify: !!(flags & 4), preset: !!(flags & 8), lockPosition: false, multiline: false } as Entity);
          ok('ATTDEF');
          return 0;
        }
        case 'HATCH': {
          const hatch = convertHatch(r, base);
          if (!hatch) {
            ignored('HATCH', 'contorno no legible');
            return 0;
          }
          add(hatch as Entity);
          ok('HATCH');
          return 0;
        }
        case 'SOLID':
        case 'TRACE': {
          const pts = [r.pt(10), r.pt(11), r.pt(13), r.pt(12)];
          add({ ...base, type: 'hatch', loops: [{ closed: true, vertices: pts.map((p) => ({ ...p, bulge: 0 })) }], pattern: { type: 'solid', name: 'SOLID', angle: 0, scale: 1, spacing: 1, double: false }, origin: { x: 0, y: 0 }, islandStyle: 'normal' } as Entity);
          transformed(rec.type, 'convertido a sombreado sólido');
          return 0;
        }
        case '3DFACE': {
          const pts = [r.pt(10), r.pt(11), r.pt(12), r.pt(13)];
          for (let k = 0; k < 4; k++) add({ ...base, type: 'line', start: pts[k], end: pts[(k + 1) % 4] } as Entity);
          transformed('3DFACE', 'proyectada a 4 líneas 2D');
          return 0;
        }
        case 'XLINE':
        case 'RAY':
          add({ ...base, type: rec.type === 'XLINE' ? 'xline' : 'ray', origin: r.pt(10), direction: normalize(r.pt(11)) } as Entity);
          ok(rec.type);
          return 0;
        case 'DIMENSION': {
          const d = convertDimension(r, base, dimStyleId(r.str(3, 'STANDARD')));
          if (!d) {
            ignored('DIMENSION', 'tipo de cota no reconocido');
            return 0;
          }
          add(d as Entity);
          ok('DIMENSION');
          return 0;
        }
        case 'ARC_DIMENSION': {
          add({ ...base, type: 'dimension', dimType: 'arclength', style: dimStyleId(r.str(3, 'STANDARD')), overrides: {}, p1: r.pt(13), p2: r.pt(14), p3: r.pt(15), center: r.pt(15), arcPoint: r.pt(10), rotation: 0 } as Entity);
          ok('ARC_DIMENSION');
          return 0;
        }
        case 'LEADER': {
          const xs = r.nums(10);
          const ys = r.nums(20);
          const vertices = xs.map((x, k) => ({ x, y: ys[k] ?? 0 }));
          add({ ...base, type: 'leader', vertices, style: dimStyleId(r.str(3, 'STANDARD')), arrow: r.num(71, 1) ? 'closed-filled' : 'none', splined: r.num(72) === 1, hookline: r.num(75) === 1 } as Entity);
          ok('LEADER');
          return 0;
        }
        case 'MULTILEADER':
        case 'MLEADER': {
          const m = convertMLeader(rec, base, doc.settings.currentMLeaderStyle);
          if (!m) {
            ignored(rec.type, 'estructura de contexto no reconocida');
            return 0;
          }
          add(m as Entity);
          transformed(rec.type, 'importada con estilo actual (sustituciones de estilo no conservadas)');
          return 0;
        }
        case 'WIPEOUT': {
          const ins = r.pt(10);
          const u = r.pt(11);
          const v = r.pt(12);
          const size = r.pt(13, { x: 1, y: 1 });
          const cx = r.nums(14);
          const cy = r.nums(24);
          const pts = cx.map((x, k) => ({ x: ins.x + u.x * (x + 0.5) * size.x + v.x * (0.5 - (cy[k] ?? 0)) * size.y, y: ins.y + u.y * (x + 0.5) * size.x + v.y * (0.5 - (cy[k] ?? 0)) * size.y }));
          if (pts.length > 2 && pts.length === cx.length) add({ ...base, type: 'wipeout', vertices: pts.length > 2 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y ? pts.slice(0, -1) : pts, frame: false } as Entity);
          else ignored('WIPEOUT', 'contorno de recorte ausente');
          transformed('WIPEOUT', 'contorno recalculado en coordenadas de dibujo');
          return 0;
        }
        case 'MLINE': {
          const xs = r.nums(11);
          const ys = r.nums(21);
          const vertices = xs.map((x, k) => ({ x, y: ys[k] ?? 0 }));
          const just = (['top', 'zero', 'bottom'] as const)[r.num(70)] ?? 'zero';
          add({ ...base, type: 'mline', vertices, closed: !!(r.num(71) & 2), style: doc.settings.currentMLineStyle, scale: r.num(40, 1), justification: just } as Entity);
          transformed('MLINE', 'estilo de multilínea sustituido por el estilo actual');
          return 0;
        }
        case 'VIEWPORT': {
          if (owner === MODEL_SPACE_ID) {
            ignored('VIEWPORT', 'ventanas en mosaico del modelo');
            return 0;
          }
          if (r.num(69) === 1) return 0; // viewport global del papel
          const viewH = r.num(45, 1);
          const h = r.num(41, 1);
          add({ ...base, type: 'viewport', center: r.pt(10), width: r.num(40, 1), height: h, viewCenter: r.pt(12), scale: viewH > 0 ? h / viewH : 1, viewTwist: r.num(51) * DEG, displayLocked: !!(r.num(90) & 16384), on: !(r.num(90) & 131072), frozenLayers: [], layerOverrides: {} } as never);
          ok('VIEWPORT');
          return 0;
        }
        case 'IMAGE':
          ignored('IMAGE', 'imagen externa: vuelve a enlazarla con IMAGEATTACH (DXF solo guarda la ruta)');
          return 0;
        case 'ACAD_TABLE': {
          const bname = r.str(2);
          const blockId = blockIdByName.get(bname.toUpperCase());
          if (blockId) {
            add({ ...base, type: 'insert', blockId, position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, attributes: [] } as never);
            transformed('ACAD_TABLE', 'importada como bloque con su representación gráfica (no editable como tabla)');
          } else ignored('ACAD_TABLE', 'sin bloque de representación');
          return 0;
        }
        case 'REGION':
        case '3DSOLID':
        case 'BODY':
        case 'SURFACE':
          ignored(rec.type, 'geometría ACIS/3D fuera de alcance');
          return 0;
        case 'MESH':
        case 'OLE2FRAME':
        case 'ACAD_PROXY_ENTITY':
          ignored(rec.type, 'objeto no compatible');
          return 0;
        case 'SEQEND':
        case 'VERTEX':
        case 'ATTRIB':
          return 0;
        default:
          ignored(rec.type, 'tipo de entidad no compatible');
          return 0;
      }
    };

    for (const pb of pendingBlocks) convertList(pb.def.entities, () => pb.id);
    for (const b of dxf.blocks) {
      const upper = b.name.toUpperCase();
      if (!upper.startsWith('*PAPER_SPACE') || upper === '*PAPER_SPACE') continue;
      const layout = layoutByBlockName.get(upper);
      if (layout) convertList(b.entities, () => layout);
    }
    convertList(dxf.entities, (r) => (r.num(67) === 1 ? (firstLayout ?? MODEL_SPACE_ID) : (opts.owner ?? MODEL_SPACE_ID)));

    const created = new Set(pendingBlocks.map((p) => p.id));
    for (const [upper, json] of fmDynamic) {
      const id = blockIdByName.get(upper);
      if (!id || !created.has(id)) continue;
      const { def, missing } = decodeDefinition(json, (h) => handleToId.get(h.toUpperCase()));
      tx.update('blocks', id, { dynamic: def });
      ok('Bloque dinámico');
      if (missing) report.warnings.push(`${doc.data.blocks.get(id)?.name}: ${missing} referencia(s) de la definición dinámica sin objeto equivalente.`);
    }

    for (const [upper, acad] of acadDynamic) {
      const id = blockIdByName.get(upper);
      if (!id || !created.has(id)) continue;
      const bname = doc.data.blocks.get(id)?.name ?? upper;
      if (acad.unsupported.length) {
        transformed('Bloque dinámico de AutoCAD', 'usa elementos sin equivalente en FModel: se importan sus representaciones estáticas (una por estado usado)');
        report.warnings.push(`«${bname}»: ${acad.unsupported.join(', ')} sin equivalente en FModel; las instancias conservan su geometría estática.`);
        continue;
      }
      const { def, shown, hidden, missing } = acad.build((h) => handleToId.get(h.toUpperCase()));
      tx.update('blocks', id, { dynamic: def });
      for (const eid of shown) tx.updateEntity(eid, { visible: true });
      for (const eid of hidden) tx.updateEntity(eid, { visible: false });
      ok('Bloque dinámico de AutoCAD');
      if (missing) report.warnings.push(`«${bname}»: ${missing} referencia(s) de la definición dinámica sin objeto equivalente.`);
    }
  });

  const total = Object.values(report.imported).reduce((a, b) => a + b, 0);
  const tcount = Object.values(report.transformed).reduce((a, b) => a + b.count, 0);
  const icount = Object.values(report.ignored).reduce((a, b) => a + b.count, 0);
  report.summary = {
    es: `${fmt} ${report.version || ''} importado en ${report.units}: ${total} objetos, ${tcount} transformados, ${icount} ignorados, ${report.layers} capas y ${report.blocks} bloques nuevos. Importación parcial: revisa el informe.`,
    en: `${fmt} ${report.version || ''} imported in ${report.units}: ${total} objects, ${tcount} transformed, ${icount} ignored, ${report.layers} new layers and ${report.blocks} blocks. Partial import: check the report.`,
  };
  return report;
}

function trueColor(n: number): string {
  return `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
}

function transparencyOf(v: number): number {
  const alpha = v & 0xff;
  return Math.max(0, Math.min(90, Math.round((1 - alpha / 255) * 100)));
}

/**
 * Decodifica los bytes de un DXF: R2007 (AC1021) y posteriores son UTF-8; las versiones
 * anteriores usan la página de códigos de $DWGCODEPAGE (Windows-1252 si no se reconoce).
 */
export function decodeDxfBytes(bytes: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 8192));
  const ver = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/.exec(head)?.[1];
  if (!ver || ver >= 'AC1021' || bytes[0] === 0xef) return new TextDecoder('utf-8').decode(bytes);
  const cp = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/.exec(head)?.[1]?.toUpperCase() ?? 'ANSI_1252';
  const map: Record<string, string> = { ANSI_1250: 'windows-1250', ANSI_1251: 'windows-1251', ANSI_1252: 'windows-1252', ANSI_1253: 'windows-1253', ANSI_1254: 'windows-1254', ANSI_1257: 'windows-1257', ANSI_932: 'shift_jis', ANSI_936: 'gbk', ANSI_949: 'euc-kr', ANSI_950: 'big5' };
  try {
    return new TextDecoder(map[cp] ?? 'windows-1252').decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Decodifica códigos de control DXF en texto. */
export function decodeDxfText(s: string): string {
  return s
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%%/g, '%')
    .replace(/\^J/g, '\\P');
}

function convertHatch(r: R, base: Omit<EntityBase, 'id' | 'type' | 'order'>): Omit<HatchEntity, 'id' | 'order'> | null {
  const pairs = r.rec.pairs;
  const loops: Loop[] = [];
  let i = pairs.findIndex((p) => p[0] === 91);
  if (i < 0) return null;
  const loopCount = Number(pairs[i][1]);
  i++;
  const next = (code: number) => {
    while (i < pairs.length && pairs[i][0] !== code) i++;
    return i < pairs.length ? Number(pairs[i++][1]) : NaN;
  };
  for (let l = 0; l < loopCount; l++) {
    const flags = next(92);
    if (Number.isNaN(flags)) break;
    if (flags & 2) {
      const hasBulge = next(72);
      next(73);
      const n = next(93);
      const vertices: PolyVertex[] = [];
      for (let k = 0; k < n; k++) {
        const x = next(10);
        const y = next(20);
        const bulge = hasBulge ? next(42) : 0;
        vertices.push({ x, y, bulge });
      }
      loops.push({ vertices, closed: true });
    } else {
      const ne = next(93);
      const curves: Curve[] = [];
      for (let k = 0; k < ne; k++) {
        const et = next(72);
        if (et === 1) curves.push({ kind: 'line', a: { x: next(10), y: next(20) }, b: { x: next(11), y: next(21) } });
        else if (et === 2) {
          const c = { x: next(10), y: next(20) };
          const rad = next(40);
          const a0 = next(50) * DEG;
          const a1 = next(51) * DEG;
          const ccw = next(73);
          let sweep = a1 - a0;
          if (sweep <= 0) sweep += TAU;
          curves.push(ccw ? { kind: 'arc', c, r: rad, a0, sweep } : { kind: 'arc', c, r: rad, a0: -a0, sweep: -sweep });
        } else if (et === 3) {
          const c = { x: next(10), y: next(20) };
          const major = { x: next(11), y: next(21) };
          const ratio = next(40);
          const a0 = next(50) * DEG;
          const a1 = next(51) * DEG;
          const ccw = next(73);
          let sweep = a1 - a0;
          if (sweep <= 0) sweep += TAU;
          curves.push({ kind: 'ellipse', c, major, ratio, a0: ccw ? a0 : -a0, sweep: ccw ? sweep : -sweep });
        } else if (et === 4) {
          const degree = next(94);
          next(73);
          next(74);
          const nk = next(95);
          const nc = next(96);
          const knots: number[] = [];
          for (let q = 0; q < nk; q++) knots.push(next(40));
          const ctrl: Vec2[] = [];
          for (let q = 0; q < nc; q++) ctrl.push({ x: next(10), y: next(20) });
          curves.push({ kind: 'spline', s: { degree, knots, ctrl } });
        } else break;
      }
      if (curves.length) loops.push({ vertices: curvesToVertices(curves, 1e-6).vertices, closed: true });
    }
    // saltar referencias de contorno
    const nsrc = i < pairs.length && pairs[i][0] === 97 ? Number(pairs[i++][1]) : 0;
    for (let q = 0; q < nsrc && i < pairs.length; q++) if (pairs[i][0] === 330) i++;
  }
  if (!loops.length) return null;
  const solid = r.num(70) === 1;
  const name = r.str(2, 'SOLID').toUpperCase();
  const ptype = r.num(76, 1);
  const style = r.num(75, 0);
  return {
    ...base,
    type: 'hatch',
    loops,
    pattern: { type: solid ? 'solid' : ptype === 0 ? 'user' : 'predefined', name: solid ? 'SOLID' : name, angle: r.num(52) * DEG, scale: r.num(41, 1) || 1, spacing: r.num(41, 1) || 1, double: r.num(77) === 1 },
    origin: { x: 0, y: 0 },
    islandStyle: style === 1 ? 'outer' : style === 2 ? 'ignore' : 'normal',
  };
}

function convertDimension(r: R, base: Omit<EntityBase, 'id' | 'type' | 'order'>, style: Id): Omit<DimensionEntity, 'id' | 'order'> | null {
  const t = r.num(70) & 15;
  const userText = !!(r.num(70) & 128);
  const override = r.raw(1);
  const common = { ...base, type: 'dimension' as const, style, overrides: {}, rotation: 0, textOverride: override && override !== '<>' ? decodeDxfText(override) : undefined, textPosition: userText ? r.pt(11) : undefined };
  let dimType: DimType;
  switch (t) {
    case 0:
      dimType = 'linear';
      return { ...common, dimType, p1: r.pt(13), p2: r.pt(14), p3: r.pt(10), rotation: r.num(50) * DEG, textPosition: undefined };
    case 1:
      return { ...common, dimType: 'aligned', p1: r.pt(13), p2: r.pt(14), p3: r.pt(10), textPosition: undefined };
    case 2:
      return { ...common, dimType: 'angular', p1: r.pt(13), p2: r.pt(14), p3: r.pt(15), p4: r.pt(10), arcPoint: r.pt(16) };
    case 5:
      return { ...common, dimType: 'angular3p', center: r.pt(15), p1: r.pt(13), p2: r.pt(14), p3: r.pt(15), arcPoint: r.pt(10) };
    case 3: {
      const far = r.pt(10);
      const near = r.pt(15);
      const center = { x: (far.x + near.x) / 2, y: (far.y + near.y) / 2 };
      return { ...common, dimType: 'diametric', center, p1: near, p2: center, p3: r.pt(11), textPosition: undefined };
    }
    case 4:
      return { ...common, dimType: 'radial', center: r.pt(10), p1: r.pt(15), p2: r.pt(10), p3: r.pt(11), textPosition: undefined };
    case 6:
      return { ...common, dimType: 'ordinate', origin: r.pt(10), p1: r.pt(13), p2: r.pt(14), p3: r.pt(14), axis: r.num(70) & 64 ? 'x' : 'y' };
    default:
      return null;
  }
}

function convertMLeader(rec: DxfRecord, base: Omit<EntityBase, 'id' | 'type' | 'order'>, style: Id) {
  const pairs = rec.pairs;
  const leaders: { vertices: Vec2[] }[] = [];
  let landing: Vec2 | null = null;
  let text = '';
  let textHeight = 2.5;
  let dogleg = 2.5;
  let cur: Vec2[] | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 304 && v.trim() === 'LEADER_LINE{') cur = [];
    else if (c === 305 && cur) {
      if (cur.length) leaders.push({ vertices: cur });
      cur = null;
    } else if (cur && c === 10) cur.push({ x: Number(v), y: Number(pairs[i + 1]?.[1] ?? 0) });
    else if (!cur && c === 10 && pairs[i - 1]?.[0] === 302 && !landing) landing = { x: Number(v), y: Number(pairs[i + 1]?.[1] ?? 0) };
    else if (c === 304 && !v.includes('{')) text = v;
    else if (c === 41) textHeight = Number(v) || textHeight;
    else if (c === 40 && !landing) dogleg = Number(v) || dogleg;
  }
  if (!leaders.length) return null;
  const lastPts = leaders[0].vertices;
  const land = landing ?? lastPts[lastPts.length - 1];
  return {
    ...base,
    type: 'mleader' as const,
    style,
    leaders: leaders.map((l) => ({ vertices: l.vertices })),
    landing: land,
    doglegLength: dogleg,
    direction: (land.x >= lastPts[0].x ? 1 : -1) as 1 | -1,
    content: text ? { type: 'mtext' as const, text: decodeDxfText(text), height: textHeight, attachment: 4 as MTextAttachment, width: 0, frame: false } : { type: 'none' as const },
  };
}
