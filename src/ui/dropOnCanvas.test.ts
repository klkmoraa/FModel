import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeLibraryBlock, packageBlock } from '../blocks/library';
import { commitLibrary } from '../blocks/libraryStore';
import { installDynamicSamples } from '../blocks/samples';
import { createDocument } from '../document/defaults';
import type { InsertEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { Editor } from '../editor/editor';
import { registerAllCommands } from '../commands';
import { dropOnCanvas } from './dropOnCanvas';

beforeAll(() => registerAllCommands());

function setup() {
  const editor = new Editor(createDocument());
  editor.setViewportSize(800, 600);
  return editor;
}
const inserts = (editor: Editor) => editor.doc.entitiesOf(MODEL_SPACE_ID).filter((e): e is InsertEntity => e.type === 'insert');

describe('soltar en el lienzo', () => {
  it('el punto de suelta usa las referencias a objetos aunque no haya orden en curso', async () => {
    const editor = setup();
    await editor.runner.script('LINE', [{ x: 10, y: 10 }, { x: 40, y: 10 }, '']);
    const s = editor.ownerToScreen({ x: 40, y: 10 });
    const near = { x: s.x + 3, y: s.y - 2 };
    expect(editor.dragHover(near)).toEqual({ x: 40, y: 10 });
    expect(editor.hover.inside).toBe(true);
    expect(editor.dropAt(near)).toEqual({ x: 40, y: 10 });
    expect(editor.hover.inside).toBe(false);
  });

  it('un bloque del dibujo se inserta en el punto soltado, con la escala de la paleta', async () => {
    const editor = setup();
    installDynamicSamples(editor.doc);
    await dropOnCanvas(editor, { kind: 'block', name: 'FM Puerta 2D', scale: 2 }, { x: 100, y: 50 });
    const [ins] = inserts(editor);
    expect(ins.position).toEqual({ x: 100, y: 50 });
    expect(ins.scale).toEqual({ x: 2, y: 2 });
  });

  it('un bloque de la biblioteca se trae al dibujo y se inserta ahí; una orden en curso se cancela', async () => {
    const src = createDocument();
    installDynamicSamples(src);
    const item = makeLibraryBlock(packageBlock(src, src.findByName('blocks', 'FM Puerta 2D')!.id), { name: 'Panel de biblioteca', categoryId: 'cat-sin-clasificar', tags: [] });
    await commitLibrary({ put: [item] });
    const editor = setup();
    const running = editor.runner.script('LINE', [{ x: 0, y: 0 }]);
    await new Promise((r) => setTimeout(r, 5));
    await dropOnCanvas(editor, { kind: 'library-block', id: item.id }, { x: 5, y: 7 });
    await running;
    const [ins] = inserts(editor);
    expect(editor.doc.data.blocks.get(ins.blockId)?.name).toBe('Panel de biblioteca');
    expect(ins.position).toEqual({ x: 5, y: 7 });
    expect(editor.doc.entitiesOf(MODEL_SPACE_ID).filter((e) => e.type === 'line')).toHaveLength(0);
  });
});
