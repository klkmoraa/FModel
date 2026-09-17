import { validateDynamicBlock } from '../blocks/dynamic';
import { wouldCreateCycle } from '../blocks/blockOps';
import { selfIntersections } from '../geometry/intersect';
import { polylineSegments } from '../geometry/polyline';
import { dist } from '../geometry/vec';
import type { CadDocument, Transaction } from '../document/document';
import { LAYER0_ID, LT_CONTINUOUS_ID, TEXTSTYLE_STANDARD_ID } from '../document/defaults';
import type { CollectionName, Entity, Id, InsertEntity, LwPolylineEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import type { ModelContext } from '../model/context';
import { planOverkill } from './overkill';
import { findUnused } from './purge';

type L10n = { es: string; en: string };

export type HealthCategory = 'geometry' | 'duplicates' | 'references' | 'blocks' | 'standards' | 'unused';
export type HealthSeverity = 'error' | 'warning' | 'info';

export type HealthCode =
  | 'duplicate'
  | 'zero-length'
  | 'near-closed-polyline'
  | 'self-intersection'
  | 'invalid-geometry'
  | 'missing-layer'
  | 'missing-linetype'
  | 'missing-style'
  | 'missing-block'
  | 'missing-asset'
  | 'orphan-owner'
  | 'broken-xref'
  | 'broken-group'
  | 'block-cycle'
  | 'empty-block'
  | 'dynamic-block'
  | 'layer-name'
  | 'linetype-pattern'
  | 'dimstyle'
  | 'text-height'
  | 'unused';

export interface HealthIssue {
  code: HealthCode;
  category: HealthCategory;
  severity: HealthSeverity;
  message: L10n;
  entityIds?: Id[];
  record?: { coll: CollectionName; id: Id };
  /** AUDIT puede corregirlo automáticamente sin perder información relevante */
  fixable: boolean;
}

export interface HealthReport {
  at: number;
  score: number;
  entities: number;
  issues: HealthIssue[];
  counts: Record<HealthCategory, number>;
}

const L = (es: string, en: string): L10n => ({ es, en });
/** Nombres de tabla válidos (compatibles con DXF): sin <>/\":;?*|=,` ni espacios extremos. */
const INVALID_NAME = /[<>/\\":;?*|=,`]|^\s|\s$/;

function finiteEntity(e: Entity): boolean {
  let ok = true;
  const visit = (v: unknown) => {
    if (!ok) return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) ok = false;
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(e);
  return ok;
}

/**
 * Informe de salud del dibujo: calidad geométrica, duplicados, referencias rotas, bloques
 * inválidos, estándares de nombres y estilos, y elementos sin uso. Es de solo lectura.
 */
export function analyzeDrawing(doc: CadDocument, ctx: ModelContext, opts: { tolerance?: number } = {}): HealthReport {
  const d = doc.data;
  const tol = opts.tolerance ?? 1e-6;
  const issues: HealthIssue[] = [];
  const push = (i: HealthIssue) => issues.push(i);
  const owners = new Set<Id>([MODEL_SPACE_ID, ...d.layouts.keys(), ...d.blocks.keys()]);
  const styleIds = new Set<Id>([...d.textStyles.keys(), ...d.dimStyles.keys(), ...d.mleaderStyles.keys(), ...d.tableStyles.keys(), ...d.mlineStyles.keys()]);

  // ---------------------------------------------------------------- objetos
  const byOwner = new Map<Id, Entity[]>();
  for (const e of d.entities.values()) {
    const list = byOwner.get(e.owner) ?? [];
    list.push(e);
    byOwner.set(e.owner, list);
    if (!owners.has(e.owner)) push({ code: 'orphan-owner', category: 'references', severity: 'error', fixable: true, entityIds: [e.id], message: L('Objeto en un espacio o bloque que ya no existe.', 'Object in a space or block that no longer exists.') });
    if (!finiteEntity(e)) {
      push({ code: 'invalid-geometry', category: 'geometry', severity: 'error', fixable: true, entityIds: [e.id], message: L(`${e.type}: coordenadas no numéricas (NaN o infinito).`, `${e.type}: non-numeric coordinates (NaN or infinite).`) });
      continue;
    }
    if (!d.layers.has(e.layer)) push({ code: 'missing-layer', category: 'references', severity: 'error', fixable: true, entityIds: [e.id], message: L('Objeto en una capa inexistente (se moverá a «0»).', 'Object on a missing layer (moves to "0").') });
    if (e.linetype !== 'ByLayer' && e.linetype !== 'ByBlock' && !d.linetypes.has(e.linetype)) push({ code: 'missing-linetype', category: 'references', severity: 'warning', fixable: true, entityIds: [e.id], message: L('Tipo de línea inexistente (pasa a PorCapa).', 'Missing linetype (becomes ByLayer).') });
    const style = (e as { style?: Id }).style;
    if (style !== undefined && !styleIds.has(style)) push({ code: 'missing-style', category: 'references', severity: 'warning', fixable: true, entityIds: [e.id], message: L(`${e.type}: estilo inexistente (se usará el actual).`, `${e.type}: missing style (current style will be used).`) });
    switch (e.type) {
      case 'line':
        if (dist(e.start, e.end) <= tol) push({ code: 'zero-length', category: 'geometry', severity: 'warning', fixable: true, entityIds: [e.id], message: L('Línea de longitud cero.', 'Zero-length line.') });
        break;
      case 'circle':
      case 'arc':
        if (!(e.radius > tol)) push({ code: 'zero-length', category: 'geometry', severity: 'warning', fixable: true, entityIds: [e.id], message: L(`${e.type === 'arc' ? 'Arco' : 'Círculo'} de radio nulo.`, `${e.type === 'arc' ? 'Arc' : 'Circle'} with zero radius.`) });
        break;
      case 'lwpolyline': {
        const v = e.vertices;
        if (v.length < 2 || (v.length === 2 && dist(v[0], v[1]) <= tol)) {
          push({ code: 'zero-length', category: 'geometry', severity: 'warning', fixable: true, entityIds: [e.id], message: L('Polilínea degenerada (menos de dos vértices distintos).', 'Degenerate polyline (fewer than two distinct vertices).') });
          break;
        }
        if (!e.closed && v.length > 2 && dist(v[0], v[v.length - 1]) <= Math.max(tol, 1e-4)) push({ code: 'near-closed-polyline', category: 'geometry', severity: 'warning', fixable: true, entityIds: [e.id], message: L('Polilínea abierta cuyos extremos coinciden: probablemente debía estar cerrada.', 'Open polyline whose ends coincide: probably meant to be closed.') });
        if (v.length <= 400) {
          const segs = polylineSegments(v, e.closed);
          // contactos en vértices (t = 0 o 1 en ambos tramos) no son cruces
          const atEnd = (t: number) => t <= 1e-6 || t >= 1 - 1e-6;
          const hits = selfIntersections(segs, e.closed, tol).filter((h) => !(atEnd(h.hit.t1) && atEnd(h.hit.t2)));
          if (hits.length) push({ code: 'self-intersection', category: 'geometry', severity: 'info', fixable: false, entityIds: [e.id], message: L(`Polilínea con ${hits.length} autointersección(es): puede dar áreas y sombreados incorrectos.`, `Polyline with ${hits.length} self-intersection(s): areas and hatches may be wrong.`) });
        }
        break;
      }
      case 'text':
      case 'attdef':
        if (!(e.height > 0)) push({ code: 'text-height', category: 'geometry', severity: 'warning', fixable: true, entityIds: [e.id], message: L('Texto con altura nula o negativa.', 'Text with zero or negative height.') });
        break;
      case 'mtext':
        if (!(e.height > 0)) push({ code: 'text-height', category: 'geometry', severity: 'warning', fixable: true, entityIds: [e.id], message: L('Texto de párrafos con altura nula o negativa.', 'Mtext with zero or negative height.') });
        break;
      case 'insert':
        if (!d.blocks.has(e.blockId)) push({ code: 'missing-block', category: 'references', severity: 'error', fixable: true, entityIds: [e.id], message: L('Referencia a un bloque inexistente.', 'Reference to a missing block.') });
        else if (!(Math.abs(e.scale.x) > 0 && Math.abs(e.scale.y) > 0)) push({ code: 'invalid-geometry', category: 'geometry', severity: 'error', fixable: false, entityIds: [e.id], message: L('Inserción con escala cero.', 'Insertion with zero scale.') });
        break;
      case 'image':
      case 'pdfunderlay':
        if (!d.assets.get(e.assetId)?.dataUrl) push({ code: 'missing-asset', category: 'references', severity: 'error', fixable: false, entityIds: [e.id], message: L('Imagen o calco sin datos: vuelve a enlazar el archivo.', 'Image or underlay without data: attach the file again.') });
        break;
      case 'viewport':
        if (!(e.scale > 0) || !(e.width > 0) || !(e.height > 0)) push({ code: 'invalid-geometry', category: 'geometry', severity: 'error', fixable: false, entityIds: [e.id], message: L('Viewport con tamaño o escala no válidos.', 'Viewport with invalid size or scale.') });
        break;
      case 'hatch':
        if (!e.loops.length) push({ code: 'invalid-geometry', category: 'geometry', severity: 'warning', fixable: true, entityIds: [e.id], message: L('Sombreado sin contornos.', 'Hatch without boundaries.') });
        break;
    }
  }

  // ---------------------------------------------------------------- duplicados por espacio
  for (const [owner, list] of byOwner) {
    if (!owners.has(owner)) continue;
    const plan = planOverkill(list, { tolerance: tol, compareProps: true, mergeCollinear: false, removeZeroLength: false });
    if (plan.duplicates) push({ code: 'duplicate', category: 'duplicates', severity: 'warning', fixable: true, entityIds: plan.remove, message: L(`${plan.duplicates} objeto(s) duplicado(s) exactos${owner === MODEL_SPACE_ID ? '' : ` en «${d.blocks.get(owner)?.name ?? d.layouts.get(owner)?.name ?? owner}»`}.`, `${plan.duplicates} exact duplicate object(s)${owner === MODEL_SPACE_ID ? '' : ` in "${d.blocks.get(owner)?.name ?? d.layouts.get(owner)?.name ?? owner}"`}.`) });
  }

  // ---------------------------------------------------------------- bloques y referencias
  for (const b of d.blocks.values()) {
    if (b.kind === 'xref' && b.xref && b.xref.status !== 'loaded') push({ code: 'broken-xref', category: 'references', severity: b.xref.status === 'unloaded' ? 'info' : 'error', fixable: false, record: { coll: 'blocks', id: b.id }, message: L(`Referencia «${b.name}»: ${b.xref.status === 'unloaded' ? 'descargada' : b.xref.status === 'circular' ? 'circular' : 'origen no encontrado'} (${b.xref.path}).`, `Reference "${b.name}": ${b.xref.status} (${b.xref.path}).`) });
    const content = byOwner.get(b.id) ?? [];
    if (!content.length && b.kind === 'normal') push({ code: 'empty-block', category: 'blocks', severity: 'info', fixable: false, record: { coll: 'blocks', id: b.id }, message: L(`El bloque «${b.name}» no contiene objetos.`, `Block "${b.name}" contains no objects.`) });
    for (const e of content) {
      if (e.type === 'insert' && d.blocks.has((e as InsertEntity).blockId) && ((e as InsertEntity).blockId === b.id || wouldCreateCycle(doc, b.id, (e as InsertEntity).blockId))) {
        push({ code: 'block-cycle', category: 'blocks', severity: 'error', fixable: true, entityIds: [e.id], record: { coll: 'blocks', id: b.id }, message: L(`El bloque «${b.name}» se contiene a sí mismo (referencia circular).`, `Block "${b.name}" contains itself (circular reference).`) });
      }
    }
    if (b.dynamic) {
      const rep = validateDynamicBlock(ctx, b);
      for (const m of rep.errors) push({ code: 'dynamic-block', category: 'blocks', severity: 'error', fixable: false, record: { coll: 'blocks', id: b.id }, message: L(`«${b.name}»: ${m}`, `"${b.name}": ${m}`) });
      for (const m of rep.warnings) push({ code: 'dynamic-block', category: 'blocks', severity: 'warning', fixable: false, record: { coll: 'blocks', id: b.id }, message: L(`«${b.name}»: ${m.replace(/^⚠\s*/, '')}`, `"${b.name}": ${m.replace(/^⚠\s*/, '')}`) });
    }
  }
  for (const g of d.groups.values()) {
    const missing = g.members.filter((id) => !d.entities.has(id));
    if (missing.length) push({ code: 'broken-group', category: 'references', severity: 'warning', fixable: true, record: { coll: 'groups', id: g.id }, message: L(`El grupo «${g.name}» referencia ${missing.length} objeto(s) eliminado(s).`, `Group "${g.name}" references ${missing.length} deleted object(s).`) });
  }

  // ---------------------------------------------------------------- estándares
  for (const l of d.layers.values()) {
    if (INVALID_NAME.test(l.name) && !l.name.includes('|')) push({ code: 'layer-name', category: 'standards', severity: 'warning', fixable: false, record: { coll: 'layers', id: l.id }, message: L(`Nombre de capa «${l.name}» con caracteres no válidos para DXF.`, `Layer name "${l.name}" has characters invalid in DXF.`) });
    if (!d.linetypes.has(l.linetype)) push({ code: 'missing-linetype', category: 'references', severity: 'error', fixable: true, record: { coll: 'layers', id: l.id }, message: L(`La capa «${l.name}» usa un tipo de línea inexistente.`, `Layer "${l.name}" uses a missing linetype.`) });
  }
  for (const lt of d.linetypes.values()) {
    // válido: al menos un trazo (> 0) o punto (0); inválido: solo huecos o valores no numéricos
    const bad = lt.pattern.some((v) => !Number.isFinite(v)) || (lt.pattern.length > 0 && lt.pattern.every((v) => v < 0));
    if (bad) push({ code: 'linetype-pattern', category: 'standards', severity: 'error', fixable: false, record: { coll: 'linetypes', id: lt.id }, message: L(`Tipo de línea «${lt.name}» con patrón no válido (sin trazos o valores no numéricos).`, `Linetype "${lt.name}" has an invalid pattern.`) });
  }
  for (const ds of d.dimStyles.values()) {
    const problems: string[] = [];
    if (!(ds.textHeight > 0)) problems.push('altura de texto');
    if (!(ds.arrowSize >= 0)) problems.push('tamaño de flecha');
    if (!(ds.overallScale > 0)) problems.push('escala global');
    if (!d.textStyles.has(ds.textStyle)) problems.push('estilo de texto inexistente');
    if (problems.length) push({ code: 'dimstyle', category: 'standards', severity: 'warning', fixable: !d.textStyles.has(ds.textStyle), record: { coll: 'dimStyles', id: ds.id }, message: L(`Estilo de cota «${ds.name}»: ${problems.join(', ')}.`, `Dimension style "${ds.name}": ${problems.join(', ')}.`) });
  }

  // ---------------------------------------------------------------- sin uso
  const unused = findUnused(doc);
  if (unused.length) {
    push({ code: 'unused', category: 'unused', severity: 'info', fixable: false, message: L(`${unused.length} elemento(s) con nombre sin uso (capas, estilos, bloques): revísalos con PURGE.`, `${unused.length} unused named item(s) (layers, styles, blocks): review them with PURGE.`) });
  }

  const counts: Record<HealthCategory, number> = { geometry: 0, duplicates: 0, references: 0, blocks: 0, standards: 0, unused: 0 };
  let penalty = 0;
  for (const i of issues) {
    counts[i.category]++;
    penalty += i.severity === 'error' ? 8 : i.severity === 'warning' ? 2 : 0.25;
  }
  return { at: Date.now(), score: Math.max(0, Math.round(100 - penalty)), entities: d.entities.size, issues, counts };
}

/** Corrige los problemas marcados como corregibles. Devuelve el número de correcciones. */
export function applyHealthFixes(tx: Transaction, doc: CadDocument, report: HealthReport): number {
  const d = doc.data;
  let fixes = 0;
  const removed = new Set<Id>();
  const alive = (id: Id) => d.entities.has(id) && !removed.has(id);
  const remove = (id: Id) => {
    if (!alive(id)) return;
    removed.add(id);
    tx.removeEntity(id);
    fixes++;
  };
  const patchEntities = (ids: Id[] | undefined, patch: (e: Entity) => Partial<Entity>) => {
    for (const id of ids ?? []) {
      if (!alive(id)) continue;
      tx.updateEntity(id, patch(d.entities.get(id)!) as never);
      fixes++;
    }
  };
  for (const issue of report.issues) {
    if (!issue.fixable) continue;
    switch (issue.code) {
      case 'orphan-owner':
      case 'invalid-geometry':
      case 'zero-length':
      case 'duplicate':
      case 'missing-block':
      case 'block-cycle':
        for (const id of issue.entityIds ?? []) remove(id);
        break;
      case 'near-closed-polyline':
        patchEntities(issue.entityIds, (e) => ({ closed: true, vertices: (e as LwPolylineEntity).vertices.slice(0, -1) }) as Partial<Entity>);
        break;
      case 'missing-layer':
        patchEntities(issue.entityIds, () => ({ layer: LAYER0_ID }));
        break;
      case 'missing-linetype':
        patchEntities(issue.entityIds, () => ({ linetype: 'ByLayer' }));
        if (issue.record?.coll === 'layers') {
          tx.update('layers', issue.record.id, { linetype: LT_CONTINUOUS_ID });
          fixes++;
        }
        break;
      case 'missing-style': {
        const s = doc.settings;
        patchEntities(issue.entityIds, (e) => ({ style: e.type === 'dimension' || e.type === 'leader' ? s.currentDimStyle : e.type === 'mleader' ? s.currentMLeaderStyle : e.type === 'table' ? s.currentTableStyle : e.type === 'mline' ? s.currentMLineStyle : s.currentTextStyle }) as Partial<Entity>);
        break;
      }
      case 'text-height':
        patchEntities(issue.entityIds, () => ({ height: doc.settings.textHeight || 2.5 }) as Partial<Entity>);
        break;
      case 'broken-group':
        if (issue.record) {
          const g = d.groups.get(issue.record.id);
          if (g) {
            tx.update('groups', g.id, { members: g.members.filter((m) => d.entities.has(m)) });
            fixes++;
          }
        }
        break;
      case 'dimstyle':
        if (issue.record) {
          tx.update('dimStyles', issue.record.id, { textStyle: d.textStyles.has(TEXTSTYLE_STANDARD_ID) ? TEXTSTYLE_STANDARD_ID : [...d.textStyles.keys()][0] });
          fixes++;
        }
        break;
      default:
        break;
    }
  }
  return fixes;
}

/** Objetos afectados por los problemas del informe (sin repetir). */
export function affectedEntities(report: HealthReport): Id[] {
  return [...new Set(report.issues.flatMap((i) => i.entityIds ?? []))];
}
