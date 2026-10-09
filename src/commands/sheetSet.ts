import { defaultPageSetup, entityDefaults, paperExtents } from '../document/defaults';
import { newId } from '../document/ids';
import { MODEL_SPACE_ID, type Entity, type Id, type LayoutRecord, type LineEntity, type TextEntity, type ViewportEntity } from '../document/types';
import { boxCenter, boxFromPoints } from '../geometry/bbox';
import { nearEqual, TOL } from '../geometry/tolerance';
import { parseViewportScale } from './layout';
import { K, L, fail, make } from './helpers';
import type { CommandDef } from './types';
export const SHEETSET: CommandDef = {
  name: 'SHEETSET', aliases: ['HOJASDESDEMARCOS'], category: 'layout', icon: 'layout', label: L('Hojas desde marcos', 'Sheets from frames'), description: L('Crea hojas A3/A4, cajetín y viewports bloqueados a la escala indicada.', 'Create A3/A4 sheets, title blocks and locked viewports at the specified scale.'),
  help: L('Selecciona marcos rectangulares rectos, alineados con los ejes, en Modelo. Elige A3/A4 horizontal, escala, proyecto y nombre base. Máximo 50 hojas por lote. Los marcos deben caber completos a esa escala; Intro confirma, Esc cancela. PUBLICAR descarga un PDF con las hojas elegidas.', 'Select straight axis-aligned rectangular frames in Model. Choose A3/A4 landscape, scale, project and base name. At most 50 sheets per batch. Frames must fit entirely at that scale; Enter confirms, Esc cancels. PUBLISH downloads a PDF of selected sheets.'),
  async run(api) {
    const doc = api.editor.doc;
    if (api.editor.inputOwner !== MODEL_SPACE_ID)
      fail('Selecciona marcos en Modelo.', 'Select frames in Model.');
    const ids = await api.getSelection({ prompt: L('Selecciona marcos rectangulares · Intro termina', 'Select rectangular frames · Enter finishes'), types: ['lwpolyline'] });
    if (!ids.length)
      return;
    const unique = [...new Set(ids)];
    if (unique.length > 50)
      fail('Máximo 50 hojas por lote.', 'At most 50 sheets per batch.');
    const frames = unique.map(id => {
      const e = doc.entity(id);
      if (e?.type !== 'lwpolyline' || e.owner !== MODEL_SPACE_ID || !e.closed || e.vertices.length !== 4 || e.vertices.some(v => v.bulge))
        fail('Cada marco debe ser un rectángulo recto de Modelo.', 'Every frame must be a straight Model rectangle.');
      const points = e!.type === 'lwpolyline' ? e!.vertices : [], box = boxFromPoints(points), width = box.maxX - box.minX, height = box.maxY - box.minY;
      if (![width, height].every(x => Number.isFinite(x) && x > TOL.LINEAR) || new Set(points.map(p => `${p.x},${p.y}`)).size !== 4 || points.some((p, i) => !((nearEqual(p.x, box.minX) || nearEqual(p.x, box.maxX)) && (nearEqual(p.y, box.minY) || nearEqual(p.y, box.maxY))) || (nearEqual(p.x, points[(i + 1) % 4].x) === nearEqual(p.y, points[(i + 1) % 4].y))))
        fail('Marco inválido, cruzado o girado; usa un rectángulo alineado con los ejes.', 'Invalid, crossed or rotated frame; use an axis-aligned rectangle.');
      return { id, box, width, height, center: boxCenter(box) };
    }).sort((a, b) => b.center.y - a.center.y || a.center.x - b.center.x || a.id.localeCompare(b.id));
    const version = doc.version, format = await api.getKeyword({ prompt: L('Papel horizontal A3/A4', 'Landscape paper A3/A4'), keywords: [K('A3', 'A3', 'A3'), K('A4', 'A4', 'A4')], defaultValue: 'A3' });
    if (format.kind !== 'keyword')
      return;
    const scaleInput = await api.getString({ prompt: L('Escala física del viewport (1:50, 1:100…)', 'Physical viewport scale (1:50, 1:100…)'), defaultValue: '1:50' });
    if (scaleInput.kind !== 'string')
      return;
    const scale = parseViewportScale(scaleInput.value, doc.settings.units);
    if (!scale)
      fail('Escala positiva válida requerida.', 'A valid positive scale is required.');
    const project = await api.getString({ prompt: L('Proyecto', 'Project'), defaultValue: doc.settings.title, allowSpaces: true });
    if (project.kind !== 'string')
      return;
    const base = await api.getString({ prompt: L('Nombre base de hojas', 'Base sheet name'), defaultValue: api.lang === 'es' ? 'Planta' : 'Plan', allowSpaces: true });
    if (base.kind !== 'string')
      return;
    if ([project.value, base.value].some(s => !s.trim() || s.length > 120 || /[\r\n]/.test(s)))
      fail('Nombres de 1 a 120 caracteres en una línea.', 'Use single-line names of 1 to 120 characters.');
    const page = defaultPageSetup(`ISO ${format.key}`, 'landscape'), paper = paperExtents(page), m = page.margins, available = { width: paper.width - m.left - m.right, height: paper.height - m.top - m.bottom - 35 };
    const previews: Entity[] = [];
    for (const [i, f] of frames.entries()) {
      const width = f.width * scale!.scale, height = f.height * scale!.scale;
      if (![width, height].every(x => Number.isFinite(x) && x > 0) || width > available.width || height > available.height)
        fail(`El marco ${i + 1} no cabe completo en ${format.key} a ${scaleInput.value}. Elige papel mayor o escala menor.`, `Frame ${i + 1} does not fit entirely on ${format.key} at ${scaleInput.value}. Choose larger paper or a smaller scale.`);
      previews.push(make<TextEntity>(api, { type: 'text', text: `${base.value} ${i + 1} · ${scaleInput.value}`, position: f.center, height: 3 / scale!.scale, style: doc.settings.currentTextStyle, rotation: 0, widthFactor: 1, oblique: 0, halign: 'center', valign: 'middle' }));
    }
    api.setPreview({ entities: previews });
    try {
      const confirm = await api.getKeyword({ prompt: L(`Intro crea ${frames.length} hojas · Esc cancela`, `Enter creates ${frames.length} sheets · Esc cancels`), keywords: [K('Confirm', 'Confirmar', 'Confirm')], defaultValue: 'Confirm' });
      if (confirm.kind !== 'keyword')
        return;
      if (api.editor.doc !== doc || doc.version !== version || api.editor.inputOwner !== MODEL_SPACE_ID)
        fail('El dibujo cambió; selecciona de nuevo los marcos.', 'The drawing changed; select frames again.');
      const names = new Set([...doc.data.layouts.values()].map(l => l.name.toLowerCase())), order = Math.max(0, ...[...doc.data.layouts.values()].map(l => l.tabOrder));
      const sheetIds: Id[] = api.apply('SHEETSET', tx => frames.map((f, i) => {
        let name = `${base.value.trim()} ${String(i + 1).padStart(2, '0')}`, suffix = 2;
        while (names.has(name.toLowerCase()))
          name = `${base.value.trim()} ${String(i + 1).padStart(2, '0')} (${suffix++})`;
        names.add(name.toLowerCase());
        const id = newId('layout'), layout: LayoutRecord = { id, name, tabOrder: order + i + 1, page: structuredClone(page) };
        tx.add('layouts', layout);
        const props = entityDefaults(doc, id), left = m.left, right = paper.width - m.right, bottom = m.bottom, top = paper.height - m.top;
        const line = (x1: number, y1: number, x2: number, y2: number) => tx.addEntity<LineEntity>({ ...props, type: 'line', start: { x: x1, y: y1 }, end: { x: x2, y: y2 } });
        line(left, bottom, right, bottom);
        line(right, bottom, right, top);
        line(right, top, left, top);
        line(left, top, left, bottom);
        line(left, bottom + 30, right, bottom + 30);
        const text = (value: string, x: number, y: number, height: number, maxWidth: number) => tx.addEntity<TextEntity>({ ...props, type: 'text', text: value, position: { x, y }, height, style: doc.settings.currentTextStyle, rotation: 0, widthFactor: Math.min(1, maxWidth / Math.max(height * value.length, 1)), oblique: 0, halign: 'left', valign: 'baseline' });
        text(project.value.trim(), left + 4, bottom + 19, 4, right - left - 8);
        text(name, left + 4, bottom + 8, 3.5, available.width * 0.65);
        text(`${api.lang === 'es' ? 'Escala' : 'Scale'} ${scaleInput.value} · ${i + 1}/${frames.length}`, right - 95, bottom + 8, 3, 90);
        const width = f.width * scale!.scale, height = f.height * scale!.scale, center = { x: left + available.width / 2, y: bottom + 35 + available.height / 2 };
        tx.addEntity<ViewportEntity>({ ...props, type: 'viewport', center, width, height, viewCenter: f.center, scale: scale!.scale, viewTwist: 0, displayLocked: true, on: true, frozenLayers: [], layerOverrides: {} });
        return id;
      }));
      api.editor.setSpace(sheetIds[0], { cancelCommands: false });
      api.editor.zoomExtents();
      // Keep the title block clear of the floating command line and precision dock.
      api.editor.view.fit({minX:0,minY:0,maxX:paper.width,maxY:paper.height},100);api.editor.emit('view');
      api.info(L(`${sheetIds.length} hojas creadas. PUBLICAR permite descargar el PDF multipágina.`, `${sheetIds.length} sheets created. PUBLISH downloads a multi-page PDF.`));
    }
    finally {
      api.setPreview(null);
    }
  },
};
