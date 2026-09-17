import type { Vec2 } from '../geometry/vec';
import type { DynamicInstanceState, InsertEntity } from '../document/types';
import type { Editor } from '../editor/editor';
import { applyValueSet, buildScope, paramValue } from './dynamic';

export interface DynPropRow {
  key: string;
  label: string;
  kind: 'number' | 'angle' | 'bool' | 'select';
  value: number | string | boolean;
  readOnly?: boolean;
  options?: { value: string; label: string }[];
  set(v: unknown): void;
}

/** Propiedades personalizadas de una instancia dinámica para la paleta Propiedades. */
export function dynamicPropertyRows(editor: Editor, e: InsertEntity): DynPropRow[] {
  const block = editor.doc.data.blocks.get(e.blockId);
  const def = block?.dynamic;
  if (!def) return [];
  const scope = buildScope(def, e.dynamic);
  const rows: DynPropRow[] = [];
  const commit = (mut: (s: DynamicInstanceState) => void) => {
    editor.doc.transact('DYNPROP', (tx) =>
      tx.updateEntity<InsertEntity>(e.id, (cur) => {
        const state: DynamicInstanceState = { values: { ...(cur.dynamic?.values ?? {}) }, visibilityState: cur.dynamic?.visibilityState, userValues: { ...(cur.dynamic?.userValues ?? {}) } };
        mut(state);
        return { ...cur, dynamic: state };
      }),
    );
  };
  const order = def.propertyOrder.length ? def.propertyOrder : def.parameters.map((p) => p.id);
  const params = [...def.parameters].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const p of params) {
    if (!p.showInProperties) continue;
    const v = paramValue(def, p, e.dynamic, scope);
    switch (p.type) {
      case 'linear':
        rows.push({
          key: p.id,
          label: p.label || p.name,
          kind: 'number',
          value: v as number,
          readOnly: !!p.expression,
          options: p.valueSet.kind === 'list' ? p.valueSet.list?.map((x) => ({ value: String(x), label: String(x) })) : undefined,
          set: (nv) => commit((s) => (s.values[p.id] = applyValueSet(Number(nv), p.valueSet))),
        });
        break;
      case 'rotation':
        rows.push({ key: p.id, label: p.label || p.name, kind: 'angle', value: ((v as number) * 180) / Math.PI, set: (nv) => commit((s) => (s.values[p.id] = applyValueSet((Number(nv) * Math.PI) / 180, p.valueSet))) });
        break;
      case 'polar': {
        const pv = v as Vec2;
        rows.push({ key: `${p.id}.d`, label: `${p.label || p.name} · distancia`, kind: 'number', value: pv.x, set: (nv) => commit((s) => (s.values[p.id] = { x: Number(nv), y: pv.y })) });
        rows.push({ key: `${p.id}.a`, label: `${p.label || p.name} · ángulo`, kind: 'angle', value: (pv.y * 180) / Math.PI, set: (nv) => commit((s) => (s.values[p.id] = { x: pv.x, y: (Number(nv) * Math.PI) / 180 })) });
        break;
      }
      case 'xy': {
        const pv = v as Vec2;
        rows.push({ key: `${p.id}.x`, label: `${p.label || p.name} X`, kind: 'number', value: pv.x, set: (nv) => commit((s) => (s.values[p.id] = { x: applyValueSet(Number(nv), p.xSet), y: pv.y })) });
        rows.push({ key: `${p.id}.y`, label: `${p.label || p.name} Y`, kind: 'number', value: pv.y, set: (nv) => commit((s) => (s.values[p.id] = { x: pv.x, y: applyValueSet(Number(nv), p.ySet) })) });
        break;
      }
      case 'flip':
        rows.push({ key: p.id, label: p.label || p.name, kind: 'select', value: v ? '1' : '0', options: [{ value: '0', label: p.labelNotFlipped }, { value: '1', label: p.labelFlipped }], set: (nv) => commit((s) => (s.values[p.id] = nv === '1' || nv === true)) });
        break;
      case 'visibility':
        rows.push({
          key: p.id,
          label: p.label || p.name,
          kind: 'select',
          value: String(v),
          options: p.states.map((st) => ({ value: st.name, label: st.name })),
          set: (nv) =>
            commit((s) => {
              s.visibilityState = String(nv);
              s.values[p.id] = String(nv);
            }),
        });
        break;
      case 'lookup': {
        const table = def.lookups.find((t) => t.id === p.tableId);
        rows.push({ key: p.id, label: table?.lookupName || p.label || p.name, kind: 'select', value: String(v ?? ''), options: [{ value: '', label: '—' }, ...(table?.rows.map((r) => ({ value: r.label, label: r.label })) ?? [])], set: (nv) => commit((s) => (s.values[p.id] = String(nv))) });
        break;
      }
    }
  }
  for (const c of def.constraints) {
    if (c.kind !== 'dimensional' || !c.isParameter) continue;
    const cur = e.dynamic?.values[c.id];
    const value = typeof cur === 'number' ? cur : scope[c.name];
    rows.push({ key: c.id, label: c.name, kind: c.type === 'angular' ? 'angle' : 'number', value: value ?? 0, set: (nv) => commit((s) => (s.values[c.id] = applyValueSet(Number(nv), c.valueSet))) });
  }
  for (const u of def.variables) {
    if (!u.exposed) continue;
    rows.push({ key: `var:${u.name}`, label: u.name, kind: 'number', value: scope[u.name] ?? 0, readOnly: u.readOnly, set: (nv) => commit((s) => (s.userValues = { ...(s.userValues ?? {}), [u.name]: Number(nv) })) });
  }
  return rows;
}
