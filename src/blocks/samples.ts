import type { Vec2 } from '../geometry/vec';
import type { CadDocument, Transaction } from '../document/document';
import { LAYER0_ID, TEXTSTYLE_STANDARD_ID } from '../document/defaults';
import { newId } from '../document/ids';
import type {
  ArcEntity,
  AttdefEntity,
  BlockRecord,
  CircleEntity,
  DynAction,
  DynamicBlockDefinition,
  DynParam,
  Entity,
  EntityBase,
  Id,
  LineEntity,
  LwPolylineEntity,
  ValueSet,
} from '../document/types';

type NoBase<E extends Entity> = Omit<E, keyof EntityBase> & { type: E['type'] };

function base(blockId: Id): Omit<EntityBase, 'id' | 'type' | 'order'> {
  return { owner: blockId, layer: LAYER0_ID, color: 'ByBlock', linetype: 'ByBlock', linetypeScale: 1, lineweight: -2, transparency: 'ByBlock', visible: true };
}

function add<E extends Entity>(tx: Transaction, blockId: Id, props: NoBase<E>, extra: Partial<EntityBase> = {}): E {
  return tx.addEntity<E>({ ...base(blockId), ...props, ...extra } as never);
}

const VS = (o: Partial<ValueSet> = {}): ValueSet => ({ kind: 'none', ...o });
const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0, bulge: 0 },
  { x: x1, y: y0, bulge: 0 },
  { x: x1, y: y1, bulge: 0 },
  { x: x0, y: y1, bulge: 0 },
];
const frame = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function makeBlock(tx: Transaction, doc: CadDocument, name: string, description: string, category: string, basePoint: Vec2 = { x: 0, y: 0 }): BlockRecord {
  const existing = doc.findByName('blocks', name);
  if (existing) {
    for (const e of doc.entitiesOf(existing.id)) tx.removeEntity(e.id);
    tx.remove('blocks', existing.id);
  }
  const b: BlockRecord = { id: newId('blk'), name, kind: 'normal', basePoint, description, units: 'mm', explodable: true, scaleUniformly: false, annotative: false, library: 'local', category, favorite: true, revision: 1 };
  tx.add('blocks', b);
  return b;
}

function dyn(parameters: DynParam[], actions: DynAction[], extra: Partial<DynamicBlockDefinition> = {}): DynamicBlockDefinition {
  return { parameters, actions, constraints: [], lookups: [], variables: [], propertyOrder: [], ...extra };
}

const P = { showInProperties: true, chainActions: false } as const;

/** Crea (o recrea) los bloques dinámicos de ejemplo en el documento. */
export function installDynamicSamples(doc: CadDocument): Id[] {
  return doc.transact('DYNBLOCKSAMPLES', (tx) => {
    const ids: Id[] = [];

    // 1 ─ Panel ajustable: ancho y alto con estiramiento; divisor centrado encadenado.
    {
      const b = makeBlock(tx, doc, 'FM Panel ajustable', 'Panel rectangular con ancho (300–2400, paso 50) y alto (lista 600/900/1200) estirables; montante central a mitad del ancho.', 'Arquitectura 2D');
      const r = add<LwPolylineEntity>(tx, b.id, { type: 'lwpolyline', vertices: rect(0, 0, 1200, 600), closed: true });
      const mid = add<LineEntity>(tx, b.id, { type: 'line', start: { x: 600, y: 0 }, end: { x: 600, y: 600 } });
      const tag = add<AttdefEntity>(tx, b.id, { type: 'attdef', tag: 'PANEL', prompt: 'Código de panel', defaultValue: 'P-01', position: { x: 60, y: 60 }, height: 60, rotation: 0, style: TEXTSTYLE_STANDARD_ID, halign: 'left', valign: 'baseline', invisible: false, constant: false, verify: false, preset: false, lockPosition: false, multiline: false });
      const wId = newId('prm');
      const hId = newId('prm');
      const params: DynParam[] = [
        { ...P, id: wId, type: 'linear', name: 'Ancho', label: 'Ancho', gripCount: 1, base: { x: 0, y: -120 }, end: { x: 1200, y: -120 }, baseLocation: 'start', valueSet: VS({ kind: 'increment', increment: 50, min: 300, max: 2400 }) },
        { ...P, id: hId, type: 'linear', name: 'Alto', label: 'Alto', gripCount: 1, base: { x: -120, y: 0 }, end: { x: -120, y: 600 }, baseLocation: 'start', valueSet: VS({ kind: 'list', list: [600, 900, 1200] }) },
      ];
      const actions: DynAction[] = [
        { id: newId('act'), type: 'stretch', name: 'Estirar ancho', paramId: wId, selection: [r.id, mid.id], frame: frame(1100, -50, 1300, 1400), paramPoint: 'end', axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
        { id: newId('act'), type: 'move', name: 'Centrar montante', paramId: wId, selection: [mid.id], paramPoint: 'end', axis: 'xy', distanceMultiplier: 0.5, angleOffset: 0 },
        { id: newId('act'), type: 'stretch', name: 'Estirar alto', paramId: hId, selection: [r.id, mid.id], frame: frame(-50, 500, 2500, 1300), paramPoint: 'end', axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
      ];
      void tag;
      tx.update('blocks', b.id, { dynamic: dyn(params, actions, { propertyOrder: [wId, hId] }) });
      ids.push(b.id);
    }

    // 2 ─ Símbolo eléctrico con estados de visibilidad.
    {
      const b = makeBlock(tx, doc, 'FM Símbolo eléctrico', 'Símbolo de toma/interruptor/luminaria con estados de visibilidad y atributo de circuito.', 'Electricidad');
      const c = add<CircleEntity>(tx, b.id, { type: 'circle', center: { x: 0, y: 0 }, radius: 5 });
      const s1 = add<LineEntity>(tx, b.id, { type: 'line', start: { x: -2, y: -3 }, end: { x: -2, y: 3 } });
      const s2 = add<LineEntity>(tx, b.id, { type: 'line', start: { x: 2, y: -3 }, end: { x: 2, y: 3 } });
      const d1 = add<LineEntity>(tx, b.id, { type: 'line', start: { x: -3.5, y: -3 }, end: { x: -3.5, y: 3 } });
      const d2 = add<LineEntity>(tx, b.id, { type: 'line', start: { x: 3.5, y: -3 }, end: { x: 3.5, y: 3 } });
      const sw = add<LineEntity>(tx, b.id, { type: 'line', start: { x: 0, y: 5 }, end: { x: 7, y: 12 } });
      const swt = add<LineEntity>(tx, b.id, { type: 'line', start: { x: 7, y: 12 }, end: { x: 9.5, y: 9.5 } });
      const x1 = add<LineEntity>(tx, b.id, { type: 'line', start: { x: -3.54, y: -3.54 }, end: { x: 3.54, y: 3.54 } });
      const x2 = add<LineEntity>(tx, b.id, { type: 'line', start: { x: -3.54, y: 3.54 }, end: { x: 3.54, y: -3.54 } });
      const att = add<AttdefEntity>(tx, b.id, { type: 'attdef', tag: 'CIRCUITO', prompt: 'Circuito', defaultValue: 'C1', position: { x: 7, y: -7 }, height: 2.5, rotation: 0, style: TEXTSTYLE_STANDARD_ID, halign: 'left', valign: 'baseline', invisible: false, constant: false, verify: false, preset: false, lockPosition: false, multiline: false });
      const visId = newId('prm');
      const params: DynParam[] = [
        {
          ...P,
          id: visId,
          type: 'visibility',
          name: 'Tipo',
          label: 'Tipo de símbolo',
          gripCount: 1,
          position: { x: -8, y: 8 },
          defaultState: 'Toma simple',
          states: [
            { name: 'Toma simple', visible: [c.id, s1.id, s2.id] },
            { name: 'Toma doble', visible: [c.id, s1.id, s2.id, d1.id, d2.id] },
            { name: 'Interruptor', visible: [c.id, sw.id, swt.id] },
            { name: 'Luminaria', visible: [c.id, x1.id, x2.id] },
          ],
        },
      ];
      void att;
      tx.update('blocks', b.id, { dynamic: dyn(params, []) });
      ids.push(b.id);
    }

    // 3 ─ Soporte mecánico con ancho variable, tabla de consulta y simetría.
    {
      const b = makeBlock(tx, doc, 'FM Soporte mecánico', 'Placa de anclaje con ancho variable (tabla S/M/L), taladros que se reubican y simetría de orientación.', 'Mecánica');
      const plate = add<LwPolylineEntity>(tx, b.id, {
        type: 'lwpolyline',
        closed: true,
        vertices: [
          { x: 0, y: 0, bulge: 0 },
          { x: 120, y: 0, bulge: 0 },
          { x: 120, y: 40, bulge: 0 },
          { x: 70, y: 40, bulge: 0 },
          { x: 60, y: 60, bulge: 0 },
          { x: 50, y: 40, bulge: 0 },
          { x: 0, y: 40, bulge: 0 },
        ],
      });
      const h1 = add<CircleEntity>(tx, b.id, { type: 'circle', center: { x: 15, y: 20 }, radius: 6 });
      const h2 = add<CircleEntity>(tx, b.id, { type: 'circle', center: { x: 105, y: 20 }, radius: 6 });
      const axis = add<LineEntity>(tx, b.id, { type: 'line', start: { x: 60, y: -10 }, end: { x: 60, y: 70 } }, { linetype: 'lt-center' });
      const wId = newId('prm');
      const flipId = newId('prm');
      const lkId = newId('prm');
      const tableId = newId('lkt');
      const params: DynParam[] = [
        { ...P, id: wId, type: 'linear', name: 'Ancho', label: 'Ancho', gripCount: 2, base: { x: 0, y: -25 }, end: { x: 120, y: -25 }, baseLocation: 'middle', valueSet: VS({ min: 60, max: 400 }) },
        { ...P, id: flipId, type: 'flip', name: 'Orientación', label: 'Invertir', gripCount: 1, base: { x: -20, y: 20 }, end: { x: 140, y: 20 }, labelNotFlipped: 'Arriba', labelFlipped: 'Abajo' },
        { ...P, id: lkId, type: 'lookup', name: 'Tamaño', label: 'Tamaño', gripCount: 1, position: { x: 130, y: 55 }, tableId },
      ];
      const actions: DynAction[] = [
        { id: newId('act'), type: 'stretch', name: 'Estirar derecha', paramId: wId, selection: [plate.id], frame: frame(100, -10, 200, 50), paramPoint: 'end', axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
        { id: newId('act'), type: 'stretch', name: 'Estirar izquierda', paramId: wId, selection: [plate.id], frame: frame(-80, -10, 20, 50), paramPoint: 'base', axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
        { id: newId('act'), type: 'move', name: 'Taladro derecho', paramId: wId, selection: [h2.id], paramPoint: 'end', axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
        { id: newId('act'), type: 'move', name: 'Taladro izquierdo', paramId: wId, selection: [h1.id], paramPoint: 'base', axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
        { id: newId('act'), type: 'flip', name: 'Invertir', paramId: flipId, selection: [plate.id, h1.id, h2.id, axis.id] },
        { id: newId('act'), type: 'lookup', name: 'Consulta de tamaño', paramId: lkId, selection: [], tableId },
      ];
      const lookups = [{ id: tableId, name: 'Tamaños', inputs: [wId], lookupName: 'Tamaño', reverse: true, rows: [{ label: 'S', inputs: [90] }, { label: 'M', inputs: [120] }, { label: 'L', inputs: [180] }, { label: 'XL', inputs: [260] }] }];
      tx.update('blocks', b.id, { dynamic: dyn(params, actions, { lookups, propertyOrder: [lkId, wId, flipId] }) });
      ids.push(b.id);
    }

    // 4 ─ Brida con matriz polar de pernos (variable de usuario + giro).
    {
      const b = makeBlock(tx, doc, 'FM Brida con pernos', 'Brida circular: número de pernos por variable de usuario, giro inicial y diámetro exterior escalable.', 'Mecánica');
      const outer = add<CircleEntity>(tx, b.id, { type: 'circle', center: { x: 0, y: 0 }, radius: 50 });
      const inner = add<CircleEntity>(tx, b.id, { type: 'circle', center: { x: 0, y: 0 }, radius: 20 });
      const bolt = add<CircleEntity>(tx, b.id, { type: 'circle', center: { x: 36, y: 0 }, radius: 4 });
      const pcd = add<CircleEntity>(tx, b.id, { type: 'circle', center: { x: 0, y: 0 }, radius: 36 }, { linetype: 'lt-center' });
      const rotId = newId('prm');
      const dId = newId('prm');
      const params: DynParam[] = [
        { ...P, id: rotId, type: 'rotation', name: 'Giro', label: 'Giro inicial', gripCount: 1, base: { x: 0, y: 0 }, radius: 36, angle: 0, valueSet: VS({ kind: 'increment', increment: Math.PI / 36 }) },
        { ...P, id: dId, type: 'linear', name: 'Diametro', label: 'Diámetro exterior', gripCount: 1, base: { x: -50, y: -62 }, end: { x: 50, y: -62 }, baseLocation: 'middle', valueSet: VS({ min: 60, max: 400 }) },
      ];
      const actions: DynAction[] = [
        { id: newId('act'), type: 'array', name: 'Matriz polar de pernos', paramId: rotId, selection: [bolt.id], columnOffset: 0, rowOffset: 0, polarCount: 'Pernos', fillAngle: 360 },
        { id: newId('act'), type: 'scale', name: 'Escalar brida', paramId: dId, selection: [outer.id, inner.id, bolt.id, pcd.id], baseType: 'independent', basePoint: { x: 0, y: 0 }, axis: 'xy' },
      ];
      tx.update('blocks', b.id, { dynamic: dyn(params, actions, { variables: [{ name: 'Pernos', expression: '6', exposed: true, readOnly: false, description: 'Número de pernos' }], propertyOrder: [dId, rotId] }) });
      ids.push(b.id);
    }

    // 5 ─ Puerta (símbolo 2D, no BIM): ancho por lista, apertura por simetrías.
    {
      const b = makeBlock(tx, doc, 'FM Puerta 2D', 'Símbolo de puerta abatible 2D: ancho normalizado y sentido de apertura con dos simetrías. No es un objeto BIM.', 'Arquitectura 2D');
      const leaf = add<LineEntity>(tx, b.id, { type: 'line', start: { x: 0, y: 0 }, end: { x: 0, y: 800 } });
      const swing = add<ArcEntity>(tx, b.id, { type: 'arc', center: { x: 0, y: 0 }, radius: 800, startAngle: 0, endAngle: Math.PI / 2 });
      const jambL = add<LineEntity>(tx, b.id, { type: 'line', start: { x: 0, y: 0 }, end: { x: 0, y: -100 } });
      const jambR = add<LineEntity>(tx, b.id, { type: 'line', start: { x: 800, y: 0 }, end: { x: 800, y: -100 } });
      const wId = newId('prm');
      const f1 = newId('prm');
      const f2 = newId('prm');
      const params: DynParam[] = [
        { ...P, id: wId, type: 'linear', name: 'Ancho', label: 'Ancho de hoja', gripCount: 1, base: { x: 0, y: -160 }, end: { x: 800, y: -160 }, baseLocation: 'start', valueSet: VS({ kind: 'list', list: [700, 800, 900, 1000, 1200] }), chainActions: false },
        { ...P, id: f1, type: 'flip', name: 'Mano', label: 'Mano', gripCount: 1, base: { x: 400, y: -250 }, end: { x: 400, y: 900 }, labelNotFlipped: 'Izquierda', labelFlipped: 'Derecha', chainActions: true },
        { ...P, id: f2, type: 'flip', name: 'Sentido', label: 'Sentido', gripCount: 1, base: { x: -200, y: -50 }, end: { x: 1000, y: -50 }, labelNotFlipped: 'Interior', labelFlipped: 'Exterior' },
      ];
      const actions: DynAction[] = [
        { id: newId('act'), type: 'scale', name: 'Escalar hoja', paramId: wId, selection: [leaf.id, swing.id], baseType: 'independent', basePoint: { x: 0, y: 0 }, axis: 'xy' },
        { id: newId('act'), type: 'move', name: 'Mover jamba', paramId: wId, selection: [jambR.id, f1], paramPoint: 'end', axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
        { id: newId('act'), type: 'move', name: 'Centrar eje de mano', paramId: wId, selection: [f1], paramPoint: 'end', axis: 'xy', distanceMultiplier: -0.5, angleOffset: 0 },
        { id: newId('act'), type: 'flip', name: 'Mano', paramId: f1, selection: [leaf.id, swing.id, jambL.id, jambR.id] },
        { id: newId('act'), type: 'flip', name: 'Sentido', paramId: f2, selection: [leaf.id, swing.id, jambL.id, jambR.id] },
      ];
      tx.update('blocks', b.id, { dynamic: dyn(params, actions, { propertyOrder: [wId, f1, f2] }) });
      ids.push(b.id);
    }

    return ids;
  });
}
