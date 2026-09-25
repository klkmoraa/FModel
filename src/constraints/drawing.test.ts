import { beforeEach, describe, expect, it } from 'vitest';
import type { CadDocument } from '../document/document';
import { createDocument, entityDefaults } from '../document/defaults';
import type { ArcEntity, DrawingConstraint, Entity, GeoRef, Id, LineEntity, LwPolylineEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import {
  addDrawingConstraint,
  addParameter,
  applyParameterSet,
  ConstraintError,
  drawingConstraintState,
  inferConstraints,
  installDrawingConstraints,
  parameterScope,
  planConstraint,
  previewConstrained,
  removeDrawingConstraint,
  renameNamed,
  saveParameterSet,
  setNamedExpression,
} from './drawing';

let doc: CadDocument;
let infer = false;

beforeEach(() => {
  doc = createDocument();
  infer = false;
  installDrawingConstraints(doc, { infer: () => infer });
});

const addLine = (ax: number, ay: number, bx: number, by: number) => doc.transact('LINE', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: ax, y: ay }, end: { x: bx, y: by } }));
const ref = (entityId: Id, part: string): GeoRef => ({ entityId, part });
const geo = (type: string, refs: GeoRef[]): DrawingConstraint => ({ id: `c${Math.random().toString(36).slice(2)}`, kind: 'geometric', type: type as never, refs, enabled: true, owner: MODEL_SPACE_ID });
const dim = (name: string, type: string, refs: GeoRef[], expression: string): DrawingConstraint => ({ id: `d${name}`, kind: 'dimensional', type: type as never, name, refs, expression, isParameter: false, valueSet: { kind: 'none' }, owner: MODEL_SPACE_ID });
const constrain = (c: DrawingConstraint, prefer?: Id[]) => doc.transact('GEOMCONSTRAINT', (tx) => addDrawingConstraint(tx, c, prefer ? new Set(prefer) : undefined));
const line = (id: Id) => doc.entity(id) as LineEntity;

function rectangle() {
  const b = addLine(0, 0, 10, 0);
  const r = addLine(10, 0, 10, 5);
  const t = addLine(10, 5, 0, 5);
  const l = addLine(0, 5, 0, 0);
  constrain(geo('coincident', [ref(b.id, 'end'), ref(r.id, 'start')]));
  constrain(geo('coincident', [ref(r.id, 'end'), ref(t.id, 'start')]));
  constrain(geo('coincident', [ref(t.id, 'end'), ref(l.id, 'start')]));
  constrain(geo('coincident', [ref(l.id, 'end'), ref(b.id, 'start')]));
  constrain(geo('horizontal', [ref(b.id, 'edge')]));
  constrain(geo('horizontal', [ref(t.id, 'edge')]));
  constrain(geo('vertical', [ref(r.id, 'edge')]));
  constrain(geo('vertical', [ref(l.id, 'edge')]));
  return { b: b.id, r: r.id, t: t.id, l: l.id };
}

describe('fórmulas del dibujo', () => {
  it('evalúa parámetros en orden de dependencias y marca ciclos y errores', () => {
    doc.transact('P', (tx) => {
      addParameter(tx, 'luz', '4');
      addParameter(tx, 'ancho', '2 * luz + 0.3');
    });
    const scope = parameterScope(doc.data);
    expect(scope.values.get('ancho')).toBeCloseTo(8.3, 12);
    const bad = parameterScope(doc.data, new Map([['luz', 'ancho + 1']]));
    expect(bad.errors.get('luz')?.es).toMatch(/circular/);
    expect(bad.values.has('ancho')).toBe(false);
    expect(() => doc.transact('P', (tx) => addParameter(tx, 'x', 'noexiste * 2'))).toThrow(ConstraintError);
    expect(() => doc.transact('P', (tx) => addParameter(tx, 'luz', '1'))).toThrow(/en uso/);
    expect(() => doc.transact('P', (tx) => addParameter(tx, '2mal', '1'))).toThrow(/Nombre no válido/);
  });

  it('una cota de restricción no admite medidas nulas o negativas', () => {
    const l = addLine(0, 0, 10, 0);
    const d = dim('d1', 'aligned', [ref(l.id, 'edge')], '10');
    constrain(d);
    expect(() => doc.transact('E', (tx) => setNamedExpression(tx, 'd1', '-3'))).toThrow(/mayor que cero/);
    expect(line(l.id).end.x).toBeCloseTo(10, 9);
  });
});

describe('reactor de restricciones', () => {
  it('al mover un objeto, los unidos por coincidencia lo siguen y deshacer lo revierte todo', () => {
    const a = addLine(0, 0, 10, 0);
    const b = addLine(10, 0, 10, 10);
    constrain(geo('coincident', [ref(a.id, 'end'), ref(b.id, 'start')]));
    doc.transact('MOVE', (tx) => tx.updateEntity<LineEntity>(a.id, { start: { x: 0, y: 3 }, end: { x: 12, y: 3 } }));
    expect(line(a.id).end).toEqual({ x: 12, y: 3 });
    expect(line(b.id).start.x).toBeCloseTo(12, 9);
    expect(line(b.id).start.y).toBeCloseTo(3, 9);
    doc.undo();
    expect(line(a.id).end).toEqual({ x: 10, y: 0 });
    expect(line(b.id).start).toEqual({ x: 10, y: 0 });
    doc.redo();
    expect(line(b.id).start.x).toBeCloseTo(12, 9);
  });

  it('borrar un objeto retira sus restricciones y deshacer las recupera', () => {
    const a = addLine(0, 0, 10, 0);
    const b = addLine(10, 0, 10, 10);
    const c = geo('coincident', [ref(a.id, 'end'), ref(b.id, 'start')]);
    constrain(c);
    doc.transact('ERASE', (tx) => tx.removeEntity(b.id));
    expect(doc.data.constraints.has(c.id)).toBe(false);
    doc.undo();
    expect(doc.data.constraints.has(c.id)).toBe(true);
    expect(doc.entity(b.id)).toBeDefined();
  });

  it('un parámetro gobierna el ancho y el primer punto queda anclado', () => {
    const { b, r } = rectangle();
    doc.transact('P', (tx) => addParameter(tx, 'W', '10'));
    constrain(dim('ancho', 'linear-h', [ref(b, 'start'), ref(b, 'end')], 'W'));
    constrain(dim('alto', 'linear-v', [ref(r, 'start'), ref(r, 'end')], 'W / 2'));
    doc.transact('PARAM', (tx) => setNamedExpression(tx, 'W', '16'));
    expect(line(b).start.x).toBeCloseTo(0, 9);
    expect(line(b).start.y).toBeCloseTo(0, 9);
    expect(line(b).end.x).toBeCloseTo(16, 8);
    expect(line(r).end.y - line(r).start.y).toBeCloseTo(8, 8);
    doc.undo();
    expect(line(b).end.x).toBeCloseTo(10, 9);
  });

  it('un valor imposible se rechaza sin tocar el dibujo', () => {
    const l = addLine(0, 0, 10, 0);
    constrain(geo('fixed', [ref(l.id, 'edge')]));
    const other = addLine(0, 2, 5, 2);
    constrain(geo('coincident', [ref(other.id, 'start'), ref(l.id, 'start')]));
    constrain(geo('coincident', [ref(other.id, 'end'), ref(l.id, 'end')]));
    const before = doc.data.entities.get(other.id);
    expect(() => constrain(dim('d1', 'aligned', [ref(other.id, 'edge')], '3'))).toThrow(/conflicto/);
    expect(doc.data.entities.get(other.id)).toBe(before);
    expect([...doc.data.constraints.values()].some((c) => c.kind === 'dimensional')).toBe(false);
  });

  it('rechaza restricciones duplicadas y redundantes', () => {
    const { b, t } = rectangle();
    expect(() => constrain(geo('horizontal', [ref(b, 'edge')]))).toThrow(/ya existe/);
    expect(() => constrain(geo('parallel', [ref(b, 'edge'), ref(t, 'edge')]))).toThrow(/redundante/);
  });

  it('la restricción nueva mueve el segundo objeto y respeta el preferido', () => {
    const a = addLine(0, 0, 10, 0);
    const b = addLine(0, 5, 9, 7);
    constrain(geo('parallel', [ref(a.id, 'edge'), ref(b.id, 'edge')]), [a.id]);
    expect(line(a.id).end).toEqual({ x: 10, y: 0 });
    expect(line(b.id).end.y - line(b.id).start.y).toBeCloseTo(0, 8);
  });

  it('la cota usada por una fórmula no se puede eliminar; renombrar actualiza las fórmulas', () => {
    const l = addLine(0, 0, 10, 0);
    const d = dim('d1', 'aligned', [ref(l.id, 'edge')], '10');
    constrain(d);
    doc.transact('P', (tx) => addParameter(tx, 'doble', 'd1 * 2'));
    expect(() => doc.transact('DEL', (tx) => removeDrawingConstraint(tx, d.id))).toThrow(/se usa en/);
    doc.transact('REN', (tx) => renameNamed(tx, 'd1', 'largo'));
    expect([...doc.data.parameters.values()][0].expression).toBe('largo * 2');
    expect(parameterScope(doc.data).values.get('doble')).toBeCloseTo(20, 9);
  });

  it('las polilíneas conservan sus referencias al añadir vértices al final y las pierden al insertar', () => {
    const p = doc.transact('PLINE', (tx) => tx.addEntity<LwPolylineEntity>({ ...entityDefaults(doc), type: 'lwpolyline', closed: false, vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }));
    const c = geo('horizontal', [ref(p.id, 'segment:0')]);
    constrain(c);
    doc.transact('PLINE', (tx) => tx.updateEntity<LwPolylineEntity>(p.id, { vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }] }));
    expect(doc.data.constraints.has(c.id)).toBe(true);
    doc.transact('PEDIT', (tx) => tx.updateEntity<LwPolylineEntity>(p.id, { vertices: [{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: 10, y: 0 }, { x: 10, y: 5 }] }));
    expect(doc.data.constraints.has(c.id)).toBe(false);
  });

  it('las variantes guardan y restauran los valores', () => {
    const l = addLine(0, 0, 10, 0);
    constrain(geo('fixed', [ref(l.id, 'start')]));
    constrain(dim('largo', 'aligned', [ref(l.id, 'edge')], '10'));
    const small = doc.transact('SET', (tx) => saveParameterSet(tx, 'Pequeña'));
    doc.transact('E', (tx) => setNamedExpression(tx, 'largo', '25'));
    expect(Math.hypot(line(l.id).end.x, line(l.id).end.y)).toBeCloseTo(25, 7);
    doc.transact('APPLY', (tx) => applyParameterSet(tx, small.id));
    expect(Math.hypot(line(l.id).end.x, line(l.id).end.y)).toBeCloseTo(10, 7);
  });
});

describe('inferencia', () => {
  it('AUTOCONSTRAIN sobre un rectángulo propone uniones y ejes sin redundancias', () => {
    const ids = [addLine(0, 0, 10, 0), addLine(10, 0, 10, 5), addLine(10, 5, 0, 5), addLine(0, 5, 0, 0)].map((l) => l.id);
    const found = inferConstraints(doc.data, ids, { distTol: 1e-3, angleTol: 0.01, pool: ids });
    const count = (t: string) => found.filter((c) => c.type === t).length;
    expect(count('coincident')).toBe(4);
    expect(count('horizontal')).toBe(2);
    expect(count('vertical')).toBe(2);
    expect(count('parallel') + count('perpendicular')).toBe(0);
    doc.transact('AUTO', (tx) => found.forEach((c) => tx.add('constraints', c)));
    expect(drawingConstraintState(doc.data, MODEL_SPACE_ID).conflicts.size).toBe(0);
  });

  it('con la inferencia activa, dibujar sobre un extremo crea la coincidencia', () => {
    const a = addLine(0, 0, 10, 0);
    infer = true;
    const b = addLine(10, 0, 15, 0);
    const types = [...doc.data.constraints.values()].map((c) => c.type).sort();
    expect(types).toContain('coincident');
    expect(types).toContain('horizontal');
    const coincident = [...doc.data.constraints.values()].find((c) => c.type === 'coincident')!;
    expect(coincident.refs.map((r) => r.entityId).sort()).toEqual([a.id, b.id].sort());
  });

  it('infiere tangencia en la unión de una línea y un arco', () => {
    const l = addLine(0, 0, 10, 0);
    const arc = doc.transact('ARC', (tx) => tx.addEntity<ArcEntity>({ ...entityDefaults(doc), type: 'arc', center: { x: 10, y: 5 }, radius: 5, startAngle: -Math.PI / 2, endAngle: 0 }));
    const found = inferConstraints(doc.data, [l.id, arc.id], { distTol: 1e-6, angleTol: 1e-6, pool: [l.id, arc.id] });
    expect(found.some((c) => c.type === 'tangent')).toBe(true);
    expect(found.some((c) => c.type === 'coincident')).toBe(true);
  });
});

describe('estado y previsualización', () => {
  it('un rectángulo fijado y acotado queda totalmente restringido', () => {
    const { b, r } = rectangle();
    expect(drawingConstraintState(doc.data, MODEL_SPACE_ID).freedom?.get(b)).toBe('partial');
    constrain(geo('fixed', [ref(b, 'start')]));
    constrain(dim('w', 'linear-h', [ref(b, 'start'), ref(b, 'end')], '10'));
    constrain(dim('h', 'linear-v', [ref(r, 'start'), ref(r, 'end')], '5'));
    const state = drawingConstraintState(doc.data, MODEL_SPACE_ID);
    for (const id of Object.values({ b, r })) expect(state.freedom?.get(id)).toBe('full');
    expect(state.conflicts.size).toBe(0);
  });

  it('la previsualización incluye los objetos arrastrados por las restricciones', () => {
    const a = addLine(0, 0, 10, 0);
    const b = addLine(10, 0, 10, 10);
    constrain(geo('coincident', [ref(a.id, 'end'), ref(b.id, 'start')]));
    const dragged: Entity = { ...line(a.id), end: { x: 15, y: 2 } };
    const preview = previewConstrained(doc.data, [dragged]);
    const follower = preview.find((e) => e.id === b.id) as LineEntity | undefined;
    expect(follower?.start.x).toBeCloseTo(15, 8);
    expect(line(b.id).start).toEqual({ x: 10, y: 0 });
  });

  it('planConstraint no modifica el documento', () => {
    const a = addLine(0, 0, 10, 0);
    const version = doc.version;
    const plan = planConstraint(doc.data, geo('vertical', [ref(a.id, 'edge')]));
    expect(plan.updates.size).toBe(1);
    expect(doc.version).toBe(version);
  });
});
