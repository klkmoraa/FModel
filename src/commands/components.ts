import { COMPONENT_CATALOG, parseComponentArguments } from '../app/componentCatalog';
import { entityDefaults } from '../document/defaults';
import { buildComponent } from '../geometry/architecture/components';
import { requireLayout } from '../geometry/architecture/schema';
import { componentProperties, componentPreviewEntities, createComponentAssembly, readComponentAssembly, updateComponentAssembly } from '../model/componentAssembly';
import type { ComponentState } from '../model/componentAssembly';
import { changeComponentField, componentFailure } from './componentParameters';
import { K, L, fail } from './helpers';
import type { CommandApi, CommandDef } from './types';
const parameters = K('Parameters', 'Parámetros', 'Parameters', ['p', 'parametros']);
const rotation = K('Rotation', 'Giro', 'Rotation', ['g', 'r', 'giro']);
const aliases = ['COLUMNA', 'RETICULA', 'ESCALERAPLANTA', 'ESCALERASECCION', 'ESCALERAMECANICA', 'ELEVADOR', 'PUERTAALZADO', 'PUERTASECCION', 'VENTANAALZADO', 'VENTANASECCION', 'VENTANASALIENTE', 'MUROCORTINA', 'MAMPARA', 'BARANDAL'];
const help = L('Argumentos clave=valor: números dimensionales en unidades del dibujo, sufijos mm/cm/m/in físicos; conteos enteros y variantes del catálogo. rotation=90 en grados. Punto de inserción confirma; Parámetros edita un campo y Giro cambia el ángulo antes de colocar. Intro o Esc antes de colocar cancela sin cambios. Pieza agrupada editable con COMPONENTEDIT; DXF conserva geometría y texto pero pierde parámetros.', 'Named key=value arguments: dimensional numbers use drawing units, physical mm/cm/m/in suffixes; integer counts and catalogue variants. rotation=90 uses degrees. Insertion point confirms; Parameters edits a field and Rotation changes the angle before placement. Enter or Esc before placement cancels without changes. Grouped component editable with COMPONENTEDIT; DXF keeps geometry/text but loses parameters.');
async function changeRotation(api: CommandApi, state: ComponentState) {
  const r = await api.getAngle({ prompt: L('Giro de la pieza', 'Component rotation'), defaultValue: state.rotation, allowNone: true });
  if (r.kind === 'value') { try { requireLayout(Number.isFinite(r.value), 'Giro inválido.', 'Invalid rotation.'); state.rotation = r.value; } catch (error) { componentFailure(error); } }
}
const constructors: CommandDef[] = COMPONENT_CATALOG.map((definition, index) => ({
  name: definition.command, aliases: [aliases[index]], category: 'draw', label: definition.label, icon: 'room',
  description: L(`Crea ${definition.label.es.toLowerCase()} con medidas editables y geometría nativa.`, `Create ${definition.label.en.toLowerCase()} with editable dimensions and native geometry.`),
  help: L(`${help.es} Campos: ${definition.fields.map(f => f.key).join(', ')}.`, `${help.en} Fields: ${definition.fields.map(f => f.key).join(', ')}.`),
  async run(api, args) {
    let parsed; try { parsed = parseComponentArguments(definition.kind, api.editor.doc.settings.units, args); } catch (error) { componentFailure(error); }
    const state: ComponentState = { kind: definition.kind, ...parsed!, insertion: { x: 0, y: 0 } }, properties = entityDefaults(api.editor.doc, api.editor.inputOwner), style = api.editor.doc.settings.currentTextStyle;
    for (;;) {
      const r = await api.getPoint({ prompt: L('Punto de inserción · Parámetros/Giro · Intro cancela', 'Insertion point · Parameters/Rotation · Enter cancels'), allowNone: true, rubber: 'none', keywords: [parameters, rotation], preview: insertion => { try { return { entities: componentPreviewEntities({ ...state, insertion }, properties, style) }; } catch { return null; } } });
      if (r.kind === 'none') return;
      if (r.kind === 'keyword') { if (r.key === parameters.key) state.parameters = await changeComponentField(api, state.kind, state.parameters); else await changeRotation(api, state); continue; }
      state.insertion = r.p;
      try { buildComponent(state.kind, state.parameters); api.apply(definition.command, tx => createComponentAssembly(tx, state, properties, style)); } catch (error) { componentFailure(error); }
      return;
    }
  },
}));
export const COMPONENTEDIT: CommandDef = {
  name: 'COMPONENTEDIT', aliases: ['EDITARPIEZA'], category: 'modify', label: L('Editar pieza', 'Edit component'), icon: 'room',
  description: L('Cambia parámetros de una pieza nativa conservando roles e IDs.', 'Change a native component’s parameters while preserving roles and IDs.'),
  help: L('Selecciona cualquier miembro de una pieza nativa; elige un campo o Giro. Intro confirma todos los cambios en un único paso de deshacer; Esc cancela sin modificar. Grupos incompletos, copias aisladas o información corrupta se rechazan.', 'Select any member of a native component; choose a field or Rotation. Enter confirms all changes as one undo step; Esc cancels without mutation. Incomplete groups, isolated copies or corrupt data are rejected.'),
  async run(api, args) {
    if (args?.length) fail('COMPONENTEDIT no acepta argumentos; selecciona la pieza.', 'COMPONENTEDIT takes no arguments; select the component.');
    const ids = await api.getSelection({ prompt: L('Selecciona un miembro de la pieza', 'Select a component member'), single: true }); if (!ids.length) return;
    let assembly; try { assembly = readComponentAssembly(api.editor.doc, ids[0]); } catch (error) { componentFailure(error); }
    const state: ComponentState = { kind: assembly!.kind, parameters: { ...assembly!.parameters }, insertion: { ...assembly!.insertion }, rotation: assembly!.rotation };
    const assertSelectable = () => { if (assembly!.members.some(id => !api.editor.isSelectable(id))) fail('La pieza contiene objetos bloqueados, ocultos o de otro espacio.', 'The component contains locked, hidden or foreign-space entities.'); };
    assertSelectable();
    const fields = COMPONENT_CATALOG.find(c => c.kind === state.kind)!.fields;
    for (;;) {
      const principal = api.editor.doc.entity(assembly!.principalId)!;
      const preview = () => ({ entities: componentPreviewEntities(state, componentProperties(principal), api.editor.doc.settings.currentTextStyle) });
      api.setPreview(preview());
      const choice = await api.getKeyword({ prompt: L('Parámetro o Giro · Intro confirma', 'Parameter or Rotation · Enter confirms'), allowNone: true, preview, keywords: [...fields.map(f => K(f.key, f.label.es, f.label.en)), rotation] });
      if (choice.kind === 'none') break;
      if (choice.key === rotation.key) await changeRotation(api, state); else state.parameters = await changeComponentField(api, state.kind, state.parameters, choice.key);
    }
    assertSelectable();
    try { api.apply('COMPONENTEDIT', tx => updateComponentAssembly(tx, ids[0], state)); } catch (error) { componentFailure(error); }
  },
};
export const COMPONENT_COMMANDS: CommandDef[] = [...constructors, COMPONENTEDIT];
