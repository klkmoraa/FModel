import { requestUi } from '../app/services';
import { boxFromCorners } from '../geometry/bbox';
import { closestPoint, curveEnd, curveStart } from '../geometry/curves';
import { applyToPoint, invert, insertMatrix } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec';
import { angleOf, dist, sub } from '../geometry/vec';
import { newId } from '../document/ids';
import type {
  BlockConstraint,
  BlockRecord,
  DimConstraintType,
  DynAction,
  DynamicBlockDefinition,
  DynParam,
  Entity,
  GeoConstraintType,
  GeoRef,
  Id,
  InsertEntity,
  LookupTable,
  ValueSet,
  VisibilityParam,
} from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { ACTION_COMPAT, emptyDynamic, SELF_ACTING_PARAMS } from '../blocks/authoring';
import { validateDynamicBlock } from '../blocks/dynamic';
import { insertBlock, validateBlockName } from '../blocks/blockOps';
import { remapDynamicBlockDef } from '../blocks/remap';
import { kindOf } from '../model/registry';
import { selectInBox } from '../selection/pick';
import { K, L } from './helpers';
import type { CommandApi, CommandDef } from './types';
import { CommandError } from './types';

export const TEST_SPACE_ID = '*block-test';

function session(api: CommandApi) {
  const s = api.editor.blockEdit;
  if (!s) throw new CommandError(L('Este comando solo está disponible en el Editor de bloques (BEDIT).', 'This command is only available in the Block Editor (BEDIT).'));
  return s;
}

function currentBlock(api: CommandApi): BlockRecord {
  const s = session(api);
  const b = api.editor.doc.data.blocks.get(s.blockId);
  if (!b) throw new CommandError(L('La definición en edición ya no existe.', 'The block being edited no longer exists.'));
  return b;
}


function updateDynamic(api: CommandApi, label: string, fn: (d: DynamicBlockDefinition) => DynamicBlockDefinition, patch: Partial<Pick<BlockRecord, 'basePoint'>> = {}) {
  const b = currentBlock(api);
  api.apply(label, (tx) => tx.update('blocks', b.id, { ...patch, dynamic: fn(structuredClone(b.dynamic ?? emptyDynamic())) }));
}

async function getFinitePoint(api: CommandApi, req: Parameters<CommandApi['getPoint']>[0]) {
  const result = await api.getPoint(req);
  if (result.kind === 'point' && (!Number.isFinite(result.p.x) || !Number.isFinite(result.p.y))) {
    throw new CommandError(L('Las coordenadas deben ser números finitos.', 'Coordinates must be finite numbers.'));
  }
  return result;
}

function requireFiniteDistance(a: Vec2, b: Vec2): number {
  const length = dist(a, b);
  if (!Number.isFinite(length)) {
    throw new CommandError(L('La distancia excede el rango numérico válido.', 'The distance exceeds the valid numeric range.'));
  }
  return length;
}

const VS = (): ValueSet => ({ kind: 'none' });

// ------------------------------------------------------------------ sesión

const BEDIT: CommandDef = {
  name: 'BEDIT',
  aliases: ['BE', 'EDITORBLOQUES'],
  category: 'block',
  label: L('Editor de bloques', 'Block editor'),
  description: L('Abre una definición de bloque para editar su geometría, parámetros, acciones, visibilidad y restricciones.', 'Opens a block definition to edit geometry, parameters, actions, visibility and constraints.'),
  icon: 'bedit',
  // gestiona su propio grupo de historial (la sesión completa)
  readOnly: true,
  async run(api, args) {
    const editor = api.editor;
    const doc = editor.doc;
    if (editor.blockEdit) throw new CommandError(L('Ya hay un bloque en edición. Ciérralo con BCLOSE.', 'A block is already being edited. Close it with BCLOSE.'));
    let block: BlockRecord | undefined;
    let insert: InsertEntity | undefined;
    // una definición nueva se crea dentro del grupo de la sesión (descartar la elimina)
    let created: BlockRecord | null = null;
    if (args?.[0]) block = doc.findByName('blocks', args.join(' '));
    if (!block) {
      const pre = editor.selection.list.map((id) => doc.entity(id)).find((e): e is InsertEntity => e?.type === 'insert');
      if (pre) {
        insert = pre;
        block = doc.data.blocks.get(pre.blockId);
      }
    }
    if (!block) {
      const r = await api.getString({ prompt: L('Nombre del bloque a editar o nuevo (Intro: designar referencia)', 'Name of block to edit or create (Enter: pick reference)'), allowSpaces: true, allowNone: true });
      if (r.kind === 'none') {
        const e = await api.getEntity({ prompt: L('Designe una referencia a bloque', 'Select block reference'), types: ['insert'] });
        if (e.kind !== 'entity') return;
        insert = doc.entity(e.id) as InsertEntity;
        block = doc.data.blocks.get(insert.blockId);
      } else if (r.kind === 'string') {
        block = doc.findByName('blocks', r.value);
        if (!block) {
          const err = validateBlockName(doc, r.value);
          if (err) throw new CommandError(L(err, err));
          const nb: BlockRecord = { id: newId('blk'), name: r.value.trim(), kind: 'normal', basePoint: { x: 0, y: 0 }, description: '', units: doc.settings.insUnits, explodable: true, scaleUniformly: false, annotative: false, revision: 1 };
          created = nb;
          block = nb;
        }
      } else return;
    }
    if (!block || block.kind === 'xref') throw new CommandError(L('Ese bloque no se puede editar (referencia externa o inexistente).', 'That block cannot be edited (external reference or missing).'));
    let inPlace: { insertId: Id; matrix: ReturnType<typeof insertMatrix> } | undefined;
    if (insert) {
      const ctxMode = await api.getKeyword({ prompt: L('¿Editar en contexto (sobre el dibujo) o en el editor aislado?', 'Edit in place (over the drawing) or in the isolated editor?'), keywords: [K('InPlace', 'En contexto', 'In place', ['c', 'i']), K('Editor', 'Editor', 'Editor', ['e'])], defaultValue: 'Editor' });
      if (ctxMode.kind === 'keyword' && ctxMode.key === 'InPlace') inPlace = { insertId: insert.id, matrix: invert(insertMatrix(insert.position, insert.scale.x, insert.scale.y, insert.rotation, block.basePoint)) };
    }
    const previousSpace = editor.space;
    const hostView = { center: { ...editor.view.center }, scale: editor.view.scale };
    editor.runner.cancelAll();
    doc.history.beginGroup(api.t(L(`Editar bloque «${block.name}»`, `Edit block "${block.name}"`)));
    if (created) {
      const nb = created;
      doc.transact('BEDIT NEW', (tx) => tx.add('blocks', nb));
    }
    editor.blockEdit = { blockId: block.id, previousSpace, inPlace, testing: null };
    editor.setSpace(block.id);
    editor.blockEditState = { currentVisibility: null };
    if (inPlace && insert) {
      // misma encuadre que el dibujo anfitrión, expresado en coordenadas del bloque
      editor.view.center = applyToPoint(inPlace.matrix, hostView.center);
      editor.view.scale = hostView.scale * Math.max(1e-9, Math.abs(insert.scale.x));
      editor.emit('view');
    } else editor.zoomExtents();
    requestUi('panel:authoring');
    api.info(L(`Editor de bloques: «${block.name}». Dibuja y añade parámetros (BPARAMETER), acciones (BACTION), estados (BVSTATE) y restricciones (BCONSTRAINT). BCLOSE para guardar o descartar.`, `Block editor: "${block.name}". Draw and add parameters (BPARAMETER), actions (BACTION), states (BVSTATE) and constraints (BCONSTRAINT). BCLOSE to save or discard.`));
  },
};

export function closeBlockEditor(api: CommandApi, save: boolean) {
  const editor = api.editor;
  const s = session(api);
  if (s.testing) endTest(api);
  const doc = editor.doc;
  const b = doc.data.blocks.get(s.blockId);
  if (save && b) {
    const rep = validateDynamicBlock(editor.ctx, b);
    doc.transact('BSAVE', (tx) => tx.update('blocks', b.id, { revision: b.revision + 1, ...(b.dynamic ? { dynamic: { ...b.dynamic, validation: { at: Date.now(), warnings: rep.warnings, errors: rep.errors } } } : {}) }));
    doc.history.endGroup();
    for (const w of rep.errors) api.warn(L(`✖ ${w}`, `✖ ${w}`));
    for (const w of rep.warnings) api.warn(L(w, w));
    api.info(L(`Bloque «${b.name}» guardado; las instancias se actualizaron.`, `Block "${b.name}" saved; instances updated.`));
  } else {
    doc.history.abortGroup();
    api.info(L('Cambios del bloque descartados.', 'Block changes discarded.'));
  }
  editor.blockEdit = null;
  editor.blockEditState = { currentVisibility: null };
  editor.setSpace(doc.data.layouts.has(s.previousSpace) || s.previousSpace === MODEL_SPACE_ID ? s.previousSpace : MODEL_SPACE_ID);
  editor.emit('doc');
}

const BCLOSE: CommandDef = {
  name: 'BCLOSE',
  aliases: ['CERRAREDITORBLOQUES'],
  category: 'block',
  readOnly: true,
  label: L('Cerrar editor de bloques', 'Close block editor'),
  description: L('Guarda o descarta los cambios de la definición y vuelve al dibujo.', 'Saves or discards definition changes and returns to the drawing.'),
  async run(api, args) {
    session(api);
    const kws = [K('Save', 'Guardar', 'Save', ['g', 's']), K('Discard', 'Descartar', 'Discard', ['d'])];
    const given = args?.[0] ? api.editor.runner.matchKeyword(args[0], kws) : null;
    const r = given ? { kind: 'keyword' as const, key: given } : await api.getKeyword({ prompt: L('¿Guardar los cambios en la definición?', 'Save changes to the definition?'), keywords: kws, defaultValue: 'Save' });
    if (r.kind !== 'keyword') return;
    closeBlockEditor(api, r.key === 'Save');
  },
};

const BSAVE: CommandDef = {
  name: 'BSAVE',
  aliases: ['GUARDARBLOQUE'],
  category: 'block',
  readOnly: true,
  label: L('Guardar bloque', 'Save block'),
  description: L('Guarda la definición sin salir del editor (actualiza instancias).', 'Saves the definition without leaving the editor (updates instances).'),
  run(api) {
    if (session(api).testing) endTest(api);
    const doc = api.editor.doc;
    const b = currentBlock(api);
    const rep = validateDynamicBlock(api.editor.ctx, b);
    doc.transact('BSAVE', (tx) => tx.update('blocks', b.id, { revision: b.revision + 1 }));
    doc.history.endGroup();
    doc.history.beginGroup(api.t(L(`Editar bloque «${b.name}»`, `Edit block "${b.name}"`)));
    for (const w of [...rep.errors, ...rep.warnings]) api.warn(L(w, w));
    api.info(L('Definición guardada.', 'Definition saved.'));
  },
};

const BSAVEAS: CommandDef = {
  name: 'BSAVEAS',
  aliases: ['GUARDARBLOQUECOMO'],
  category: 'block',
  readOnly: true,
  label: L('Guardar bloque como', 'Save block as'),
  description: L('Copia la definición actual con otro nombre y continúa editando la copia.', 'Copies the current definition under a new name and continues editing the copy.'),
  async run(api) {
    const b = currentBlock(api);
    const doc = api.editor.doc;
    const n = await api.getString({ prompt: L('Nombre del nuevo bloque', 'New block name'), allowSpaces: true });
    if (n.kind !== 'string') return;
    const err = validateBlockName(doc, n.value);
    if (err) throw new CommandError(L(err, err));
    const id = newId('blk');
    const map = new Map<Id, Id>();
    api.apply('BSAVEAS', (tx) => {
      for (const e of doc.entitiesOf(b.id)) map.set(e.id, newId());
      const dyn = b.dynamic ? remapDynamicBlockDef(b.dynamic, map) : undefined;
      tx.add('blocks', { ...structuredClone(b), id, name: n.value.trim(), revision: 1, dynamic: dyn, favorite: false });
      for (const e of doc.entitiesOf(b.id)) {
        const { order: _o, ...rest } = structuredClone(e);
        tx.addEntity({ ...rest, id: map.get(e.id), owner: id } as never);
      }
    });
    closeBlockEditor(api, true);
    await api.editor.runner.execute('BEDIT', [n.value.trim()]);
  },
};

// ------------------------------------------------------------------ prueba

export function endTest(api: CommandApi) {
  const editor = api.editor;
  const s = editor.blockEdit;
  if (!s?.testing) return;
  editor.doc.history.abortGroup();
  s.testing = null;
  editor.setSpace(s.blockId);
  editor.emit('doc');
}

const BTESTBLOCK: CommandDef = {
  name: 'BTESTBLOCK',
  aliases: ['PROBARBLOQUE'],
  category: 'block',
  readOnly: true,
  label: L('Probar bloque', 'Test block'),
  description: L('Inserta la definición en un espacio de prueba temporal para usar sus grips y propiedades; al cerrar no queda rastro.', 'Inserts the definition in a temporary test space to use its grips and properties; nothing remains after closing.'),
  icon: 'dynblock',
  async run(api) {
    const editor = api.editor;
    const s = session(api);
    if (s.testing) {
      endTest(api);
      api.info(L('Prueba cerrada: se volvió a la definición.', 'Test closed: back to the definition.'));
      return;
    }
    const b = currentBlock(api);
    const rep = validateDynamicBlock(editor.ctx, b);
    for (const e of rep.errors) api.warn(L(`✖ ${e}`, `✖ ${e}`));
    editor.doc.history.beginGroup('BTESTBLOCK');
    const ins = editor.doc.transact('BTESTBLOCK', (tx) => insertBlock(tx, editor.doc, b.id, TEST_SPACE_ID, b.basePoint));
    s.testing = { insertId: ins.id };
    editor.setSpace(TEST_SPACE_ID);
    editor.zoomExtents();
    editor.selection.set([ins.id]);
    api.info(L('Modo prueba: arrastra los grips dinámicos o cambia las propiedades personalizadas. Ejecuta BTESTBLOCK o BTESTCLOSE para volver.', 'Test mode: drag dynamic grips or change custom properties. Run BTESTBLOCK or BTESTCLOSE to go back.'));
  },
};

const BTESTCLOSE: CommandDef = {
  name: 'BTESTCLOSE',
  aliases: ['CERRARPRUEBA'],
  category: 'block',
  readOnly: true,
  label: L('Cerrar prueba de bloque', 'Close test block'),
  description: L('Sale del espacio de prueba descartando los cambios de prueba.', 'Leaves the test space discarding test changes.'),
  run(api) {
    endTest(api);
  },
};

// ------------------------------------------------------------------ parámetros

async function valueSetPrompt(api: CommandApi): Promise<ValueSet> {
  const k = await api.getKeyword({ prompt: L('Conjunto de valores', 'Value set'), keywords: [K('None', 'Ninguno', 'None', ['n']), K('Increment', 'Incremento', 'Increment', ['i']), K('List', 'Lista', 'List', ['l'])], defaultValue: 'None' });
  if (k.kind !== 'keyword' || k.key === 'None') {
    const mm = await api.getString({ prompt: L('Mínimo,máximo (opcional, p. ej. 100,500)', 'Min,max (optional, e.g. 100,500)'), allowNone: true });
    if (mm.kind === 'string' && mm.value.includes(',')) {
      const [a, b] = mm.value.split(',').map(Number);
      return { kind: 'none', min: Number.isFinite(a) ? a : undefined, max: Number.isFinite(b) ? b : undefined };
    }
    return VS();
  }
  if (k.key === 'Increment') {
    const inc = await api.getNumber({ prompt: L('Incremento', 'Increment'), min: 1e-9 });
    const mn = await api.getNumber({ prompt: L('Mínimo', 'Minimum'), allowNone: true });
    const mx = await api.getNumber({ prompt: L('Máximo', 'Maximum'), allowNone: true });
    return { kind: 'increment', increment: inc.kind === 'value' ? inc.value : 1, min: mn.kind === 'value' ? mn.value : undefined, max: mx.kind === 'value' ? mx.value : undefined };
  }
  const l = await api.getString({ prompt: L('Valores separados por coma', 'Comma-separated values'), allowSpaces: true });
  const list = l.kind === 'string' ? l.value.split(/[,;]/).map((x) => Number(x.trim())).filter(Number.isFinite).sort((a, b) => a - b) : [];
  return { kind: 'list', list };
}

function nextName(def: DynamicBlockDefinition | undefined, base: string): string {
  let i = 1;
  const names = new Set((def?.parameters ?? []).map((p) => p.name.toLowerCase()));
  while (names.has(`${base}${i}`.toLowerCase())) i++;
  return `${base}${i}`;
}

const BPARAMETER: CommandDef = {
  name: 'BPARAMETER',
  aliases: ['BPARAM', 'PARAMETROBLOQUE'],
  category: 'block',
  label: L('Parámetro de bloque dinámico', 'Dynamic block parameter'),
  description: L('Añade parámetros: punto, lineal, polar, XY, rotación, alineación, simetría, visibilidad, consulta o punto base.', 'Adds parameters: point, linear, polar, XY, rotation, alignment, flip, visibility, lookup or base point.'),
  icon: 'dynblock',
  async run(api, args) {
    const b = currentBlock(api);
    const kws = [K('Point', 'Punto', 'Point', ['p']), K('Linear', 'Lineal', 'Linear', ['l']), K('Polar', 'Polar', 'Polar', ['o']), K('XY', 'XY', 'XY', ['xy']), K('Rotation', 'Rotación', 'Rotation', ['r']), K('Alignment', 'Alineación', 'Alignment', ['a']), K('Flip', 'Simetría', 'Flip', ['s', 'f']), K('Visibility', 'Visibilidad', 'Visibility', ['v']), K('Lookup', 'Consulta', 'Lookup', ['c', 'k']), K('Base', 'Punto base', 'Base point', ['b'])];
    let type = args?.[0] ? api.editor.runner.matchKeyword(args[0], kws) : null;
    if (!type) {
      const k = await api.getKeyword({ prompt: L('Tipo de parámetro', 'Parameter type'), keywords: kws, defaultValue: 'Linear' });
      if (k.kind !== 'keyword') return;
      type = k.key;
    }
    const common = (base: string) => ({ id: newId('prm'), name: nextName(b.dynamic, base), label: '', showInProperties: true, chainActions: false, gripCount: 1 as const });
    let param: DynParam | null = null;
    let lookupToAdd: LookupTable | null = null;
    let basePointToSet: Vec2 | undefined;
    let visibilityToSet: string | null = null;
    switch (type) {
      case 'Point': {
        const p = await getFinitePoint(api, { prompt: L('Precise la ubicación del parámetro', 'Specify parameter location') });
        if (p.kind !== 'point') return;
        param = { ...common('Posición'), type: 'point', point: p.p };
        break;
      }
      case 'Linear':
      case 'Polar':
      case 'XY': {
        const a = await getFinitePoint(api, { prompt: L('Precise el punto inicial', 'Specify start point') });
        if (a.kind !== 'point') return;
        const e = await getFinitePoint(api, { prompt: L(type === 'XY' ? 'Precise la esquina opuesta' : 'Precise el punto final', type === 'XY' ? 'Specify opposite corner' : 'Specify endpoint'), base: a.p, rubber: type === 'XY' ? 'rect' : 'line' });
        if (e.kind !== 'point') return;
        const length = requireFiniteDistance(a.p, e.p);
        if (length < 1e-12) throw new CommandError(L('El parámetro no puede tener longitud cero.', 'The parameter cannot have zero length.'));
        if (type === 'Linear') {
          const loc = await api.getKeyword({ prompt: L('Ubicación de la base', 'Base location'), keywords: [K('start', 'Punto inicial', 'Start point', ['i', 's']), K('middle', 'Punto medio', 'Midpoint', ['m'])], defaultValue: 'start' });
          const grips = await api.getNumber({ prompt: L('Número de grips (0, 1, 2)', 'Number of grips (0, 1, 2)'), integer: true, min: 0, max: 2, defaultValue: 1 });
          const vs = await valueSetPrompt(api);
          param = { ...common('Distancia'), type: 'linear', base: a.p, end: e.p, baseLocation: loc.kind === 'keyword' && loc.key === 'middle' ? 'middle' : 'start', valueSet: vs, gripCount: (grips.kind === 'value' ? grips.value : 1) as 0 | 1 | 2 };
        } else if (type === 'Polar') param = { ...common('Polar'), type: 'polar', base: a.p, end: e.p, distanceSet: VS(), angleSet: VS() };
        else param = { ...common('XY'), type: 'xy', base: a.p, corner: e.p, xSet: VS(), ySet: VS() };
        break;
      }
      case 'Rotation': {
        const c = await getFinitePoint(api, { prompt: L('Precise el punto base', 'Specify base point') });
        if (c.kind !== 'point') return;
        const rad = await getFinitePoint(api, { prompt: L('Precise el radio del parámetro', 'Specify radius of parameter'), base: c.p, rubber: 'line' });
        if (rad.kind !== 'point') return;
        const radius = requireFiniteDistance(c.p, rad.p);
        param = { ...common('Ángulo'), type: 'rotation', base: c.p, radius, angle: angleOf(sub(rad.p, c.p)), valueSet: VS() };
        break;
      }
      case 'Alignment': {
        const c = await getFinitePoint(api, { prompt: L('Precise la base de alineación', 'Specify base of alignment') });
        if (c.kind !== 'point') return;
        const d = await getFinitePoint(api, { prompt: L('Precise la dirección de alineación', 'Specify alignment direction'), base: c.p, rubber: 'line' });
        if (d.kind !== 'point') return;
        requireFiniteDistance(c.p, d.p);
        param = { ...common('Alineación'), type: 'alignment', base: c.p, direction: sub(d.p, c.p), alignType: 'perpendicular' };
        break;
      }
      case 'Flip': {
        const a = await getFinitePoint(api, { prompt: L('Precise el punto base de la línea de reflexión', 'Specify base point of reflection line') });
        if (a.kind !== 'point') return;
        const e = await getFinitePoint(api, { prompt: L('Precise el punto final de la línea de reflexión', 'Specify endpoint of reflection line'), base: a.p, rubber: 'line' });
        if (e.kind !== 'point') return;
        requireFiniteDistance(a.p, e.p);
        param = { ...common('Simetría'), type: 'flip', base: a.p, end: e.p, labelNotFlipped: api.t(L('Normal', 'Not flipped')), labelFlipped: api.t(L('Invertido', 'Flipped')) };
        break;
      }
      case 'Visibility': {
        if (b.dynamic?.parameters.some((p) => p.type === 'visibility')) throw new CommandError(L('Un bloque admite un único parámetro de visibilidad.', 'A block supports a single visibility parameter.'));
        const p = await getFinitePoint(api, { prompt: L('Precise la ubicación del parámetro', 'Specify parameter location') });
        if (p.kind !== 'point') return;
        const all = api.editor.doc.entitiesOf(b.id).map((e) => e.id);
        param = { ...common('Visibilidad'), type: 'visibility', position: p.p, states: [{ name: api.t(L('Estado1', 'State1')), visible: all }], defaultState: api.t(L('Estado1', 'State1')) };
        visibilityToSet = api.t(L('Estado1', 'State1'));
        break;
      }
      case 'Lookup': {
        const p = await getFinitePoint(api, { prompt: L('Precise la ubicación del parámetro', 'Specify parameter location') });
        if (p.kind !== 'point') return;
        const tableId = newId('lkt');
        const table: LookupTable = { id: tableId, name: nextName(b.dynamic, 'Consulta'), inputs: [], lookupName: api.t(L('Consulta', 'Lookup')), rows: [], reverse: true };
        lookupToAdd = table;
        param = { ...common('Consulta'), type: 'lookup', position: p.p, tableId };
        break;
      }
      case 'Base': {
        const p = await getFinitePoint(api, { prompt: L('Precise la ubicación del punto base', 'Specify base point location') });
        if (p.kind !== 'point') return;
        param = { ...common('Base'), type: 'basepoint', point: p.p, gripCount: 0, showInProperties: false };
        basePointToSet = p.p;
        break;
      }
    }
    if (!param) return;
    const lbl = await api.getString({ prompt: L('Etiqueta (propiedad visible)', 'Label (visible property)'), defaultValue: param.name, allowSpaces: true });
    if (lbl.kind === 'string') param.label = lbl.value;
    const p = param;
    updateDynamic(api, 'BPARAMETER', (d) => ({
      ...d,
      ...(lookupToAdd ? { lookups: [...d.lookups, lookupToAdd] } : {}),
      parameters: [...d.parameters, p],
      propertyOrder: [...d.propertyOrder, p.id],
    }), basePointToSet ? { basePoint: basePointToSet } : {});
    if (visibilityToSet) api.editor.blockEditState = { currentVisibility: visibilityToSet };
    if (p.type === 'lookup') requestUi('lookup-table', p.tableId);
    if (!SELF_ACTING_PARAMS.includes(p.type)) api.warn(L(`⚠ «${p.name}» aún no tiene acción: añade una con BACTION.`, `⚠ "${p.name}" has no action yet: add one with BACTION.`));
    requestUi('panel:authoring');
  },
};

async function pickParameter(api: CommandApi, types?: DynParam['type'][]): Promise<DynParam | null> {
  const b = currentBlock(api);
  const params = (b.dynamic?.parameters ?? []).filter((p) => !types || types.includes(p.type));
  if (!params.length) throw new CommandError(L('No hay parámetros compatibles. Crea uno con BPARAMETER.', 'No compatible parameters. Create one with BPARAMETER.'));
  if (params.length === 1) return params[0];
  const r = await getFinitePoint(api, { prompt: L(`Designe un parámetro junto a su ubicación o escriba su nombre (${params.map((p) => p.name).join(', ')})`, `Pick near a parameter or type its name (${params.map((p) => p.name).join(', ')})`), keywords: params.map((p) => K(p.id, p.name, p.name, [p.name.toLowerCase()])) });
  if (r.kind === 'keyword') return params.find((p) => p.id === r.key) ?? null;
  if (r.kind !== 'point') return null;
  const anchor = (p: DynParam): Vec2[] => ('base' in p ? [p.base, (p as { end?: Vec2 }).end ?? p.base, (p as { corner?: Vec2 }).corner ?? p.base] : 'point' in p ? [p.point] : 'position' in p ? [p.position] : []);
  return params.reduce((best, p) => (Math.min(...anchor(p).map((q) => dist(q, r.p))) < Math.min(...anchor(best).map((q) => dist(q, r.p))) ? p : best), params[0]);
}

async function pickObjects(api: CommandApi, prompt: { es: string; en: string }): Promise<Id[]> {
  return api.getSelection({ prompt, allowLocked: true, usePreselection: false });
}

async function pickFrame(api: CommandApi): Promise<Vec2[] | null> {
  const a = await getFinitePoint(api, { prompt: L('Precise la primera esquina del marco de estiramiento', 'Specify first corner of stretch frame'), noSnap: true });
  if (a.kind !== 'point') return null;
  const b = await getFinitePoint(api, { prompt: L('Precise la esquina opuesta', 'Specify opposite corner'), base: a.p, rubber: 'rect', noSnap: true });
  if (b.kind !== 'point') return null;
  const box = boxFromCorners(a.p, b.p);
  requireFiniteDistance({ x: box.minX, y: box.minY }, { x: box.maxX, y: box.maxY });
  return [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
}

const BACTION: CommandDef = {
  name: 'BACTION',
  aliases: ['BACT', 'ACCIONBLOQUE'],
  category: 'block',
  label: L('Acción de bloque dinámico', 'Dynamic block action'),
  description: L('Asocia a un parámetro una acción: desplazar, escalar, estirar, estiramiento polar, girar, simetría, matriz o consulta.', 'Associates an action with a parameter: move, scale, stretch, polar stretch, rotate, flip, array or lookup.'),
  icon: 'dynblock',
  async run(api, args) {
    const b = currentBlock(api);
    const editor = api.editor;
    const kws = [K('move', 'Desplazar', 'Move', ['d', 'm']), K('scale', 'Escala', 'Scale', ['e', 's']), K('stretch', 'Estirar', 'Stretch', ['t']), K('polarstretch', 'Estiramiento polar', 'Polar stretch', ['p']), K('rotate', 'Girar', 'Rotate', ['g', 'r']), K('flip', 'Simetría', 'Flip', ['f']), K('array', 'Matriz', 'Array', ['a']), K('lookup', 'Consulta', 'Lookup', ['c', 'l'])];
    let type = args?.[0] ? editor.runner.matchKeyword(args[0], kws) : null;
    if (!type) {
      const k = await api.getKeyword({ prompt: L('Tipo de acción', 'Action type'), keywords: kws, defaultValue: 'stretch' });
      if (k.kind !== 'keyword') return;
      type = k.key;
    }
    const param = await pickParameter(api, ACTION_COMPAT[type as DynAction['type']]);
    if (!param) return;
    const base = { id: newId('act'), name: `${kws.find((k) => k.key === type)!.label[api.lang]} ${param.name}`, paramId: param.id };
    const paramPoint = async (): Promise<'base' | 'end' | 'corner'> => {
      if (param.type === 'point') return 'end';
      if (param.type === 'xy') return 'corner';
      const k = await api.getKeyword({ prompt: L('Punto del parámetro que dirige la acción', 'Parameter point driving the action'), keywords: [K('end', 'Punto final', 'End point', ['f', 'e']), K('base', 'Punto base', 'Base point', ['b'])], defaultValue: 'end' });
      return k.kind === 'keyword' && k.key === 'base' ? 'base' : 'end';
    };
    let action: DynAction | null = null;
    switch (type) {
      case 'move': {
        const pp = await paramPoint();
        const sel = await pickObjects(api, L('Designe objetos para la acción (incluye parámetros para encadenar)', 'Select objects for the action (include parameters to chain)'));
        const mult = await api.getNumber({ prompt: L('Multiplicador de distancia', 'Distance multiplier'), defaultValue: 1 });
        action = { ...base, type: 'move', selection: sel, paramPoint: pp, axis: 'xy', distanceMultiplier: mult.kind === 'value' ? mult.value : 1, angleOffset: 0 };
        break;
      }
      case 'stretch': {
        const pp = await paramPoint();
        const frame = await pickFrame(api);
        if (!frame) return;
        const auto = selectInBox(editor.ctx, editor.index, b.id, boxFromCorners(frame[0], frame[2]), true).filter((id) => editor.doc.entity(id)?.owner === b.id);
        const sel = await api.getSelection({ prompt: L(`Designe objetos (Intro: ${auto.length} dentro/cruzando el marco)`, `Select objects (Enter: ${auto.length} inside/crossing the frame)`), allowLocked: true, usePreselection: false });
        action = { ...base, type: 'stretch', selection: sel.length ? sel : auto, paramPoint: pp, frame, axis: 'xy', distanceMultiplier: 1, angleOffset: 0 };
        break;
      }
      case 'polarstretch': {
        const frame = await pickFrame(api);
        if (!frame) return;
        const sel = await pickObjects(api, L('Designe objetos a estirar', 'Select objects to stretch'));
        const rot = await pickObjects(api, L('Designe objetos que solo giran (Intro: ninguno)', 'Select objects that only rotate (Enter: none)'));
        action = { ...base, type: 'polarstretch', selection: [...new Set([...sel, ...rot])], paramPoint: 'end', frame, rotateOnly: rot };
        break;
      }
      case 'scale':
      case 'rotate': {
        const sel = await pickObjects(api, L('Designe objetos', 'Select objects'));
        const bt = await api.getKeyword({ prompt: L('Tipo de base', 'Base type'), keywords: [K('dependent', 'Dependiente', 'Dependent', ['d']), K('independent', 'Independiente', 'Independent', ['i'])], defaultValue: 'dependent' });
        let basePoint: Vec2 | undefined;
        if (bt.kind === 'keyword' && bt.key === 'independent') {
          const bp = await getFinitePoint(api, { prompt: L('Precise la ubicación de la base', 'Specify base location') });
          if (bp.kind === 'point') basePoint = bp.p;
        }
        action = type === 'scale' ? { ...base, type: 'scale', selection: sel, baseType: basePoint ? 'independent' : 'dependent', basePoint, axis: 'xy' } : { ...base, type: 'rotate', selection: sel, baseType: basePoint ? 'independent' : 'dependent', basePoint };
        break;
      }
      case 'flip': {
        const sel = await pickObjects(api, L('Designe objetos', 'Select objects'));
        action = { ...base, type: 'flip', selection: sel };
        break;
      }
      case 'array': {
        const sel = await pickObjects(api, L('Designe objetos', 'Select objects'));
        if (param.type === 'rotation') {
          const n = await api.getString({ prompt: L('Número de elementos (número o variable)', 'Number of items (number or variable)'), defaultValue: '6' });
          const fill = await api.getAngle({ prompt: L('Ángulo a llenar', 'Angle to fill'), defaultValue: Math.PI * 2 });
          const fillAngle = fill.kind === 'value' ? (fill.value * 180) / Math.PI : 360;
          if (!Number.isFinite(fillAngle)) throw new CommandError(L('El ángulo excede el rango numérico válido.', 'The angle exceeds the valid numeric range.'));
          action = { ...base, type: 'array', selection: sel, columnOffset: 0, rowOffset: 0, polarCount: n.kind === 'string' ? n.value : '6', fillAngle };
        } else {
          const co = await api.getDistance({ prompt: L('Distancia entre columnas', 'Column offset') });
          const ro = param.type === 'xy' ? await api.getDistance({ prompt: L('Distancia entre filas', 'Row offset') }) : null;
          action = { ...base, type: 'array', selection: sel, columnOffset: co.kind === 'value' ? co.value : 1, rowOffset: ro?.kind === 'value' ? ro.value : 0 };
        }
        break;
      }
      case 'lookup':
        if (param.type !== 'lookup') return;
        action = { ...base, type: 'lookup', selection: [], tableId: param.tableId };
        requestUi('lookup-table', param.tableId);
        break;
    }
    if (!action) return;
    const a = action;
    if (a.type !== 'lookup' && !a.selection.length) api.warn(L('La acción no tiene objetos: no hará nada hasta que añadas selección.', 'The action has no objects: it will do nothing until you add a selection.'));
    updateDynamic(api, 'BACTION', (d) => ({ ...d, actions: [...d.actions, a] }));
    requestUi('panel:authoring');
  },
};

// ------------------------------------------------------------------ visibilidad

const BVSTATE: CommandDef = {
  name: 'BVSTATE',
  aliases: ['ESTADOVISIBILIDAD'],
  category: 'block',
  label: L('Estados de visibilidad', 'Visibility states'),
  description: L('Crea, renombra, elimina y activa estados de visibilidad; muestra u oculta objetos en el estado actual.', 'Creates, renames, deletes and sets visibility states; shows or hides objects in the current state.'),
  async run(api, args) {
    const b = currentBlock(api);
    const vis = b.dynamic?.parameters.find((p): p is VisibilityParam => p.type === 'visibility');
    if (!vis) throw new CommandError(L('Añade primero un parámetro de visibilidad (BPARAMETER Visibilidad).', 'Add a visibility parameter first (BPARAMETER Visibility).'));
    const editor = api.editor;
    const cur = editor.blockEditState.currentVisibility ?? vis.defaultState;
    const kws = [K('New', 'Nuevo', 'New', ['n']), K('Set', 'Activar', 'Set current', ['a', 's']), K('Rename', 'Renombrar', 'Rename', ['r']), K('Delete', 'Eliminar', 'Delete', ['e', 'd']), K('Show', 'Hacer visible', 'Make visible', ['v', 'show']), K('Hide', 'Hacer invisible', 'Make invisible', ['i', 'hide']), K('Default', 'Por defecto', 'Default', ['p', 'def'])];
    const key = args?.[0] ? editor.runner.matchKeyword(args[0], kws) : null;
    const k = key ? { kind: 'keyword' as const, key } : await api.getKeyword({ prompt: L(`Estado actual: «${cur}» (${vis.states.map((s) => s.name).join(', ')})`, `Current state: "${cur}" (${vis.states.map((s) => s.name).join(', ')})`), keywords: kws });
    if (k.kind !== 'keyword') return;
    const setParam = (fn: (p: VisibilityParam) => VisibilityParam) => updateDynamic(api, 'BVSTATE', (d) => ({ ...d, parameters: d.parameters.map((p) => (p.id === vis.id ? fn(p as VisibilityParam) : p)) }));
    const states = vis.states;
    const choose = async (prompt: { es: string; en: string }) => {
      const r = await api.getKeyword({ prompt, keywords: states.map((s, i) => K(String(i), s.name, s.name, [s.name.toLowerCase()])) });
      return r.kind === 'keyword' ? states[Number(r.key)] : null;
    };
    switch (k.key) {
      case 'New': {
        const n = await api.getString({ prompt: L('Nombre del estado', 'State name'), allowSpaces: true });
        if (n.kind !== 'string' || !n.value) return;
        if (states.some((s) => s.name.toLowerCase() === n.value.toLowerCase())) throw new CommandError(L('Ya existe un estado con ese nombre.', 'A state with that name already exists.'));
        const mode = await api.getKeyword({ prompt: L('Objetos visibles en el nuevo estado', 'Visible objects in the new state'), keywords: [K('Current', 'Como el actual', 'Same as current', ['a', 'c']), K('All', 'Todos visibles', 'All visible', ['t']), K('None', 'Todos ocultos', 'All hidden', ['n'])], defaultValue: 'Current' });
        const all = editor.doc.entitiesOf(b.id).map((e) => e.id);
        const visible = mode.kind === 'keyword' && mode.key === 'All' ? all : mode.kind === 'keyword' && mode.key === 'None' ? [] : [...(states.find((s) => s.name === cur)?.visible ?? all)];
        setParam((p) => ({ ...p, states: [...p.states, { name: n.value, visible }] }));
        editor.blockEditState = { currentVisibility: n.value };
        break;
      }
      case 'Set': {
        const s = await choose(L('Estado a activar', 'State to set current'));
        if (s) editor.blockEditState = { currentVisibility: s.name };
        break;
      }
      case 'Default': {
        const s = await choose(L('Estado por defecto', 'Default state'));
        if (s) setParam((p) => ({ ...p, defaultState: s.name }));
        break;
      }
      case 'Rename': {
        const s = await choose(L('Estado a renombrar', 'State to rename'));
        if (!s) return;
        const n = await api.getString({ prompt: L('Nuevo nombre', 'New name'), allowSpaces: true });
        if (n.kind !== 'string' || !n.value) return;
        setParam((p) => ({ ...p, defaultState: p.defaultState === s.name ? n.value : p.defaultState, states: p.states.map((x) => (x.name === s.name ? { ...x, name: n.value } : x)) }));
        if (cur === s.name) editor.blockEditState = { currentVisibility: n.value };
        break;
      }
      case 'Delete': {
        if (states.length <= 1) throw new CommandError(L('Debe quedar al menos un estado.', 'At least one state must remain.'));
        const s = await choose(L('Estado a eliminar', 'State to delete'));
        if (!s) return;
        setParam((p) => {
          const rest = p.states.filter((x) => x.name !== s.name);
          return { ...p, states: rest, defaultState: p.defaultState === s.name ? rest[0].name : p.defaultState };
        });
        if (cur === s.name) editor.blockEditState = { currentVisibility: states.find((x) => x.name !== s.name)!.name };
        break;
      }
      case 'Show':
      case 'Hide': {
        const ids = await api.getSelection({ prompt: L(`Designe objetos a ${k.key === 'Show' ? 'mostrar' : 'ocultar'} en «${cur}»`, `Select objects to ${k.key === 'Show' ? 'show' : 'hide'} in "${cur}"`), allowLocked: true, usePreselection: true });
        setParam((p) => ({ ...p, states: p.states.map((s) => (s.name !== cur ? s : { ...s, visible: k.key === 'Show' ? [...new Set([...s.visible, ...ids])] : s.visible.filter((v) => !ids.includes(v)) })) }));
        break;
      }
    }
    editor.emit('doc');
  },
};

// ------------------------------------------------------------------ restricciones y variables

function refFromPick(api: CommandApi, id: Id, p: Vec2, wantSegment = false): GeoRef | null {
  const e = api.editor.doc.entity(id);
  if (!e) return null;
  if (e.type === 'line') {
    if (wantSegment) return { entityId: id, part: 'edge' };
    return { entityId: id, part: dist(e.start, p) <= dist(e.end, p) ? 'start' : 'end' };
  }
  if (e.type === 'circle' || e.type === 'arc' || e.type === 'ellipse') return { entityId: id, part: 'center' };
  if (e.type === 'lwpolyline') {
    if (wantSegment) {
      const curves = kindOf(e).curves(e, api.editor.ctx);
      let best = 0;
      let bd = Infinity;
      curves.forEach((c, i) => {
        const d = dist(closestPoint(c, p), p);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return { entityId: id, part: `segment:${best}` };
    }
    let best = 0;
    let bd = Infinity;
    e.vertices.forEach((v, i) => {
      const d = dist(v, p);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return { entityId: id, part: `vertex:${best}` };
  }
  if (e.type === 'point' || e.type === 'text' || e.type === 'mtext' || e.type === 'insert' || e.type === 'attdef') return { entityId: id, part: 'point' };
  return null;
}

const BCONSTRAINT: CommandDef = {
  name: 'BCONSTRAINT',
  aliases: ['BGEOMCONSTRAINT'],
  category: 'constraint',
  label: L('Restricción geométrica', 'Geometric constraint'),
  description: L('Horizontal, vertical, paralela, perpendicular, coincidente, tangente, concéntrica, igual, simétrica, fija o colineal.', 'Horizontal, vertical, parallel, perpendicular, coincident, tangent, concentric, equal, symmetric, fixed or collinear.'),
  icon: 'constraint',
  async run(api) {
    currentBlock(api);
    const types: [GeoConstraintType, string, string][] = [
      ['horizontal', 'Horizontal', 'Horizontal'],
      ['vertical', 'Vertical', 'Vertical'],
      ['parallel', 'Paralela', 'Parallel'],
      ['perpendicular', 'Perpendicular', 'Perpendicular'],
      ['coincident', 'Coincidente', 'Coincident'],
      ['tangent', 'Tangente', 'Tangent'],
      ['concentric', 'Concéntrica', 'Concentric'],
      ['equal', 'Igual', 'Equal'],
      ['symmetric', 'Simétrica', 'Symmetric'],
      ['fixed', 'Fija', 'Fix'],
      ['collinear', 'Colineal', 'Collinear'],
    ];
    const k = await api.getKeyword({ prompt: L('Tipo de restricción', 'Constraint type'), keywords: types.map(([t, es, en]) => K(t, es, en)) });
    if (k.kind !== 'keyword') return;
    const type = k.key as GeoConstraintType;
    const segmentTypes: GeoConstraintType[] = ['parallel', 'perpendicular', 'collinear', 'equal', 'horizontal', 'vertical'];
    const count = type === 'fixed' ? 1 : type === 'horizontal' || type === 'vertical' ? 1 : type === 'symmetric' ? 3 : 2;
    const refs: GeoRef[] = [];
    for (let i = 0; i < count; i++) {
      const wantSeg = segmentTypes.includes(type) || (type === 'tangent' && i === 0) || (type === 'symmetric' && i === 2);
      const r = await api.getEntity({ prompt: L(`Designe ${wantSeg ? 'el tramo' : 'el punto/objeto'} ${i + 1} de ${count}`, `Select ${wantSeg ? 'segment' : 'point/object'} ${i + 1} of ${count}`), allowLocked: true });
      if (r.kind !== 'entity') return;
      const ref = refFromPick(api, r.id, r.p, wantSeg);
      if (!ref) throw new CommandError(L('Ese objeto no admite esta restricción.', 'That object does not support this constraint.'));
      refs.push(ref);
    }
    const c: BlockConstraint = { id: newId('cns'), kind: 'geometric', type, refs, enabled: true };
    updateDynamic(api, 'BCONSTRAINT', (d) => ({ ...d, constraints: [...d.constraints, c] }));
    requestUi('panel:authoring');
  },
};

const BCPARAMETER: CommandDef = {
  name: 'BCPARAMETER',
  aliases: ['BCPARAM', 'PARAMRESTRICCION'],
  category: 'constraint',
  label: L('Parámetro de restricción', 'Constraint parameter'),
  description: L('Restricción dimensional (lineal H/V, alineada, angular, radio, diámetro) con nombre y fórmula; editable en la instancia.', 'Dimensional constraint (linear H/V, aligned, angular, radius, diameter) with name and formula; editable on the instance.'),
  icon: 'constraint',
  async run(api) {
    const b = currentBlock(api);
    const kws: [DimConstraintType, string, string][] = [
      ['linear-h', 'Horizontal', 'Horizontal'],
      ['linear-v', 'Vertical', 'Vertical'],
      ['aligned', 'Alineada', 'Aligned'],
      ['angular', 'Angular', 'Angular'],
      ['radius', 'Radio', 'Radius'],
      ['diameter', 'Diámetro', 'Diameter'],
    ];
    const k = await api.getKeyword({ prompt: L('Tipo de restricción dimensional', 'Dimensional constraint type'), keywords: kws.map(([t, es, en]) => K(t, es, en)), defaultValue: 'aligned' });
    if (k.kind !== 'keyword') return;
    const type = k.key as DimConstraintType;
    const refs: GeoRef[] = [];
    let current = 0;
    const doc = api.editor.doc;
    if (type === 'radius' || type === 'diameter') {
      const r = await api.getEntity({ prompt: L('Designe arco o círculo', 'Select arc or circle'), types: ['arc', 'circle'] });
      if (r.kind !== 'entity') return;
      refs.push({ entityId: r.id, part: 'edge' });
      const e = doc.entity(r.id) as Entity & { radius: number };
      current = type === 'radius' ? e.radius : e.radius * 2;
    } else if (type === 'angular') {
      for (let i = 0; i < 2; i++) {
        const r = await api.getEntity({ prompt: L(`Designe la línea ${i + 1}`, `Select line ${i + 1}`), types: ['line', 'lwpolyline'] });
        if (r.kind !== 'entity') return;
        refs.push(refFromPick(api, r.id, r.p, true)!);
      }
      const segs = refs.map((ref) => {
        const e = doc.entity(ref.entityId)!;
        const cs = kindOf(e).curves(e, api.editor.ctx);
        const idx = ref.part.startsWith('segment:') ? Number(ref.part.split(':')[1]) : 0;
        return cs[idx];
      });
      current = ((angleOf(sub(curveEnd(segs[1]), curveStart(segs[1]))) - angleOf(sub(curveEnd(segs[0]), curveStart(segs[0])))) * 180) / Math.PI;
    } else {
      for (let i = 0; i < 2; i++) {
        const r = await api.getEntity({ prompt: L(`Designe el punto ${i + 1} (extremo de línea, vértice o centro)`, `Select point ${i + 1} (line end, vertex or center)`), allowLocked: true });
        if (r.kind !== 'entity') return;
        refs.push(refFromPick(api, r.id, r.p)!);
      }
      const pts = refs.map((ref) => {
        const e = doc.entity(ref.entityId)!;
        if (ref.part === 'start' && e.type === 'line') return e.start;
        if (ref.part === 'end' && e.type === 'line') return e.end;
        if (ref.part === 'center') return (e as { center: Vec2 }).center;
        if (ref.part.startsWith('vertex:') && e.type === 'lwpolyline') return e.vertices[Number(ref.part.split(':')[1])];
        return (e as { position?: Vec2 }).position ?? { x: 0, y: 0 };
      });
      current = type === 'linear-h' ? Math.abs(pts[1].x - pts[0].x) : type === 'linear-v' ? Math.abs(pts[1].y - pts[0].y) : dist(pts[0], pts[1]);
    }
    const names = new Set([...(b.dynamic?.constraints ?? []).map((c) => (c.kind === 'dimensional' ? c.name : '')), ...(b.dynamic?.parameters ?? []).map((p) => p.name), ...(b.dynamic?.variables ?? []).map((v) => v.name)]);
    let i = 1;
    while (names.has(`d${i}`)) i++;
    const n = await api.getString({ prompt: L('Nombre', 'Name'), defaultValue: `d${i}` });
    if (n.kind !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(n.value)) throw new CommandError(L('Nombre no válido: usa letras, dígitos y _ (sin empezar por dígito).', 'Invalid name: use letters, digits and _ (not starting with a digit).'));
    if (names.has(n.value)) throw new CommandError(L('Ese nombre ya existe en el bloque.', 'That name already exists in the block.'));
    const ex = await api.getString({ prompt: L('Valor o fórmula', 'Value or formula'), defaultValue: String(Math.round(current * 1e6) / 1e6), allowSpaces: true });
    if (ex.kind !== 'string') return;
    const isParam = await api.getKeyword({ prompt: L('¿Parámetro de restricción (editable en la instancia)?', 'Constraint parameter (editable on the instance)?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'Yes' });
    const c: BlockConstraint = { id: newId('cns'), kind: 'dimensional', type, name: n.value, refs, expression: ex.value, isParameter: !(isParam.kind === 'keyword' && isParam.key === 'No'), valueSet: VS() };
    updateDynamic(api, 'BCPARAMETER', (d) => ({ ...d, constraints: [...d.constraints, c] }));
    requestUi('panel:authoring');
  },
};

const BVARIABLE: CommandDef = {
  name: 'BVARIABLE',
  aliases: ['VARIABLEBLOQUE'],
  category: 'constraint',
  label: L('Variable de usuario', 'User variable'),
  description: L('Define una variable con fórmula usable por restricciones, matrices y otras fórmulas; puede ser propiedad visible.', 'Defines a formula variable usable by constraints, arrays and other formulas; can be a visible property.'),
  async run(api) {
    const n = await api.getString({ prompt: L('Nombre de la variable', 'Variable name') });
    if (n.kind !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(n.value)) throw new CommandError(L('Nombre no válido.', 'Invalid name.'));
    const ex = await api.getString({ prompt: L('Expresión', 'Expression'), allowSpaces: true, defaultValue: '0' });
    if (ex.kind !== 'string') return;
    const exposed = await api.getKeyword({ prompt: L('¿Mostrar como propiedad de la instancia?', 'Show as instance property?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'Yes' });
    updateDynamic(api, 'BVARIABLE', (d) => ({ ...d, variables: [...d.variables.filter((v) => v.name !== n.value), { name: n.value, expression: ex.value, exposed: exposed.kind === 'keyword' && exposed.key === 'Yes', readOnly: false }] }));
  },
};

const BCLEANUP: CommandDef = {
  name: 'BVALIDATEREPAIR',
  aliases: ['REPARARBLOQUE'],
  category: 'block',
  label: L('Reparar referencias del bloque', 'Repair block references'),
  description: L('Elimina de acciones, estados y restricciones las referencias a objetos que ya no existen.', 'Removes references to deleted objects from actions, states and constraints.'),
  run(api) {
    const b = currentBlock(api);
    const ids = new Set(api.editor.doc.entitiesOf(b.id).map((e) => e.id));
    let n = 0;
    updateDynamic(api, 'BVALIDATEREPAIR', (d) => {
      const pids = new Set(d.parameters.map((p) => p.id));
      const actions = d.actions.filter((a) => pids.has(a.paramId)).map((a) => {
        const sel = a.selection.filter((s) => ids.has(s) || pids.has(s));
        n += a.selection.length - sel.length;
        return { ...a, selection: sel };
      });
      n += d.actions.length - actions.length;
      const constraints = d.constraints.filter((c) => c.refs.every((r) => ids.has(r.entityId)));
      n += d.constraints.length - constraints.length;
      const parameters = d.parameters.map((p) => (p.type === 'visibility' ? { ...p, states: p.states.map((s) => ({ ...s, visible: s.visible.filter((v) => ids.has(v)) })) } : p));
      return { ...d, actions, constraints, parameters };
    });
    api.info(L(`${n} referencia(s) rota(s) eliminada(s).`, `${n} broken reference(s) removed.`));
  },
};

export const BLOCK_EDITOR_COMMANDS: CommandDef[] = [BEDIT, BCLOSE, BSAVE, BSAVEAS, BTESTBLOCK, BTESTCLOSE, BPARAMETER, BACTION, BVSTATE, BCONSTRAINT, BCPARAMETER, BVARIABLE, BCLEANUP];
