import type { Vec2 } from '../../geometry/vec';
import type {
  MLeaderEntity,
  MTextAttachment,
  MTextEntity,
  TableEntity,
  TextEntity,
} from '../../document/types';
import { add as addEntity, K, L, make } from '../helpers';
import type { CommandDef } from '../types';

// ============================================================================ TEXT

export const TEXT: CommandDef = {
  name: 'TEXT',
  aliases: ['DT', 'DTEXT', 'TEXTO'],
  category: 'annotate',
  label: L('Texto de una línea', 'Single-line text'),
  description: L('Crea textos de una línea con justificación, altura y rotación; Intro crea la línea siguiente.', 'Creates single-line text with justification, height and rotation; Enter starts the next line.'),
  icon: 'text',
  async run(api) {
    const s = api.editor.doc.settings;
    let halign: TextEntity['halign'] = 'left';
    let valign: TextEntity['valign'] = 'baseline';
    let start: Vec2 | null = null;
    while (!start) {
      const r = await api.getPoint({ prompt: L('Precise el punto inicial del texto', 'Specify start point of text'), keywords: [K('Justify', 'Justificar', 'Justify', ['j']), K('Style', 'Estilo', 'Style', ['e', 's'])] });
      if (r.kind === 'point') start = r.p;
      else if (r.kind === 'keyword' && r.key === 'Justify') {
        const j = await api.getKeyword({
          prompt: L('Opción de justificación', 'Justification option'),
          keywords: [K('Left', 'Izquierda', 'Left', ['iz', 'l']), K('Center', 'Centro', 'Center', ['c']), K('Right', 'Derecha', 'Right', ['d', 'r']), K('Middle', 'Medio', 'Middle', ['m']), K('TL', 'SI', 'TL', ['si', 'tl']), K('TC', 'SC', 'TC', ['sc', 'tc']), K('TR', 'SD', 'TR', ['sd', 'tr']), K('ML', 'MI', 'ML', ['mi', 'ml']), K('MC', 'MC', 'MC'), K('MR', 'MD', 'MR', ['md', 'mr']), K('BL', 'II', 'BL', ['ii', 'bl']), K('BC', 'IC', 'BC', ['ic', 'bc']), K('BR', 'ID', 'BR', ['id', 'br'])],
        });
        if (j.kind !== 'keyword') continue;
        const map: Record<string, [TextEntity['halign'], TextEntity['valign']]> = { Left: ['left', 'baseline'], Center: ['center', 'baseline'], Right: ['right', 'baseline'], Middle: ['middle', 'middle'], TL: ['left', 'top'], TC: ['center', 'top'], TR: ['right', 'top'], ML: ['left', 'middle'], MC: ['center', 'middle'], MR: ['right', 'middle'], BL: ['left', 'bottom'], BC: ['center', 'bottom'], BR: ['right', 'bottom'] };
        [halign, valign] = map[j.key];
      } else if (r.kind === 'keyword') {
        const st = await api.getString({ prompt: L('Nombre del estilo de texto', 'Enter style name'), defaultValue: api.editor.doc.data.textStyles.get(s.currentTextStyle)?.name });
        if (st.kind === 'string') {
          const found = api.editor.doc.findByName('textStyles', st.value);
          if (found) api.apply('TEXTSTYLE', (tx) => tx.setSettings({ currentTextStyle: found.id }));
          else api.warn(L(`No existe el estilo «${st.value}».`, `Style "${st.value}" not found.`));
        }
      } else return;
    }
    const style = api.editor.doc.data.textStyles.get(s.currentTextStyle);
    let height = style && style.height > 0 ? style.height : s.textHeight;
    const annot = style?.annotative ? 1 / (api.editor.ctx.annotationScale || 1) : 1;
    if (!style || style.height <= 0) {
      const h = await api.getDistance({ prompt: L('Precise la altura', 'Specify height'), base: start, defaultValue: s.textHeight });
      if (h.kind === 'value') height = h.value;
      else if (h.kind !== 'none') return;
      if (height !== s.textHeight) api.apply('TEXTSIZE', (tx) => tx.setSettings({ textHeight: height }));
    }
    const rot = await api.getAngle({ prompt: L('Precise el ángulo de rotación del texto', 'Specify rotation angle of text'), base: start, defaultValue: 0 });
    const rotation = rot.kind === 'value' ? rot.value : 0;
    let pos = start;
    for (;;) {
      const t = await api.getString({ prompt: L('Escriba el texto (Intro vacío termina)', 'Enter text (empty Enter ends)'), allowSpaces: true, allowNone: true });
      if (t.kind !== 'string' || !t.value) return;
      addEntity<TextEntity>(api, 'TEXT', { type: 'text', position: pos, text: t.value, height: height * annot, rotation, widthFactor: style?.widthFactor ?? 1, oblique: style?.oblique ?? 0, style: s.currentTextStyle, halign, valign, annotative: style?.annotative || undefined });
      pos = { x: pos.x + Math.sin(rotation) * height * annot * (5 / 3), y: pos.y - Math.cos(rotation) * height * annot * (5 / 3) };
    }
  },
};

// ============================================================================ MTEXT

export const MTEXT: CommandDef = {
  name: 'MTEXT',
  aliases: ['T', 'MT', 'TEXTOM'],
  category: 'annotate',
  label: L('Texto de líneas múltiples', 'Multiline text'),
  description: L('Crea un párrafo de texto con ancho de ajuste, justificación y formato básico.', 'Creates a paragraph of text with wrap width, justification and basic formatting.'),
  icon: 'mtext',
  async run(api) {
    const s = api.editor.doc.settings;
    const style = api.editor.doc.data.textStyles.get(s.currentTextStyle);
    const annot = style?.annotative ? 1 / (api.editor.ctx.annotationScale || 1) : 1;
    let height = (style && style.height > 0 ? style.height : s.textHeight) * annot;
    let attachment: MTextAttachment = 1;
    let rotation = 0;
    const a = await api.getPoint({ prompt: L('Precise la primera esquina', 'Specify first corner') });
    if (a.kind !== 'point') return;
    let width = 0;
    for (;;) {
      const b = await api.getPoint({
        prompt: L('Precise la esquina opuesta', 'Specify opposite corner'),
        base: a.p,
        rubber: 'rect',
        keywords: [K('Height', 'Altura', 'Height', ['a', 'h']), K('Justify', 'Justificar', 'Justify', ['j']), K('Rotation', 'Rotación', 'Rotation', ['r']), K('Width', 'Anchura', 'Width', ['n', 'w'])],
      });
      if (b.kind === 'point') {
        width = Math.abs(b.p.x - a.p.x);
        break;
      }
      if (b.kind !== 'keyword') return;
      if (b.key === 'Height') {
        const h = await api.getDistance({ prompt: L('Precise la altura', 'Specify height'), defaultValue: height });
        if (h.kind === 'value') height = h.value;
      } else if (b.key === 'Rotation') {
        const r = await api.getAngle({ prompt: L('Precise el ángulo de rotación', 'Specify rotation angle'), defaultValue: rotation });
        if (r.kind === 'value') rotation = r.value;
      } else if (b.key === 'Width') {
        const w = await api.getDistance({ prompt: L('Precise la anchura', 'Specify width'), base: a.p, allowZero: true });
        if (w.kind === 'value') {
          width = w.value;
          break;
        }
      } else {
        const j = await api.getKeyword({ prompt: L('Justificación', 'Justification'), keywords: ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'].map((k) => K(k, k, k)) });
        if (j.kind === 'keyword') attachment = (['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'].indexOf(j.key) + 1) as MTextAttachment;
      }
    }
    const text = await api.getString({ prompt: L('Escriba el texto (use \\P para párrafo)', 'Enter text (use \\P for paragraph)'), allowSpaces: true, multiline: true });
    if (text.kind !== 'string' || !text.value.trim()) return;
    addEntity<MTextEntity>(api, 'MTEXT', { type: 'mtext', position: a.p, width, height, rotation, style: s.currentTextStyle, attachment, lineSpacing: 1, contents: text.value.replace(/\r?\n/g, '\\P'), annotative: style?.annotative || undefined });
  },
};

// ============================================================================ MLEADER

export const MLEADER: CommandDef = {
  name: 'MLEADER',
  aliases: ['MLD', 'DIRECTRIZM'],
  category: 'annotate',
  label: L('Directriz múltiple', 'Multileader'),
  description: L('Crea una directriz múltiple con punta de flecha, rellano y texto.', 'Creates a multileader with arrowhead, landing and text.'),
  icon: 'mleader',
  async run(api) {
    const s = api.editor.doc.settings;
    const style = api.editor.doc.data.mleaderStyles.get(s.currentMLeaderStyle)!;
    const S = style.annotative ? 1 / (api.editor.ctx.annotationScale || 1) : style.overallScale || 1;
    const arrow = await api.getPoint({ prompt: L('Precise la ubicación de la punta de flecha', 'Specify leader arrowhead location') });
    if (arrow.kind !== 'point') return;
    const verts: Vec2[] = [arrow.p];
    let landing: Vec2 | null = null;
    while (!landing) {
      const r = await api.getPoint({
        prompt: L(verts.length > 1 ? 'Precise el punto siguiente o Intro para el rellano' : 'Precise la ubicación del rellano', verts.length > 1 ? 'Specify next point or Enter for landing' : 'Specify leader landing location'),
        base: verts[verts.length - 1],
        rubber: 'line',
        allowNone: verts.length > 1,
        preview: (p) => ({
          entities: [make<MLeaderEntity>(api, { type: 'mleader', style: style.id, leaders: [{ vertices: [...verts] }], landing: p, doglegLength: style.doglegLength * S, direction: p.x >= verts[verts.length - 1].x ? 1 : -1, content: { type: 'none' } })],
        }),
      });
      if (r.kind === 'point') {
        if (verts.length + 1 >= Math.max(2, style.maxLeaderPoints)) landing = r.p;
        else verts.push(r.p);
      } else if (r.kind === 'none') landing = verts.pop()!;
      else return;
    }
    const direction: 1 | -1 = landing.x >= verts[verts.length - 1].x ? 1 : -1;
    const text = await api.getString({ prompt: L('Escriba el texto de la directriz', 'Enter leader text'), allowSpaces: true, multiline: true, allowNone: true });
    const content = text.kind === 'string' && text.value ? { type: 'mtext' as const, text: text.value.replace(/\r?\n/g, '\\P'), height: style.textHeight * (style.annotative ? 1 : S), attachment: 4 as MTextAttachment, width: 0, frame: style.textFrame } : { type: 'none' as const };
    addEntity<MLeaderEntity>(api, 'MLEADER', { type: 'mleader', style: style.id, leaders: [{ vertices: verts }], landing, doglegLength: style.doglegLength * S, direction, content, annotative: style.annotative || undefined });
  },
};

// ============================================================================ TABLE

export const TABLE: CommandDef = {
  name: 'TABLE',
  aliases: ['TB', 'TABLA'],
  category: 'annotate',
  label: L('Tabla', 'Table'),
  description: L('Inserta una tabla con filas, columnas, título y encabezado según el estilo de tabla.', 'Inserts a table with rows, columns, title and header per table style.'),
  icon: 'table',
  async run(api) {
    const cols = await api.getNumber({ prompt: L('Número de columnas', 'Number of columns'), integer: true, min: 1, max: 200, defaultValue: 4 });
    if (cols.kind !== 'value') return;
    const rows = await api.getNumber({ prompt: L('Número de filas de datos', 'Number of data rows'), integer: true, min: 1, max: 2000, defaultValue: 4 });
    if (rows.kind !== 'value') return;
    const s = api.editor.doc.settings;
    const style = api.editor.doc.data.tableStyles.get(s.currentTableStyle)!;
    const colW = style.data.textHeight * 10;
    const rowH = (h: number) => h * 1.8 + style.cellMargin * 2;
    const nRows = rows.value + 2;
    const rowHeights = [rowH(style.title.textHeight), rowH(style.header.textHeight), ...Array.from({ length: rows.value }, () => rowH(style.data.textHeight))];
    const cells = Array.from({ length: nRows }, (_, r) =>
      Array.from({ length: cols.value }, (_, c) => (r === 0 ? (c === 0 ? { text: api.t(L('Título', 'Title')), colSpan: cols.value } : { text: '', merged: true }) : r === 1 ? { text: `${api.t(L('Encabezado', 'Header'))} ${c + 1}` } : { text: '' })),
    );
    const build = (p: Vec2) => make<TableEntity>(api, { type: 'table', position: p, rotation: 0, style: style.id, rowHeights, columnWidths: Array.from({ length: cols.value }, () => colW), cells, titleRow: true, headerRow: true });
    const ins = await api.getPoint({ prompt: L('Precise el punto de inserción (esquina superior izquierda)', 'Specify insertion point (top-left corner)'), preview: (p) => ({ entities: [build(p)] }) });
    if (ins.kind !== 'point') return;
    const t = build(ins.p);
    addEntity<TableEntity>(api, 'TABLE', { ...t, id: undefined, order: undefined } as never);
  },
};

export const ANNOTATION_COMMANDS: CommandDef[] = [TEXT, MTEXT, MLEADER, TABLE];
