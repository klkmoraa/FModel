import { describe, expect, it } from 'vitest';
import { createDocument } from '../document/defaults';
import { MODEL_SPACE_ID } from '../document/types';
import { Editor } from './editor';

describe('cambio de dibujo', () => {
  it('descarta el estado que pertenece al dibujo anterior', () => {
    const editor = new Editor(createDocument());
    editor.blockEdit = { blockId: 'bloque-anterior', previousSpace: MODEL_SPACE_ID, testing: null };
    editor.blockEditState.currentVisibility = 'estado-anterior';
    editor.activeViewportId = 'viewport-anterior';
    editor.lastCreated = 'entidad-anterior';
    editor.compare = {
      diff: { added: [], removed: [], modified: [], records: {}, settingsChanged: false },
      label: 'comparación anterior',
    };

    editor.doc.replaceData(createDocument().data);

    expect(editor.blockEdit).toBeNull();
    expect(editor.blockEditState.currentVisibility).toBeNull();
    expect(editor.activeViewportId).toBeNull();
    expect(editor.lastCreated).toBeNull();
    expect(editor.compare).toBeNull();
  });
});
