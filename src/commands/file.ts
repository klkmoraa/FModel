import { getServices, requestUi } from '../app/services';
import { createDocumentData } from '../document/defaults';
import { fromNativeFile, readPackage, writeDebugJson, writePackage } from '../io/native';
import { downloadBlob, openFile, saveFile } from '../storage/fileAccess';
import { classifyStorageError, createDrawingSnapshot, type RecoveryRecord } from '../storage/persistence';
import { K, L } from './helpers';
import type { CommandApi, CommandDef } from './types';
import { decodeDxfBytes, importDxfIntoDocument } from '../io/dxf/importDxf';
import { assertInputBytes } from '../io/limits';
import { taskManager } from '../app/tasks';
import { runHeavy } from '../workers/client';

const FMODEL_ACCEPT = { 'application/x-fmodel': ['.fmodel'], 'application/json': ['.json'] };
const latestSave = new WeakMap<object, symbol>();

export async function confirmDiscard(api: CommandApi): Promise<boolean> {
  if (!api.editor.doc.dirty) return true;
  const r = await api.getKeyword({
    prompt: L('Hay cambios sin guardar. ¿Descartarlos?', 'There are unsaved changes. Discard them?'),
    keywords: [K('Yes', 'Sí, descartar', 'Yes, discard', ['s', 'y']), K('No', 'No', 'No', ['n'])],
    defaultValue: 'No',
  });
  return r.kind === 'keyword' && r.key === 'Yes';
}

export function fileBaseName(name: string): string {
  return name.replace(/\.(fmodel(\.json)?|json|dxf|dwg)$/i, '');
}

const NEW: CommandDef = {
  name: 'NEW',
  aliases: ['QNEW', 'NUEVO'],
  category: 'file',
  readOnly: true,
  label: L('Nuevo dibujo', 'New drawing'),
  description: L('Crea un dibujo vacío en milímetros (pide confirmación si hay cambios).', 'Creates an empty drawing in millimeters (asks before discarding changes).'),
  async run(api) {
    if (!(await confirmDiscard(api))) return;
    const units = await api.getKeyword({ prompt: L('Unidades del dibujo', 'Drawing units'), keywords: ['mm', 'cm', 'm', 'in', 'ft'].map((u) => K(u, u, u)), defaultValue: 'mm' });
    const data = createDocumentData({ units: units.kind === 'keyword' ? (units.key as 'mm') : 'mm', title: api.t(L('Sin título', 'Untitled')) });
    api.editor.doc.replaceData(data);
    api.editor.fileName = '';
    api.editor.ctx.fileName = '';
    getServices().fileHandle = null;
    api.editor.emit('doc');
  },
};

export async function openBytes(api: CommandApi, name: string, bytes: Uint8Array): Promise<boolean> {
  if (api.signal?.aborted) return false;
  assertInputBytes(bytes);
  const lower = name.toLowerCase();
  if (lower.endsWith('.dxf')) {
    api.info(L('Leyendo DXF en segundo plano…', 'Reading DXF in the background…'));
    try {
      const { data, report } = await taskManager.runTask(
        'open-dxf',
        { es: `Leyendo DXF: ${name}`, en: `Reading DXF: ${name}` },
        async (ctx) => runHeavy('readDxf', { text: decodeDxfBytes(bytes) }, { signal: ctx.signal }),
        { signal: api.signal },
      );
      api.editor.doc.replaceData(data);
      api.editor.fileName = fileBaseName(name);
      api.info(L(report.summary.es, report.summary.en));
      requestUi('conversion-report', { kind: 'import', name, report });
      api.editor.zoomExtents();
    } catch (err) {
      if ((err instanceof DOMException && err.name === 'AbortError') || (err instanceof Error && err.name === 'AbortError')) {
        api.warn(L('Apertura cancelada.', 'Open cancelled.'));
        return false;
      }
      throw err;
    }
    return true;
  }
  if (lower.endsWith('.dwg')) {
    api.info(L('Leyendo DWG con LibreDWG en segundo plano (la primera vez descarga el lector, ~10 MB)…', 'Reading DWG with LibreDWG in the background (first use downloads the reader, ~10 MB)…'));
    try {
      const { data, report } = await taskManager.runTask(
        'open-dwg',
        { es: `Leyendo DWG: ${name}`, en: `Reading DWG: ${name}` },
        // La siguiente apertura debe poder reutilizar los bytes originales.
        async (ctx) => runHeavy('readDwg', { bytes }, { signal: ctx.signal }),
        { signal: api.signal },
      );
      api.editor.doc.replaceData(data);
      api.editor.fileName = fileBaseName(name);
      api.info(L(report.summary.es, report.summary.en));
      requestUi('conversion-report', { kind: 'import', name, report });
      api.editor.zoomExtents();
    } catch (err) {
      if ((err instanceof DOMException && err.name === 'AbortError') || (err instanceof Error && err.name === 'AbortError')) {
        api.warn(L('Apertura cancelada.', 'Open cancelled.'));
        return false;
      }
      throw err;
    }
    return true;
  }
  const res = readPackage(bytes);
  api.editor.doc.replaceData(res.data, res.documentId);
  api.editor.fileName = fileBaseName(name);
  api.editor.ctx.fileName = name;
  for (const w of res.warnings) api.warn(L(w, w));
  api.editor.zoomExtents();
  api.info(L(`Abierto «${name}»: ${res.data.entities.size} objetos.`, `Opened "${name}": ${res.data.entities.size} objects.`));
  return true;
}

const OPEN: CommandDef = {
  name: 'OPEN',
  aliases: ['ABRIR'],
  category: 'file',
  readOnly: true,
  label: L('Abrir', 'Open'),
  description: L('Abre un dibujo .fmodel, JSON de FModel, DXF o DWG (lectura experimental).', 'Opens a .fmodel drawing, FModel JSON, DXF or DWG (experimental reading).'),
  async run(api) {
    if (!(await confirmDiscard(api))) return;
    const f = await openFile({ ...FMODEL_ACCEPT, 'application/dxf': ['.dxf'], 'application/acad': ['.dwg'] }, 'FModel / DXF / DWG');
    if (!f) return;
    const opened = await openBytes(api, f.name, f.bytes);
    if (opened) getServices().fileHandle = f.name.toLowerCase().endsWith('.fmodel') ? (f.handle ?? null) : null;
  },
};

async function save(api: CommandApi, as: boolean) {
  const s = getServices();
  const doc = api.editor.doc;
  const saveToken = Symbol('save');
  latestSave.set(doc, saveToken);
  const data = doc.data;
  const documentId = doc.id;
  const documentVersion = doc.version;
  const base = fileBaseName(api.editor.fileName || doc.settings.title || 'dibujo');
  const name = `${base}.fmodel`;
  const previousName = api.editor.fileName || name;
  const bytes = writePackage(data, documentId);
  const snapshot = createDrawingSnapshot(doc, bytes);
  let result: Awaited<ReturnType<typeof saveFile>>;
  try {
    result = await saveFile(new Blob([bytes as BlobPart], { type: 'application/x-fmodel' }), name, { 'application/x-fmodel': ['.fmodel'] }, 'FModel 2D CAD', as ? null : s.fileHandle);
  } catch (err) {
    if (latestSave.get(doc) === saveToken) latestSave.delete(doc);
    throw err;
  }
  if (result.kind === 'cancelled') {
    if (latestSave.get(doc) === saveToken) latestSave.delete(doc);
    return;
  }
  const handle = result.kind === 'saved-to-handle' ? result.handle : null;
  const isLatestSave = latestSave.get(doc) === saveToken && !api.signal?.aborted;
  if (isLatestSave) latestSave.delete(doc);
  const sameDrawing = isLatestSave && api.editor.doc === doc && doc.data === data && doc.id === documentId;
  const savedCurrentVersion = sameDrawing && doc.version === documentVersion;
  if (sameDrawing) {
    if (handle) {
      s.fileHandle = handle;
      api.editor.fileName = fileBaseName(handle.name);
      api.editor.ctx.fileName = handle.name;
    } else if (as) {
      s.fileHandle = null;
    }
    if (savedCurrentVersion) doc.dirty = false;
  }
  let localSaveError: ReturnType<typeof classifyStorageError> | null = null;
  try {
    await s.persistence.storeDrawingAndVersion(
      handle ? fileBaseName(handle.name) : previousName,
      api.t(L('Guardado manual', 'Manual save')),
      snapshot,
    );
  } catch (err) {
    localSaveError = classifyStorageError(err);
  }
  await s.persistence.markCleanExit().catch(() => undefined);
  if (sameDrawing) api.editor.emit('doc');
  const destinationEs = handle ? `en «${handle.name}»` : 'como descarga';
  const destinationEn = handle ? `to "${handle.name}"` : 'as download';
  const size = (bytes.length / 1024).toFixed(1);
  const mainMsg = !sameDrawing
    ? L(`Se guardó el dibujo anterior ${destinationEs} (${size} KB); el dibujo actual no cambió.`, `The previous drawing was saved ${destinationEn} (${size} KB); the current drawing was not changed.`)
    : !savedCurrentVersion
      ? L(`Guardado ${destinationEs} (${size} KB); los cambios posteriores siguen sin guardar.`, `Saved ${destinationEn} (${size} KB); later changes remain unsaved.`)
      : L(`Guardado ${destinationEs} (${size} KB).`, `Saved ${destinationEn} (${size} KB).`);
  api.info(mainMsg);
  if (localSaveError) {
    const reasonText =
      localSaveError.kind === 'quota'
        ? L('espacio insuficiente en el navegador', 'insufficient browser storage')
        : L('almacenamiento local no disponible', 'local storage unavailable');
    const warnMsg = L(
      `Advertencia: no se pudo actualizar la copia local (${api.t(reasonText)}).`,
      `Warning: could not update local copy (${api.t(reasonText)}).`,
    );
    if (typeof api.warn === 'function') {
      api.warn(warnMsg);
    }
  }
}

const QSAVE: CommandDef = {
  name: 'QSAVE',
  aliases: ['SAVE', 'GUARDAR', 'GR'],
  category: 'file',
  readOnly: true,
  label: L('Guardar', 'Save'),
  description: L('Guarda el dibujo como paquete portable .fmodel (y una versión local).', 'Saves the drawing as a portable .fmodel package (plus a local version).'),
  run: (api) => save(api, false),
};

const SAVEAS: CommandDef = {
  name: 'SAVEAS',
  aliases: ['GUARDARCOMO'],
  category: 'file',
  readOnly: true,
  label: L('Guardar como', 'Save as'),
  description: L('Guarda con otro nombre o ubicación.', 'Saves with another name or location.'),
  run: (api) => save(api, true),
};

const EXPORTJSON: CommandDef = {
  name: 'EXPORTJSON',
  aliases: ['JSONOUT'],
  category: 'file',
  readOnly: true,
  label: L('Exportar JSON de depuración', 'Export debug JSON'),
  description: L('Descarga el documento completo como JSON legible (con recursos embebidos).', 'Downloads the whole document as readable JSON (with embedded assets).'),
  run(api) {
    const json = writeDebugJson(api.editor.doc.data, api.editor.doc.id);
    downloadBlob(new Blob([json], { type: 'application/json' }), `${api.editor.fileName || 'dibujo'}.fmodel.json`);
  },
};

const VERSIONS: CommandDef = {
  name: 'VERSIONS',
  aliases: ['HISTORIAL', 'VERSION'],
  category: 'file',
  readOnly: true,
  ui: 'versions',
  label: L('Historial de versiones', 'Version history'),
  description: L('Guarda, restaura, compara y elimina versiones locales del dibujo.', 'Saves, restores, compares and deletes local versions of the drawing.'),
  run() {},
};

const RECOVER: CommandDef = {
  name: 'RECOVER',
  aliases: ['DRAWINGRECOVERY', 'RECUPERAR'],
  category: 'file',
  readOnly: true,
  label: L('Recuperar dibujo', 'Recover drawing'),
  description: L('Restaura el último autoguardado tras un cierre inesperado.', 'Restores the last autosave after an unexpected exit.'),
  async run(api) {
    let rec: RecoveryRecord | null = null;
    try {
      rec = await getServices().persistence.pendingRecovery();
    } catch (err) {
      const classified = classifyStorageError(err);
      const reason =
        classified.kind === 'quota'
          ? L('cuota de almacenamiento excedida', 'storage quota exceeded')
          : L('almacenamiento no disponible', 'storage unavailable');
      api.warn(
        L(
          `Error al acceder al borrador de recuperación (${api.t(reason)}).`,
          `Error accessing recovery draft (${api.t(reason)}).`,
        ),
      );
      return;
    }
    if (api.signal.aborted) return;
    if (!rec) {
      api.info(L('No hay borradores pendientes de recuperar.', 'No drafts pending recovery.'));
      return;
    }
    if (!(await confirmDiscard(api))) return;
    if (api.signal.aborted) return;
    const res = fromNativeFile(rec.file);
    api.editor.doc.replaceData(res.data, res.documentId);
    api.editor.fileName = rec.name;
    api.editor.ctx.fileName = rec.name;
    getServices().fileHandle = null;
    api.editor.doc.dirty = true;
    api.editor.zoomExtents();
    api.info(L(`Recuperado el autoguardado del ${new Date(rec.savedAt).toLocaleString()}.`, `Recovered autosave from ${new Date(rec.savedAt).toLocaleString()}.`));
  },
};

const IMPORTDXF: CommandDef = {
  name: 'IMPORTDXF',
  aliases: ['DXFIN', 'IMPORTARDXF'],
  category: 'file',
  label: L('Importar DXF', 'Import DXF'),
  description: L('Inserta un DXF en el dibujo actual (capas, estilos y bloques se fusionan por nombre) y muestra el informe de conversión.', 'Inserts a DXF into the current drawing (layers, styles and blocks merge by name) and shows the conversion report.'),
  async run(api) {
    const f = await openFile({ 'application/dxf': ['.dxf'] }, 'DXF');
    if (!f || api.signal.aborted) return;
    const report = importDxfIntoDocument(api.editor.doc, decodeDxfBytes(f.bytes), { owner: api.editor.inputOwner });
    api.info(L(report.summary.es, report.summary.en));
    requestUi('conversion-report', { kind: 'import', name: f.name, report });
    api.editor.zoomExtents();
  },
};

const EXPORTDXF: CommandDef = {
  name: 'EXPORTDXF',
  aliases: ['DXFOUT', 'EXPORTARDXF'],
  category: 'file',
  readOnly: true,
  label: L('Exportar DXF', 'Export DXF'),
  description: L('Guarda el dibujo como DXF R2010 (UTF-8) con capas, bloques, presentaciones y viewports; muestra qué se conservó, qué se convirtió y qué se omitió.', 'Saves the drawing as DXF R2010 (UTF-8) with layers, blocks, layouts and viewports; reports what was kept, converted or skipped.'),
  async run(api) {
    const { exportSummary } = await import('../io/dxf/exportDxf');
    api.info(L('Generando DXF en segundo plano…', 'Generating DXF in the background…'));
    let text = '';
    let report: any = null;
    try {
      const res = await taskManager.runTask(
        'export-dxf',
        { es: 'Exportando DXF', en: 'Exporting DXF' },
        async (ctx) => runHeavy('exportDxf', { data: api.editor.doc.data }, { signal: ctx.signal }),
        { signal: api.signal },
      );
      text = res.text;
      report = res.report;
    } catch (err) {
      if ((err instanceof DOMException && err.name === 'AbortError') || (err instanceof Error && err.name === 'AbortError')) {
        api.warn(L('Exportación cancelada.', 'Export cancelled.'));
        return;
      }
      throw err;
    }
    const base = fileBaseName(api.editor.fileName || api.editor.doc.settings.title || 'dibujo');
    const name = `${base}.dxf`;
    const result = await saveFile(new Blob([text], { type: 'application/dxf' }), name, { 'application/dxf': ['.dxf'] }, 'DXF');
    if (result.kind === 'cancelled') return;
    const handle = result.kind === 'saved-to-handle' ? result.handle : null;
    const summary = exportSummary(report);
    api.info(L(`${summary.es}${handle ? ` → ${handle.name}` : ''}`, `${summary.en}${handle ? ` → ${handle.name}` : ''}`));
    requestUi('conversion-report', { kind: 'export', name: handle?.name ?? name, report });
  },
};

/** Archivos entregados por el sistema operativo (aplicación instalada: «Abrir con FModel»). */
const launchQueue: { name: string; bytes: Uint8Array; handle?: unknown }[] = [];

export function queueLaunchedFile(file: { name: string; bytes: Uint8Array; handle?: unknown }) {
  assertInputBytes(file.bytes, file.name);
  launchQueue.push(file);
}

const OPENLAUNCHED: CommandDef = {
  name: '_OPENLAUNCHED',
  aliases: [],
  category: 'file',
  readOnly: true,
  label: L('Abrir archivo recibido', 'Open received file'),
  description: L('Abre el archivo con el que se lanzó la aplicación instalada.', 'Opens the file the installed app was launched with.'),
  async run(api) {
    const f = launchQueue.shift();
    if (!f) return;
    if (!(await confirmDiscard(api))) return;
    const opened = await openBytes(api, f.name, f.bytes);
    if (opened) getServices().fileHandle = f.name.toLowerCase().endsWith('.fmodel') ? ((f.handle as never) ?? null) : null;
  },
};

const HOME: CommandDef = {
  name: 'HOME',
  aliases: ['INICIO', 'BIENVENIDA', 'START'],
  category: 'file',
  readOnly: true,
  label: L('Pantalla de inicio', 'Home screen'),
  description: L('Abre la pantalla de bienvenida y proyectos recientes.', 'Opens the welcome screen and recent projects.'),
  async run() {
    requestUi('welcome');
  },
};

export const FILE_COMMANDS: CommandDef[] = [NEW, OPEN, QSAVE, SAVEAS, EXPORTJSON, VERSIONS, RECOVER, IMPORTDXF, EXPORTDXF, OPENLAUNCHED, HOME];
