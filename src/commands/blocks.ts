import { requestUi } from '../app/services';
import { createBlock, extractAttributes, insertBlock, isInsertableBlock, validateBlockName } from '../blocks/blockOps';
import { resetDynamic, validateDynamicBlock } from '../blocks/dynamic';
import { installDynamicSamples } from '../blocks/samples';
import { makeLibraryBlock, packageBlock } from '../blocks/library';
import { suggestCategory } from '../blocks/libraryCategories';
import { commitLibrary, loadCategories } from '../blocks/libraryStore';
import { blockThumbnail } from '../render/thumbnail';
import type { AttdefEntity, InsertEntity } from '../document/types';
import { TEXTSTYLE_STANDARD_ID } from '../document/defaults';
import { add, K, L, make } from './helpers';
import type { CommandDef } from './types';
import { CommandError } from './types';

const INSERT: CommandDef = {
  name: 'INSERT',
  aliases: ['I', 'INSERTAR', 'CLASSICINSERT'],
  category: 'block',
  label: L('Insertar bloque', 'Insert block'),
  description: L('Inserta una referencia a bloque con escala, rotación, atributos y autoescalado por unidades.', 'Inserts a block reference with scale, rotation, attributes and unit auto-scaling.'),
  icon: 'insert',
  async run(api, args) {
    const doc = api.editor.doc;
    let name = args?.[0];
    if (!name) {
      const blocks = [...doc.data.blocks.values()].filter(isInsertableBlock).map((b) => b.name);
      if (!blocks.length) throw new CommandError(L('El dibujo no tiene bloques. Crea uno con BLOCK o usa los ejemplos dinámicos.', 'The drawing has no blocks. Create one with BLOCK or use the dynamic samples.'));
      const r = await api.getString({ prompt: L(`Nombre del bloque (${blocks.slice(0, 6).join(', ')}${blocks.length > 6 ? '…' : ''})`, `Block name (${blocks.slice(0, 6).join(', ')}${blocks.length > 6 ? '…' : ''})`), allowSpaces: true, defaultValue: blocks[0] });
      if (r.kind !== 'string') return;
      name = r.value;
    }
    const block = doc.findByName('blocks', name);
    if (!block) throw new CommandError(L(`No existe el bloque «${name}».`, `Block "${name}" not found.`));
    let scale = 1;
    let rotation = 0;
    const preview = (p: { x: number; y: number }) => ({
      entities: [make<InsertEntity>(api, { type: 'insert', blockId: block.id, position: p, scale: { x: scale, y: scale }, rotation, attributes: [] })],
    });
    let pos: { x: number; y: number } | null = null;
    while (!pos) {
      const r = await api.getPoint({ prompt: L('Precise el punto de inserción', 'Specify insertion point'), keywords: [K('Scale', 'Escala', 'Scale', ['e', 's']), K('Rotate', 'Rotación', 'Rotate', ['r'])], preview });
      if (r.kind === 'point') pos = r.p;
      else if (r.kind === 'keyword' && r.key === 'Scale') {
        const s = await api.getNumber({ prompt: L('Factor de escala', 'Scale factor'), defaultValue: scale });
        if (s.kind === 'value' && s.value !== 0) scale = s.value;
      } else if (r.kind === 'keyword') {
        const a = await api.getAngle({ prompt: L('Ángulo de rotación', 'Rotation angle'), defaultValue: rotation });
        if (a.kind === 'value') rotation = a.value;
      } else return;
    }
    const at = pos;
    const s = await api.getNumber({ prompt: L('Factor de escala X', 'X scale factor'), defaultValue: scale });
    if (s.kind === 'value' && s.value !== 0) scale = s.value;
    const rot = await api.getAngle({ prompt: L('Ángulo de rotación', 'Rotation angle'), base: at, defaultValue: rotation });
    if (rot.kind === 'value') rotation = rot.value;
    const attdefs = doc.entitiesOf(block.id).filter((e): e is AttdefEntity => e.type === 'attdef' && !e.constant);
    const values: Record<string, string> = {};
    for (const a of attdefs) {
      if (a.preset) continue;
      const v = await api.getString({ prompt: L(`${a.prompt || a.tag}`, `${a.prompt || a.tag}`), defaultValue: a.defaultValue, allowSpaces: true });
      values[a.tag] = v.kind === 'string' ? v.value : a.defaultValue;
    }
    api.apply('INSERT', (tx) => insertBlock(tx, doc, block.id, api.editor.inputOwner, at, { x: scale, y: scale }, rotation, values));
    api.lastPoint = at;
  },
};

const BLOCK: CommandDef = {
  name: 'BLOCK',
  aliases: ['B', 'BMAKE', 'BLOQUE'],
  category: 'block',
  label: L('Crear bloque', 'Create block'),
  description: L('Define un bloque a partir de objetos designados con punto base, y opcionalmente lo convierte en instancia.', 'Defines a block from selected objects with a base point, optionally converting them into an instance.'),
  icon: 'block',
  async run(api) {
    const doc = api.editor.doc;
    const n = await api.getString({ prompt: L('Nombre del bloque', 'Block name'), allowSpaces: true });
    if (n.kind !== 'string') return;
    const err = validateBlockName(doc, n.value);
    if (err) throw new CommandError(L(err, err));
    const bp = await api.getPoint({ prompt: L('Precise el punto base', 'Specify base point') });
    if (bp.kind !== 'point') return;
    const ids = await api.getSelection({ prompt: L('Designe objetos', 'Select objects') });
    if (!ids.length) throw new CommandError(L('No se designó ningún objeto.', 'No objects selected.'));
    const mode = await api.getKeyword({ prompt: L('¿Qué hacer con los objetos?', 'What to do with the objects?'), keywords: [K('Convert', 'Convertir en bloque', 'Convert to block', ['c']), K('Retain', 'Conservar', 'Retain', ['r']), K('Delete', 'Borrar', 'Delete', ['b', 'd'])], defaultValue: 'Convert' });
    const m = mode.kind === 'keyword' ? (mode.key.toLowerCase() as 'convert' | 'retain' | 'delete') : 'convert';
    const desc = await api.getString({ prompt: L('Descripción (opcional)', 'Description (optional)'), allowSpaces: true, allowNone: true });
    const res = api.apply('BLOCK', (tx) => createBlock(tx, doc, { name: n.value, basePoint: bp.p, ids, mode: m, description: desc.kind === 'string' ? desc.value : '' }));
    api.info(L(`Bloque «${res.block.name}» creado con ${ids.length} objeto(s).`, `Block "${res.block.name}" created with ${ids.length} object(s).`));
  },
};

const ATTDEF: CommandDef = {
  name: 'ATTDEF',
  aliases: ['ATT', 'ATRDEF'],
  category: 'block',
  label: L('Definir atributo', 'Define attribute'),
  description: L('Crea una definición de atributo (etiqueta, solicitud, valor por defecto, modos).', 'Creates an attribute definition (tag, prompt, default, modes).'),
  icon: 'attdef',
  async run(api) {
    const tag = await api.getString({ prompt: L('Etiqueta (sin espacios)', 'Tag (no spaces)') });
    if (tag.kind !== 'string' || !tag.value.trim()) return;
    if (/\s/.test(tag.value.trim())) throw new CommandError(L('La etiqueta no puede contener espacios.', 'Tag cannot contain spaces.'));
    const prompt = await api.getString({ prompt: L('Solicitud', 'Prompt'), allowSpaces: true, allowNone: true });
    const def = await api.getString({ prompt: L('Valor por defecto', 'Default value'), allowSpaces: true, allowNone: true });
    const modes = await api.getString({ prompt: L('Modos: I(nvisible) C(onstante) V(erificar) P(redefinido) — letras o Intro', 'Modes: I(nvisible) C(onstant) V(erify) P(reset) — letters or Enter'), allowNone: true });
    const m = modes.kind === 'string' ? modes.value.toUpperCase() : '';
    const h = await api.getDistance({ prompt: L('Altura del texto', 'Text height'), defaultValue: api.editor.doc.settings.textHeight });
    const pos = await api.getPoint({ prompt: L('Punto inicial', 'Start point') });
    if (pos.kind !== 'point') return;
    add<AttdefEntity>(api, 'ATTDEF', {
      type: 'attdef',
      tag: tag.value.trim().toUpperCase(),
      prompt: prompt.kind === 'string' ? prompt.value : tag.value,
      defaultValue: def.kind === 'string' ? def.value : '',
      position: pos.p,
      height: h.kind === 'value' ? h.value : api.editor.doc.settings.textHeight,
      rotation: 0,
      style: api.editor.doc.settings.currentTextStyle ?? TEXTSTYLE_STANDARD_ID,
      halign: 'left',
      valign: 'baseline',
      invisible: m.includes('I'),
      constant: m.includes('C'),
      verify: m.includes('V'),
      preset: m.includes('P'),
      lockPosition: false,
      multiline: false,
    });
  },
};

const ATTEDIT: CommandDef = {
  name: 'ATTEDIT',
  aliases: ['EATTEDIT', 'ATE', 'EDITATR'],
  category: 'block',
  label: L('Editar atributos', 'Edit attributes'),
  description: L('Edita los valores de atributos de una referencia a bloque.', 'Edits attribute values of a block reference.'),
  async run(api) {
    const r = await api.getEntity({ prompt: L('Designe un bloque con atributos', 'Select a block with attributes'), types: ['insert'] });
    if (r.kind !== 'entity') return;
    const ins = api.editor.doc.entity(r.id) as InsertEntity;
    const defs = api.editor.doc.entitiesOf(ins.blockId).filter((e): e is AttdefEntity => e.type === 'attdef' && !e.constant);
    if (!defs.length) throw new CommandError(L('El bloque no tiene atributos editables.', 'The block has no editable attributes.'));
    const attributes = [...ins.attributes];
    for (const d of defs) {
      const cur = attributes.find((a) => a.tag.toUpperCase() === d.tag.toUpperCase());
      const v = await api.getString({ prompt: L(`${d.tag}`, `${d.tag}`), defaultValue: cur?.value ?? d.defaultValue, allowSpaces: true });
      if (v.kind !== 'string') continue;
      if (cur) cur.value = v.value;
      else attributes.push({ tag: d.tag, value: v.value });
    }
    api.apply('ATTEDIT', (tx) => tx.updateEntity<InsertEntity>(ins.id, { attributes: attributes.map((a) => ({ ...a })) }));
  },
};

const DATAEXTRACTION: CommandDef = {
  name: 'DATAEXTRACTION',
  aliases: ['ATTEXT', 'EXTRAERDATOS'],
  category: 'block',
  readOnly: true,
  ui: 'attribute-extraction',
  label: L('Extraer atributos', 'Extract attributes'),
  description: L('Tabla de atributos de bloques exportable a CSV/JSON o insertable como TABLE.', 'Block attribute table exportable to CSV/JSON or insertable as TABLE.'),
  run(api) {
    const d = extractAttributes(api.editor.doc);
    api.info(L(`${d.rows.length} instancias con atributos.`, `${d.rows.length} instances with attributes.`));
  },
};

const DYNBLOCKSAMPLES: CommandDef = {
  name: 'DYNBLOCKSAMPLES',
  aliases: ['EJEMPLOSDINAMICOS'],
  category: 'block',
  label: L('Ejemplos de bloques dinámicos', 'Dynamic block samples'),
  description: L('Crea cinco bloques dinámicos de ejemplo y coloca una instancia de cada uno.', 'Creates five dynamic sample blocks and places one instance of each.'),
  icon: 'dynblock',
  async run(api) {
    const ids = installDynamicSamples(api.editor.doc);
    const c = api.editor.view.center;
    const place = await api.getKeyword({ prompt: L('¿Colocar una instancia de cada ejemplo en la vista?', 'Place one instance of each sample in view?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'Yes' });
    if (place.kind === 'keyword' && place.key === 'Yes') {
      const spacing = [0, 1700, 1800, 2200, 2500];
      let x = c.x - 3000;
      api.apply('DYNBLOCKSAMPLES', (tx) => {
        ids.forEach((id, i) => {
          const b = api.editor.doc.data.blocks.get(id)!;
          const s = b.name.includes('eléctrico') ? 60 : b.name.includes('Soporte') || b.name.includes('Brida') ? 8 : 1;
          insertBlock(tx, api.editor.doc, id, api.editor.inputOwner, { x, y: c.y }, { x: s, y: s });
          x += spacing[i + 1] ?? 1600;
        });
      });
      api.editor.zoomExtents();
    }
    api.info(L('Selecciona una instancia: sus grips dinámicos (flechas, rombos, menús) y la paleta Propiedades controlan parámetros, visibilidad y consultas.', 'Select an instance: its dynamic grips (arrows, diamonds, menus) and the Properties palette drive parameters, visibility and lookups.'));
  },
};

const RESETBLOCK: CommandDef = {
  name: 'RESETBLOCK',
  aliases: ['RESTABLECERBLOQUE'],
  category: 'block',
  label: L('Restablecer bloque dinámico', 'Reset dynamic block'),
  description: L('Devuelve instancias dinámicas a los valores por defecto de su definición.', 'Resets dynamic instances to their definition defaults.'),
  async run(api) {
    const ids = await api.getSelection({ prompt: L('Designe referencias a bloque', 'Select block references'), types: ['insert'] });
    api.apply('RESETBLOCK', (tx) => {
      for (const id of ids) tx.put('entities', resetDynamic(api.editor.doc.entity(id) as InsertEntity));
    });
  },
};

const WBLOCK: CommandDef = {
  name: 'WBLOCK',
  aliases: ['W', 'BLOQUEDISCO'],
  category: 'block',
  readOnly: true,
  label: L('Enviar bloque a biblioteca', 'Write block to library'),
  description: L('Guarda un bloque (con dependencias) en la biblioteca compartida del navegador.', 'Saves a block (with dependencies) to the browser shared library.'),
  async run(api) {
    const name = await api.getString({ prompt: L('Nombre del bloque', 'Block name'), allowSpaces: true });
    if (name.kind !== 'string') return;
    const b = api.editor.doc.findByName('blocks', name.value);
    if (!b) throw new CommandError(L(`No existe el bloque «${name.value}».`, `Block "${name.value}" not found.`));
    const pkg = packageBlock(api.editor.doc, b.id);
    const cats = await loadCategories();
    await commitLibrary({ put: [makeLibraryBlock(pkg, { name: b.name, categoryId: suggestCategory(`${b.name} ${b.description}`, cats), tags: [], thumbnail: blockThumbnail(api.editor, b.id, 64) ?? undefined, source: { kind: 'fmodel', importedAt: Date.now() } })] });
    api.info(L(`«${b.name}» guardado en la biblioteca compartida.`, `"${b.name}" saved to the shared library.`));
  },
};

const BVALIDATE: CommandDef = {
  name: 'BVALIDATE',
  aliases: ['VALIDARBLOQUE'],
  category: 'block',
  readOnly: true,
  label: L('Validar bloque dinámico', 'Validate dynamic block'),
  description: L('Comprueba parámetros sin acción, referencias rotas, fórmulas y conflictos de restricciones.', 'Checks parameters without actions, broken references, formulas and constraint conflicts.'),
  async run(api, args) {
    let name = args?.[0];
    if (!name) {
      const r = await api.getString({ prompt: L('Nombre del bloque', 'Block name'), allowSpaces: true });
      if (r.kind !== 'string') return;
      name = r.value;
    }
    const b = api.editor.doc.findByName('blocks', name);
    if (!b) throw new CommandError(L(`No existe el bloque «${name}».`, `Block "${name}" not found.`));
    const rep = validateDynamicBlock(api.editor.ctx, b);
    for (const e of rep.errors) api.warn(L(`✖ ${e}`, `✖ ${e}`));
    for (const w of rep.warnings) api.warn(L(w, w));
    if (!rep.errors.length && !rep.warnings.length) api.info(L(`«${b.name}» sin problemas.`, `"${b.name}" has no issues.`));
    requestUi('panel:blocks');
  },
};

/** Sincroniza atributos de instancias con la definición (ATTSYNC). */
const ATTSYNC: CommandDef = {
  name: 'ATTSYNC',
  aliases: ['SINCATR'],
  category: 'block',
  label: L('Sincronizar atributos', 'Synchronize attributes'),
  description: L('Actualiza las instancias para reflejar atributos añadidos o eliminados en la definición, conservando valores.', 'Updates instances to reflect attributes added/removed in the definition, keeping values.'),
  async run(api) {
    const name = await api.getString({ prompt: L('Nombre del bloque', 'Block name'), allowSpaces: true });
    if (name.kind !== 'string') return;
    const b = api.editor.doc.findByName('blocks', name.value);
    if (!b) throw new CommandError(L(`No existe el bloque «${name.value}».`, `Block "${name.value}" not found.`));
    const defs = api.editor.doc.entitiesOf(b.id).filter((e): e is AttdefEntity => e.type === 'attdef' && !e.constant);
    let n = 0;
    api.apply('ATTSYNC', (tx) => {
      for (const e of api.editor.doc.data.entities.values()) {
        if (e.type !== 'insert' || e.blockId !== b.id) continue;
        const attrs = defs.map((d) => {
          const cur = e.attributes.find((a) => a.tag.toUpperCase() === d.tag.toUpperCase());
          return { tag: d.tag, value: cur?.value ?? d.defaultValue };
        });
        tx.updateEntity<InsertEntity>(e.id, { attributes: attrs });
        n++;
      }
    });
    api.info(L(`${n} instancia(s) sincronizada(s).`, `${n} instance(s) synchronized.`));
  },
};

export const BLOCK_COMMANDS: CommandDef[] = [INSERT, BLOCK, ATTDEF, ATTEDIT, DATAEXTRACTION, DYNBLOCKSAMPLES, RESETBLOCK, WBLOCK, BVALIDATE, ATTSYNC];
