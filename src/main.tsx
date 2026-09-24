import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setServices } from './app/services';
import { installDimensionAssociativity } from './annotation/assoc';
import { installDynamicBlocks } from './blocks/install';
import { registerAllCommands } from './commands';
import { createDocument } from './document/defaults';
import { Editor } from './editor/editor';
import { PdfGeometryCache } from './render/pdfGeometry';
import { Persistence, type PersistenceHealthStatus } from './storage/persistence';
import { App } from './ui/App';
import { consumeLaunchQueue, registerServiceWorker } from './pwa/register';
import { queueLaunchedFile } from './commands/file';
import { setPendingUpdate } from './commands/utility';
import { fromNativeFile, readPackage, writePackage } from './io/native';
import { createClipboardPackage, parseClipboardPackage, pasteClipboardPackage } from './io/clipboard';
import { importDxfIntoDocument } from './io/dxf/importDxf';
import { exportSvg } from './output/plot';

registerAllCommands();

const doc = createDocument({ title: 'Sin título' });
const editor = new Editor(doc);
installDynamicBlocks(editor.ctx);
installDimensionAssociativity(doc, editor.ctx);
// geometría vectorial de calcos PDF para las referencias a objetos (se extrae en segundo plano)
const pdfGeometry = new PdfGeometryCache(
  () => editor.doc,
  () => editor.emit('overlay'),
);
editor.ctx.pdfGeometry = (assetId, page) => pdfGeometry.get(assetId, page);
editor.doc.subscribe((event) => {
  if (event.source === 'load' || event.changes.some((change) => change.coll === 'assets')) pdfGeometry.clear();
});

const persistence = new Persistence(
  () => editor.doc,
  () => editor.fileName || editor.doc.settings.title,
);
persistence.start(editor.prefs.autosaveMinutes);
editor.on('prefs', () => persistence.start(editor.prefs.autosaveMinutes));

let previousHealthStatus: PersistenceHealthStatus = 'protected';
persistence.onHealthChange((health) => {
  if (health.status === previousHealthStatus) return;
  const prev = previousHealthStatus;
  previousHealthStatus = health.status;
  if (health.status === 'degraded' || health.status === 'unavailable') {
    const isQuota = health.lastError?.kind === 'quota';
    editor.runner.message('warn', {
      es: isQuota
        ? 'Almacenamiento local agotado (cuota excedida). Tu dibujo no se guardará automáticamente hasta liberar espacio o guardarlo en archivo.'
        : 'Almacenamiento local degradado o no disponible. Los cambios no se guardan automáticamente.',
      en: isQuota
        ? 'Local storage full (quota exceeded). Your drawing will not autosave until space is freed or saved to a file.'
        : 'Local storage degraded or unavailable. Changes are not autosaved.',
    });
  } else if (prev !== 'protected' && health.status === 'protected') {
    editor.runner.message('info', {
      es: 'Almacenamiento local restablecido: el autoguardado vuelve a estar activo.',
      en: 'Local storage restored: autosave is active again.',
    });
  }
});

setServices({
  editor,
  persistence,
  fileHandle: null,
  openUi: (ui) => window.dispatchEvent(new CustomEvent('fmodel:ui', { detail: { ui } })),
  toast: (kind, text) => editor.runner.message(kind, text),
});

registerServiceWorker((apply) => {
  editor.runner.message('info', { es: 'Hay una versión nueva de FModel lista. Guarda tu trabajo y escribe ACTUALIZAR para aplicarla.', en: 'A new FModel version is ready. Save your work and type UPDATEAPP to apply it.' });
  setPendingUpdate(apply);
});
// exposición para depuración en consola y pruebas E2E
(globalThis as unknown as { fmodel: unknown }).fmodel = {
  editor,
  doc,
  persistence,
  createDocument,
  setPendingUpdate,
  io: {
    writePackage,
    readPackage,
    createClipboardPackage,
    parseClipboardPackage,
    pasteClipboardPackage,
    importDxfIntoDocument,
    exportDxf: async () => {
      const { exportDxf } = await import('./io/dxf/exportDxf');
      return exportDxf(editor.doc, editor.ctx);
    },
    exportSvg: async (spaceId: string) => {
      return exportSvg({ doc: editor.doc, ctx: editor.ctx, index: editor.index }, spaceId);
    },
  },
};

/** Reabre el dibujo de la sesión anterior (recargar la página no debe perder el trabajo). */
async function restoreSession() {
  const rec = await persistence.loadSession();
  if (!rec) return;
  try {
    const res = fromNativeFile(rec.file);
    editor.doc.replaceData(res.data, res.documentId);
    editor.fileName = rec.name;
    editor.doc.dirty = rec.dirty;
    editor.zoomExtents();
  } catch (err) {
    console.warn('session restore', err);
  }
}

void restoreSession().finally(() => {
  // a partir de aquí cada cambio (dibujar, abrir, nuevo) actualiza la sesión guardada
  editor.doc.subscribe(() => persistence.scheduleSession());
  window.addEventListener('pagehide', () => void persistence.flushSession());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persistence.flushSession();
  });
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App editor={editor} />
    </StrictMode>,
  );
  // File Handling puede entregar el archivo inmediatamente al registrar el consumidor.
  // Se activa al final para que una recuperación tardía nunca reemplace el archivo recibido.
  consumeLaunchQueue((file) => {
    queueLaunchedFile(file);
    editor.command('_OPENLAUNCHED');
  }, (error) => {
    const detail = error instanceof Error ? error.message : String(error);
    editor.runner.message('error', { es: `No se pudo abrir el archivo recibido: ${detail}`, en: `Could not open the received file: ${detail}` });
  });
});
