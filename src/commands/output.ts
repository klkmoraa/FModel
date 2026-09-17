import { requestUi } from '../app/services';
import type { Id } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import type { PlotContext } from '../output/plot';
import { exportPdf, exportSvg } from '../output/plot';
import { prepareExportImages } from '../render/assets';
import { saveFile } from '../storage/fileAccess';
import { K, L } from './helpers';
import type { CommandApi, CommandDef } from './types';
import { CommandError } from './types';

function fileBase(api: CommandApi, sheet?: string): string {
  const base = (api.editor.fileName || api.editor.doc.settings.title || 'dibujo').replace(/\.[^.]+$/, '');
  const name = sheet ? `${base}-${sheet}` : base;
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'dibujo';
}

function sheetName(api: CommandApi, id: Id): string {
  const doc = api.editor.doc;
  return doc.data.layouts.get(id)?.name ?? (id === MODEL_SPACE_ID ? api.t(L('Modelo', 'Model')) : (doc.data.blocks.get(id)?.name ?? id));
}

export async function plotContext(api: CommandApi): Promise<PlotContext> {
  const editor = api.editor;
  return { doc: editor.doc, ctx: editor.ctx, index: editor.index, images: await prepareExportImages(editor.doc) };
}

function orderedLayouts(api: CommandApi): Id[] {
  return [...api.editor.doc.data.layouts.values()].sort((a, b) => a.tabOrder - b.tabOrder).map((l) => l.id);
}

export async function savePdf(api: CommandApi, sheets: Id[], label: string) {
  if (!sheets.length) throw new CommandError(L('No hay hojas que exportar.', 'There are no sheets to export.'));
  api.info(L(`Generando PDF vectorial (${sheets.length} hoja/s)…`, `Generating vector PDF (${sheets.length} sheet/s)…`));
  const { data, warnings } = await exportPdf(await plotContext(api), sheets);
  for (const w of warnings) api.warn(L(w, w));
  const handle = await saveFile(new Blob([data as BlobPart], { type: 'application/pdf' }), `${fileBase(api, label)}.pdf`, { 'application/pdf': ['.pdf'] }, 'PDF');
  api.info(L(`PDF exportado${handle ? `: ${handle.name}` : ''} (${Math.round(data.byteLength / 1024)} KB).`, `PDF exported${handle ? `: ${handle.name}` : ''} (${Math.round(data.byteLength / 1024)} KB).`));
}

export async function saveSvg(api: CommandApi, sheet: Id) {
  const { data, warnings } = exportSvg(await plotContext(api), sheet);
  for (const w of warnings) api.warn(L(w, w));
  const name = sheetName(api, sheet);
  const handle = await saveFile(new Blob([data], { type: 'image/svg+xml' }), `${fileBase(api, name)}.svg`, { 'image/svg+xml': ['.svg'] }, 'SVG');
  api.info(L(`SVG exportado${handle ? `: ${handle.name}` : ''}.`, `SVG exported${handle ? `: ${handle.name}` : ''}.`));
}

const EXPORTPDF: CommandDef = {
  name: 'EXPORTPDF',
  aliases: ['PDF', 'EXPORTARPDF'],
  category: 'output',
  readOnly: true,
  icon: 'pdf',
  label: L('Exportar PDF', 'Export PDF'),
  description: L('PDF vectorial de la hoja actual, de todas las presentaciones o del modelo, con la configuración de página de cada una.', 'Vector PDF of the current sheet, all layouts or model, using each page setup.'),
  async run(api, args) {
    const layouts = orderedLayouts(api);
    const kws = [K('Current', 'Actual', 'Current', ['a', 'c']), K('All', 'Todas las presentaciones', 'All layouts', ['t']), K('Model', 'Modelo', 'Model', ['m'])];
    const given = args?.[0] ? api.editor.runner.matchKeyword(args[0], kws) : null;
    const r = given ? { kind: 'keyword' as const, key: given } : await api.getKeyword({ prompt: L('¿Qué exportar?', 'What to export?'), keywords: kws, defaultValue: 'Current' });
    if (r.kind !== 'keyword') return;
    if (r.key === 'All') return savePdf(api, layouts, api.t(L('presentaciones', 'layouts')));
    const sheet = r.key === 'Model' ? MODEL_SPACE_ID : api.editor.space;
    return savePdf(api, [sheet], sheetName(api, sheet));
  },
};

const EXPORTSVG: CommandDef = {
  name: 'EXPORTSVG',
  aliases: ['SVG', 'EXPORTARSVG'],
  category: 'output',
  readOnly: true,
  icon: 'svg',
  label: L('Exportar SVG', 'Export SVG'),
  description: L('SVG en milímetros de la hoja actual con su configuración de página (arcos exactos, textos editables).', 'Millimetre SVG of the current sheet with its page setup (exact arcs, editable text).'),
  async run(api) {
    await saveSvg(api, api.editor.space);
  },
};

const PUBLISH: CommandDef = {
  name: 'PUBLISH',
  aliases: ['PUBLICAR'],
  category: 'output',
  readOnly: true,
  icon: 'publish',
  label: L('Publicar', 'Publish'),
  description: L('Publica varias presentaciones (y el modelo) en un único PDF multipágina.', 'Publishes several layouts (and model) to one multi-page PDF.'),
  async run(api, args) {
    // sin argumentos se eligen las hojas en el diálogo; con argumentos son ids de hoja
    if (!args?.length) return requestUi('publish');
    const doc = api.editor.doc;
    const sheets = args.filter((id) => id === MODEL_SPACE_ID || doc.data.layouts.has(id));
    await savePdf(api, sheets, sheets.length === 1 ? sheetName(api, sheets[0]) : api.t(L('publicación', 'publish')));
  },
};

const PLOT: CommandDef = {
  name: 'PLOT',
  aliases: ['TRAZAR', 'PRINT'],
  category: 'output',
  readOnly: true,
  icon: 'plot',
  label: L('Trazar', 'Plot'),
  description: L('Configura y traza la hoja actual a PDF o SVG con vista previa.', 'Sets up and plots the current sheet to PDF or SVG with preview.'),
  run() {
    requestUi('page-setup', { plot: true });
  },
};

const PAGESETUP: CommandDef = {
  name: 'PAGESETUP',
  aliases: ['CONFIGPAGINA', 'PAGE'],
  category: 'output',
  readOnly: true,
  icon: 'pagesetup',
  label: L('Configurar página', 'Page setup'),
  description: L('Tamaño y orientación del papel, márgenes, área y escala de trazado, grosores y estilo de color.', 'Paper size and orientation, margins, plot area and scale, lineweights and color style.'),
  run() {
    requestUi('page-setup', { plot: false });
  },
};

export const OUTPUT_COMMANDS: CommandDef[] = [EXPORTPDF, EXPORTSVG, PUBLISH, PLOT, PAGESETUP];
