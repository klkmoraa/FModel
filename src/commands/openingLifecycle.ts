import type { Entity, Id } from '../document/types';
import { newId } from '../document/ids';
import { buildWallAssembly, WallOpeningError, type WallOpeningSpec } from '../geometry/wallOpenings';
import { dot, dist, sub, scale, add, type Vec2 } from '../geometry/vec';
import { TOL } from '../geometry/tolerance';
import { liveWallSource, liveWallOutputs } from '../model/liveWallSource';
import { readWallOpening, readWallSource, createWallAssembly, updateWallAssembly, WallAssemblyError, type WallAssemblySource, type WallAssembly } from '../model/wallAssembly';
import { K, L, fail } from './helpers';
import { physicalSize } from './architectureHelpers';
import { CommandError, type CommandApi, type CommandDef, type PreviewSpec } from './types';

const unavailable = L('Selecciona un miembro editable de un muro compatible; el grupo completo debe estar visible y desbloqueado.', 'Select an editable member of a compatible wall; the entire group must be visible and unlocked.');
const explicit = L('Selecciona una jamba, hoja, arco o marco del hueco; un fragmento de muro no identifica un hueco.', 'Select an opening jamb, leaf, arc or frame; a wall fragment does not identify an opening.');
const TYPES = ['single', 'double', 'sliding', 'fixed', 'empty'] as const;
export function checked(api: CommandApi, id: Id) {
  try {
    const value = readWallSource(api.editor.doc, id);
    for (const member of value.assembly?.members ?? [value.anchorId]) {
      const e=api.editor.doc.entity(member),layer=e&&api.editor.doc.data.layers.get(e.layer);
      const hiddenSource=e?.type==='mline'&&liveWallSource(api.editor.doc,member)===member&&layer?.on&&!layer.frozen&&!layer.locked&&!e.locked;
      if(e?.owner!==api.editor.inputOwner||(!api.editor.isSelectable(member)&&!hiddenSource))fail(unavailable.es,unavailable.en);
    }
    return value;
  } catch (error) { if (error instanceof WallAssemblyError) fail(error.messageI18n.es, error.messageI18n.en); throw error; }
}
function opening(api: CommandApi, id: Id) {
  const wall = checked(api, id);
  try { return { ...readWallOpening(api.editor.doc, id), source: wall.source }; }
  catch (error) { if (error instanceof WallAssemblyError) fail(explicit.es, explicit.en); throw error; }
}
function validate(source: WallAssemblySource, openings: WallOpeningSpec[]) {
  try { return buildWallAssembly(source, openings); }
  catch (error) { if (error instanceof WallOpeningError) fail(error.messageI18n.es, error.messageI18n.en); throw error; }
}
/** Nearest point on the complete source path, independent of the cut fragments and screen zoom. */
function project(source: WallAssemblySource, point: Vec2) {
  let nearest = { segment: 0, offset: 0, distance: Infinity };
  const vertices = source.vertices;
  for (let i = 0; i < vertices.length - (source.closed ? 0 : 1); i++) {
    const a = vertices[i], delta = sub(vertices[(i + 1) % vertices.length], a), length = dist(a, vertices[(i + 1) % vertices.length]);
    const offset = Math.max(0, Math.min(length, dot(sub(point, a), scale(delta, 1 / length))));
    const distance = dist(point, add(a, scale(delta, offset / length)));
    if (distance < nearest.distance) nearest = { segment: i, offset, distance };
  }
  return { segment: nearest.segment, offset: nearest.offset };
}
function preview(api: CommandApi, source: WallAssemblySource, openings: WallOpeningSpec[], assembly: WallAssembly | null, anchorId: Id): PreviewSpec {
  const geometry = validate(source, openings), principal = api.editor.doc.entity(anchorId)!;
  const shape = [
    ...geometry.fragments.map(f => ({ key: f.key, type: 'mline', vertices: f.vertices, closed: f.closed, scale: source.scale, justification: source.justification, style: source.style })),
    ...geometry.symbols.map(s => s),
  ];
  const entities = shape.map((part, i) => ({ ...principal, ...part, visible:true, id: (i === 0 ? anchorId : assembly?.roles.get(part.key)) ?? `preview-${i}`, order: principal.order + i / 1000, owner: source.owner } as Entity));
  return { entities, hideIds: [...(assembly?.members??[anchorId]),...liveWallOutputs(api.editor.doc,anchorId)] };
}
function safePreview(api: CommandApi, source: WallAssemblySource, openings: WallOpeningSpec[], assembly: WallAssembly | null, anchorId: Id): PreviewSpec | null {
  try { return preview(api, source, openings, assembly, anchorId); }
  catch (error) { if (error instanceof CommandError) return null; throw error; }
}
function commit(api: CommandApi, label: string, source: WallAssemblySource, openings: WallOpeningSpec[], assembly: WallAssembly | null, anchorId: Id) {
  checked(api, anchorId); validate(source, openings);
  api.apply(label, tx => assembly ? updateWallAssembly(tx, anchorId, source, openings) : createWallAssembly(tx, anchorId, source, openings));
}
const widthKeyword = K('Width', 'Ancho', 'Width', ['a', 'w']);
const typeKeyword = K('Type', 'Tipo', 'Type', ['t']);
const sideKeyword = K('Side', 'Lado', 'Side', ['l', 's']);
const hingeKeyword = K('Hinge', 'Bisagra', 'Hinge', ['b', 'h']);
const typeChoices = TYPES.map(type => K(type, type === 'single' ? 'Sencilla' : type === 'double' ? 'Doble' : type === 'sliding' ? 'Corredera' : type === 'fixed' ? 'Fija' : 'Vacío', type[0].toUpperCase() + type.slice(1)));
async function widthInput(api: CommandApi, current: number): Promise<number> {
  const r = await api.getDistance({ prompt: L('Ancho en unidades del dibujo', 'Width in drawing units'), defaultValue: current });
  if (r.kind !== 'value') return current;
  if (!Number.isFinite(r.value) || r.value <= TOL.LINEAR) fail('Ancho positivo finito requerido.', 'Positive finite width required.');
  return r.value;
}
async function selectWall(api: CommandApi) {
  const result = await api.getEntity({ prompt: L('Selecciona un muro o miembro asociado', 'Select a wall or associated member'), types: ['mline', 'line', 'arc'] });
  return result.kind === 'entity' ? { id: result.id, ...checked(api, result.id) } : null;
}
async function selectOpening(api: CommandApi) {
  const result = await api.getEntity({ prompt: explicit, types: ['line', 'arc', 'mline'] });
  return result.kind === 'entity' ? { id: result.id, ...opening(api, result.id) } : null;
}
export function openingCommand(door: boolean): CommandDef {
  const name = door ? 'WALLDOOR' : 'WALLWINDOW';
  return {
    name, aliases: [door ? 'PUERTA' : 'VENTANA'], category: 'draw', icon: door ? 'door' : 'window', label: door ? L('Puerta', 'Door') : L('Ventana', 'Window'),
    description: L('Corta un hueco asociado al muro y conserva su edición nativa.', 'Cut an opening associated with the wall and retain native editing.'),
    help: L('Selecciona un muro o miembro asociado y centro en el recorrido completo. Ancho y Tipo; puerta: Lado/Bisagra. Intro confirma; Esc cancela. Hueco dentro del tramo recto, sin tocar esquinas ni otros huecos. 900/1200 mm por defecto (sin unidad 900/1200). Grupo legado incompleto no se asocia automáticamente.', 'Select a wall or associated member and center on the complete source path. Width and Type; door: Side/Hinge. Enter confirms; Esc cancels. Opening must fit a straight segment clear of corners and other openings. Defaults 900/1200 mm (unitless 900/1200). Incomplete legacy groups are not associated automatically.'),
    async run(api) {
      const wall = await selectWall(api); if (!wall) return;
      let spec: WallOpeningSpec = { id: newId('opening'), segment: 0, offset: 0, width: physicalSize(api, door ? 900 : 1200), type: door ? 'single' : 'fixed', side: 1, hingeEnd: false };
      const next = (p: Vec2) => ({ ...spec, ...project(wall.source, p) });
      const show = (s: WallOpeningSpec) => safePreview(api, wall.source, [...(wall.assembly?.openings ?? []), s], wall.assembly, wall.anchorId);
      let location: Vec2 | null = null;
      while (!location) {
        const r = await api.getPoint({ prompt: L('Centro del hueco · Ancho', 'Opening center · Width'), noOrtho: true, noSnap: true, keywords: [widthKeyword], preview: p => show(next(p)) });
        if (r.kind === 'keyword') { spec = { ...spec, width: await widthInput(api, spec.width) }; continue; }
        if (r.kind !== 'point') return;
        spec = next(r.p); validate(wall.source, [...(wall.assembly?.openings ?? []), spec]); location = r.p;
      }
      for (;;) {
        api.setPreview(show(spec));
        const r = await api.getPoint({ prompt: L('Punto recoloca centro · Ancho/Tipo/Lado/Bisagra · Intro confirma', 'Point repositions center · Width/Type/Side/Hinge · Enter confirms'), allowNone: true, noOrtho: true, noSnap: true, keywords: [widthKeyword, typeKeyword, ...(door ? [sideKeyword, hingeKeyword] : [])], preview: p => show(next(p)) ?? show(spec) });
        if (r.kind === 'none') break;
        if (r.kind === 'point') spec = next(r.p);
        else if (r.key === 'Width') spec = { ...spec, width: await widthInput(api, spec.width) };
        else if (r.key === 'Hinge') spec = { ...spec, hingeEnd: !spec.hingeEnd };
        else if (r.key === 'Side') spec = { ...spec, side: spec.side === 1 ? -1 : 1 };
        else if (r.key === 'Type') { const t = await api.getKeyword({ prompt: L('Tipo de hueco', 'Opening type'), keywords: typeChoices }); if (t.kind === 'keyword') spec = { ...spec, type: t.key as WallOpeningSpec['type'] }; }
        validate(wall.source, [...(wall.assembly?.openings ?? []), spec]);
      }
      commit(api, name, wall.source, [...(wall.assembly?.openings ?? []), spec], wall.assembly, wall.anchorId);
    },
  };
}
function operation(name: string, alias: string, label: ReturnType<typeof L>, help: ReturnType<typeof L>, run: CommandDef['run']): CommandDef {
  return { name, aliases: [alias], category: 'modify', icon: 'wall', label, description: help, help, run };
}
export const OPENINGMOVE = operation('OPENINGMOVE', 'MOVERHUECO', L('Mover hueco', 'Move opening'), L('Selecciona símbolo o jamba, indica nuevo centro sobre el mismo muro; Intro confirma, Esc cancela. Repara el hueco anterior.', 'Select symbol or jamb, place a new center on the same wall; Enter confirms, Esc cancels. Repairs the old gap.'), async api => {
  const selected = await selectOpening(api); if (!selected) return;
  const { assembly, opening: original, source } = selected;
  let current = original;
  const updated = () => assembly.openings.map(o => o.id === original.id ? current : o);
  const show = (p: Vec2) => safePreview(api, source, assembly.openings.map(o => o.id === original.id ? { ...current, ...project(source, p) } : o), assembly, assembly.anchorId);
  const point = await api.getPoint({ prompt: L('Nuevo centro en el mismo muro', 'New center on the same wall'), noOrtho: true, noSnap: true, preview: show });
  if (point.kind !== 'point') return;
  current = { ...current, ...project(source, point.p) }; validate(source, updated());
  for (;;) {
    api.setPreview(preview(api, source, updated(), assembly, assembly.anchorId));
    const r = await api.getPoint({ prompt: L('Nuevo centro o Intro confirma', 'New center or Enter confirms'), noOrtho: true, noSnap: true, allowNone: true, preview: p => show(p) ?? safePreview(api, source, updated(), assembly, assembly.anchorId) });
    if (r.kind === 'none') break;
    if (r.kind === 'point') current = { ...current, ...project(source, r.p) };
    validate(source, updated());
  }
  commit(api, 'OPENINGMOVE', source, updated(), assembly, assembly.anchorId);
});
export const OPENINGCOPY = operation('OPENINGCOPY', 'COPIARHUECO', L('Copiar hueco', 'Copy opening'), L('Selecciona símbolo o jamba, muro destino (puede ser el mismo), centro e Intro. Conserva original.', 'Select symbol or jamb, destination wall (same wall allowed), center and Enter. Retains original.'), async api => {
  const selected = await selectOpening(api); if (!selected) return;
  const destination = await selectWall(api); if (!destination) return;
  let copied = { ...selected.opening, id: newId('opening') };
  const proposed = (p: Vec2) => ({ ...copied, ...project(destination.source, p) });
  const all = (s: WallOpeningSpec) => [...(destination.assembly?.openings ?? []), s];
  const show = (p: Vec2) => safePreview(api, destination.source, all(proposed(p)), destination.assembly, destination.anchorId);
  const center = await api.getPoint({ prompt: L('Centro de la copia', 'Copy center'), noOrtho: true, noSnap: true, preview: show });
  if (center.kind !== 'point') return;
  copied = proposed(center.p); validate(destination.source, all(copied));
  api.setPreview(preview(api, destination.source, all(copied), destination.assembly, destination.anchorId));
  const confirm = await api.getKeyword({ prompt: L('Intro confirma copia', 'Enter confirms copy'), allowNone: true });
  if (confirm.kind !== 'none') return;
  // On a shared source, include the original opening from the just-validated destination.
  commit(api, 'OPENINGCOPY', destination.source, all(copied), destination.assembly, destination.anchorId);
});
export const OPENINGEDIT = operation('OPENINGEDIT', 'EDITARHUECO', L('Editar hueco', 'Edit opening'), L('Selecciona símbolo/jamba; Ancho, Tipo, Lado y Bisagra; Intro confirma todos los cambios juntos. Esc descarta.', 'Select symbol/jamb; Width, Type, Side and Hinge; Enter confirms all changes together. Esc discards.'), async api => {
  const selected = await selectOpening(api); if (!selected) return;
  const { assembly, opening: original, source } = selected; let current = original;
  const all = () => assembly.openings.map(o => o.id === original.id ? current : o);
  for (;;) {
    api.setPreview(preview(api, source, all(), assembly, assembly.anchorId));
    const r = await api.getKeyword({ prompt: L('Ancho/Tipo/Lado/Bisagra · Intro confirma', 'Width/Type/Side/Hinge · Enter confirms'), allowNone: true, keywords: [widthKeyword, typeKeyword, sideKeyword, hingeKeyword] });
    if (r.kind === 'none') break;
    if (r.key === 'Width') current = { ...current, width: await widthInput(api, current.width) };
    else if (r.key === 'Type') { const t = await api.getKeyword({ prompt: L('Tipo de hueco', 'Opening type'), keywords: typeChoices }); if (t.kind === 'keyword') current = { ...current, type: t.key as WallOpeningSpec['type'] }; }
    else if (r.key === 'Side') current = { ...current, side: current.side === 1 ? -1 : 1 };
    else if (r.key === 'Hinge') current = { ...current, hingeEnd: !current.hingeEnd };
    validate(source, all());
  }
  commit(api, 'OPENINGEDIT', source, all(), assembly, assembly.anchorId);
});
export const OPENINGMIRROR = operation('OPENINGMIRROR', 'REFLEJARHUECO', L('Reflejar hueco', 'Mirror opening'), L('Selecciona símbolo/jamba; Eje cambia lado, Centro cambia bisagra, Ambos cambian los dos; Intro confirma.', 'Select symbol/jamb; Axis changes side, Center changes hinge, Both change both; Enter confirms.'), async api => {
  const selected = await selectOpening(api); if (!selected) return;
  const { assembly, opening: original, source } = selected; let current = original;
  const all = () => assembly.openings.map(o => o.id === original.id ? current : o);
  for (;;) {
    api.setPreview(preview(api, source, all(), assembly, assembly.anchorId));
    const r = await api.getKeyword({ prompt: L('Eje/Centro/Ambos · Intro confirma', 'Axis/Center/Both · Enter confirms'), allowNone: true, keywords: [K('Axis', 'Eje', 'Axis'), K('Center', 'Centro', 'Center'), K('Both', 'Ambos', 'Both')] });
    if (r.kind === 'none') break;
    current = { ...current, side: r.key !== 'Center' ? current.side === 1 ? -1 : 1 : current.side, hingeEnd: r.key !== 'Axis' ? !current.hingeEnd : current.hingeEnd };
  }
  commit(api, 'OPENINGMIRROR', source, all(), assembly, assembly.anchorId);
});
export const OPENINGDELETE = operation('OPENINGDELETE', 'BORRARHUECO', L('Borrar hueco', 'Delete opening'), L('Selecciona símbolo/jamba; previsualiza el muro reparado; Intro borra y Esc descarta. El último hueco restaura el muro completo.', 'Select symbol/jamb; preview repaired wall; Enter deletes and Esc discards. The last opening restores the complete wall.'), async api => {
  const selected = await selectOpening(api); if (!selected) return;
  const { assembly, opening: target, source } = selected, remaining = assembly.openings.filter(o => o.id !== target.id);
  api.setPreview(preview(api, source, remaining, assembly, assembly.anchorId));
  const confirm = await api.getKeyword({ prompt: L('Intro borra el hueco', 'Enter deletes the opening'), allowNone: true });
  if (confirm.kind === 'none') commit(api, 'OPENINGDELETE', source, remaining, assembly, assembly.anchorId);
});
export const WALLTHICKNESS = operation('WALLTHICKNESS', 'ESPESORMURO', L('Espesor de muro', 'Wall thickness'), L('Selecciona muro o miembro asociado; indica espesor positivo en unidades del dibujo; Intro confirma la reconstrucción completa.', 'Select wall or associated member; specify positive thickness in drawing units; Enter confirms complete reconstruction.'), async api => {
  const selected = await selectWall(api); if (!selected) return;
  const width = await api.getDistance({ prompt: L('Espesor en unidades del dibujo', 'Thickness in drawing units'), defaultValue: selected.source.scale });
  if (width.kind !== 'value') return;
  if (!Number.isFinite(width.value) || width.value <= TOL.LINEAR) fail('Espesor positivo finito requerido.', 'Positive finite thickness required.');
  const source = { ...selected.source, scale: width.value }, openings = selected.assembly?.openings ?? [];
  api.setPreview(preview(api, source, openings, selected.assembly, selected.anchorId));
  const confirm = await api.getKeyword({ prompt: L('Intro confirma espesor', 'Enter confirms thickness'), allowNone: true });
  if (confirm.kind !== 'none') return;
  if (!selected.assembly) {
    const current = checked(api, selected.anchorId);
    const a = current.source, b = selected.source;
    if (current.assembly || current.anchorId !== selected.anchorId || a.owner !== b.owner || a.style !== b.style || a.justification !== b.justification || a.closed !== b.closed || a.scale !== b.scale || a.vertices.length !== b.vertices.length || a.vertices.some((p, i) => p.x !== b.vertices[i].x || p.y !== b.vertices[i].y)) fail(unavailable.es, unavailable.en);
    api.apply('WALLTHICKNESS', tx => tx.updateEntity(selected.anchorId, { scale: width.value }));
  }
  else commit(api, 'WALLTHICKNESS', source, openings, selected.assembly, selected.anchorId);
});
export const OPENING_LIFECYCLE = [OPENINGMOVE, OPENINGCOPY, OPENINGEDIT, OPENINGMIRROR, OPENINGDELETE, WALLTHICKNESS];
