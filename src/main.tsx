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
import { Persistence } from './storage/persistence';
import { App } from './ui/App';
import { consumeLaunchQueue, registerServiceWorker } from './pwa/register';
import { queueLaunchedFile } from './commands/file';
import { setPendingUpdate } from './commands/utility';

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

const persistence = new Persistence(
  () => editor.doc,
  () => editor.fileName || editor.doc.settings.title,
);
persistence.start(editor.prefs.autosaveMinutes);
editor.on('prefs', () => persistence.start(editor.prefs.autosaveMinutes));

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
consumeLaunchQueue((file) => {
  queueLaunchedFile(file);
  editor.command('_OPENLAUNCHED');
});

// exposición para depuración en consola
(globalThis as unknown as { fmodel: unknown }).fmodel = { editor, doc };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App editor={editor} />
  </StrictMode>,
);
