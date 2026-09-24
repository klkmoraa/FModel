import type { BBox } from '../geometry/bbox';
import { emptyBox, expandBox, isEmptyBox } from '../geometry/bbox';
import type { Curve } from '../geometry/curves';
import { curveBBox } from '../geometry/curves';
import type { Vec2 } from '../geometry/vec';
import type { DocChangeEvent } from '../document/document';
import { CadDocument } from '../document/document';
import type { BlockRecord, DynamicInstanceState, Entity, Id } from '../document/types';
import { resolveFieldsText } from './fields';
import type { BlockCacheEntry, BlockEvaluation, EvalContext, GripDef, PdfSegmentIndex, SnapPointDef, TextMeasurer } from './registry';
import { kindOf } from './registry';
import { measureText } from './text';
import { registerAllKinds } from './kinds';

registerAllKinds();

export type DynamicEvaluator = (ctx: EvalContext, block: BlockRecord, entities: Entity[], dyn: DynamicInstanceState | undefined) => Entity[];

function isRepresentableBox(box: BBox): boolean {
  return !isEmptyBox(box) &&
    [box.minX, box.minY, box.maxX, box.maxY, box.maxX - box.minX, box.maxY - box.minY].every(Number.isFinite);
}

function unboundedBox(): BBox {
  return { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };
}

function includeRepresentableBox(target: BBox, candidate: BBox): boolean {
  if (!isRepresentableBox(candidate)) return false;
  const merged = { ...target };
  expandBox(merged, candidate);
  if (!isRepresentableBox(merged)) return false;
  Object.assign(target, merged);
  return true;
}

/**
 * Contexto de evaluación del modelo: cachés de definiciones de bloque, medición de
 * texto y resolución de campos. Se invalida con los eventos del documento.
 */
export class ModelContext implements EvalContext {
  measureText: TextMeasurer = measureText;
  annotationScale = 1;
  depth = 0;
  dynamicEvaluator?: DynamicEvaluator;
  dynamicGrips?: (e: Entity) => GripDef[];
  moveDynamicGrip?: (e: Entity, gripId: string, to: Vec2) => Entity | null;
  pdfGeometry?: (assetId: Id, page: number) => PdfSegmentIndex | null;
  /** nombre de la presentación activa para campos */
  sheetName = 'Modelo';
  /** nombre de archivo para campos */
  fileName = '';

  private evalCache = new Map<string, BlockEvaluation>();
  private entryCache = new Map<string, BlockCacheEntry>();
  /** protección contra referencias circulares de bloques */
  private visiting = new Set<Id>();
  private evaluating = new Set<Id>();
  private unsubscribe: () => void;
  /** versión de bloques: cambia cuando cualquier definición cambia */
  blocksVersion = 0;

  constructor(public doc: CadDocument) {
    this.unsubscribe = doc.subscribe((e) => this.onChange(e));
  }

  dispose() {
    this.unsubscribe();
  }

  private onChange(e: DocChangeEvent) {
    if (e.source === 'load' || e.source === 'reset') {
      this.invalidateBlocks();
      return;
    }
    for (const c of e.changes) {
      if (c.coll === 'blocks' || c.coll === 'textStyles' || c.coll === 'dimStyles' || c.coll === 'mleaderStyles' || c.coll === 'tableStyles' || c.coll === 'mlineStyles' || c.coll === 'settings') {
        this.invalidateBlocks();
        return;
      }
      if (c.coll === 'entities') {
        const owner = ((c.after ?? c.before) as Entity).owner;
        const before = c.before as Entity | undefined;
        if (this.doc.data.blocks.has(owner) || (before && this.doc.data.blocks.has(before.owner))) {
          this.invalidateBlocks();
          return;
        }
      }
    }
  }

  invalidateBlocks() {
    this.evalCache.clear();
    this.entryCache.clear();
    this.blocksVersion++;
  }

  private key(blockId: Id, dyn?: DynamicInstanceState): string {
    return dyn ? `${blockId}|${JSON.stringify(dyn)}` : blockId;
  }

  evaluateBlock(blockId: Id, dyn?: DynamicInstanceState): BlockEvaluation {
    const key = this.key(blockId, dyn);
    const cached = this.evalCache.get(key);
    if (cached) return cached;
    const block = this.doc.data.blocks.get(blockId);
    if (!block || this.evaluating.has(blockId)) return { entities: [], variant: key, basePoint: { x: 0, y: 0 } };
    let entities = this.doc.entitiesOf(blockId);
    if (block.dynamic && this.dynamicEvaluator) {
      this.evaluating.add(blockId);
      try {
        entities = this.dynamicEvaluator(this, block, entities, dyn);
      } finally {
        this.evaluating.delete(blockId);
      }
    }
    const ev = { entities, variant: key, basePoint: block.basePoint };
    if (this.evalCache.size > 4000) this.evalCache.clear();
    this.evalCache.set(key, ev);
    return ev;
  }

  blockCache(blockId: Id, dyn?: DynamicInstanceState): BlockCacheEntry {
    const key = this.key(blockId, dyn);
    const cached = this.entryCache.get(key);
    if (cached) return cached;
    if (this.visiting.has(blockId) || this.depth > 16) return { curves: [], bbox: emptyBox(), snaps: [], attdefs: [] };
    this.visiting.add(blockId);
    this.depth++;
    try {
      const ev = this.evaluateBlock(blockId, dyn);
      const curves: Curve[] = [];
      const snaps: SnapPointDef[] = [];
      const attdefs: Entity[] = [];
      const bbox: BBox = emptyBox();
      let bboxRepresentable = true;
      for (const e of ev.entities) {
        if (!e.visible) continue;
        if (e.type === 'attdef') {
          if (!e.constant) attdefs.push(e);
          continue;
        }
        const k = kindOf(e);
        const cs = k.curves(e, this);
        curves.push(...cs);
        const b = k.bbox(e, this);
        if (isRepresentableBox(b)) {
          if (!includeRepresentableBox(bbox, b)) bboxRepresentable = false;
        } else {
          const curveBounds = emptyBox();
          let hasBoundableCurve = false;
          let curvesRepresentable = true;
          for (const c of cs) {
            if (c.kind === 'ray' || c.kind === 'xline') continue;
            const cb = curveBBox(c);
            if (!isRepresentableBox(cb) || !includeRepresentableBox(curveBounds, cb)) {
              curvesRepresentable = false;
              break;
            }
            hasBoundableCurve = true;
          }
          if (!curvesRepresentable || (!isEmptyBox(b) && !hasBoundableCurve) || (hasBoundableCurve && !includeRepresentableBox(bbox, curveBounds))) bboxRepresentable = false;
        }
        snaps.push(...k.snapPoints(e, this));
      }
      const entry = { curves, bbox: bboxRepresentable ? bbox : unboundedBox(), snaps, attdefs };
      if (this.entryCache.size > 4000) this.entryCache.clear();
      this.entryCache.set(key, entry);
      return entry;
    } finally {
      this.depth--;
      this.visiting.delete(blockId);
    }
  }

  resolveFields(text: string, owner?: Entity): string {
    if (!text.includes('{{')) return text;
    return resolveFieldsText(text, this, owner);
  }
}

export function createContext(doc: CadDocument): ModelContext {
  return new ModelContext(doc);
}
