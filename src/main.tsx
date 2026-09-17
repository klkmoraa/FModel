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
import { Persistence } from './storage/persistence';
import { App } from './ui/App';

registerAllCommands();

const doc = createDocument({ title: 'Sin título' });
const editor = new Editor(doc);
installDynamicBlocks(editor.ctx);
installDimensionAssociativity(doc, editor.ctx);

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

// exposición para depuración en consola
(globalThis as unknown as { fmodel: unknown }).fmodel = { editor, doc };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App editor={editor} />
  </StrictMode>,
);
