import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity, ViewportEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { Editor } from '../editor/editor';
import { registerAllCommands } from './index';
import { parseViewportScale } from './layout';

registerAllCommands();

function addViewport(doc: ReturnType<typeof createDocument>, id: string): string {
  const layoutId = [...doc.data.layouts.keys()][0];
  doc.transact('VIEWPORT', (tx) => tx.addEntity<ViewportEntity>({
    ...entityDefaults(doc),
    id,
    type: 'viewport',
    owner: layoutId,
    center: { x: 100, y: 100 },
    width: 100,
    height: 80,
    viewCenter: { x: 0, y: 0 },
    scale: 1,
    viewTwist: 0,
    displayLocked: false,
    on: true,
    frozenLayers: [],
    layerOverrides: {},
  }));
  return layoutId;
}

afterEach(() => vi.useRealTimers());

describe('comandos de presentación', () => {
  it('LAYOUT Delete elimina la presentación activa y permite deshacerla', async () => {
    const doc = createDocument();
    const activeLayoutId = [...doc.data.layouts.keys()][0];
    const activeLayout = doc.data.layouts.get(activeLayoutId)!;
    doc.transact('segunda presentación', (tx) => tx.add('layouts', { ...structuredClone(activeLayout), id: 'other-layout', name: 'Otra', tabOrder: activeLayout.tabOrder + 1 }));
    const line = doc.transact('línea en presentación', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(doc, activeLayoutId), type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 10 },
    }));
    const editor = new Editor(doc);
    editor.setSpace(activeLayoutId);

    await editor.runner.script('LAYOUT', ['Delete', '']);

    expect(doc.data.layouts.has(activeLayoutId)).toBe(false);
    expect(doc.entity(line.id)).toBeUndefined();
    expect(editor.space).toBe(MODEL_SPACE_ID);
    expect(editor.runner.log.some((entry) => entry.text === '*Cancel*' || entry.text === '*Cancelar*')).toBe(false);
    expect(doc.undo()).toBeTruthy();
    expect(doc.data.layouts.has(activeLayoutId)).toBe(true);
    expect(doc.entity(line.id)).toBeDefined();
    expect(doc.redo()).toBeTruthy();
    expect(doc.data.layouts.has(activeLayoutId)).toBe(false);
  });

  it('rechaza proporciones cuya conversión desborda o se reduce a escala cero', () => {
    const digits = '9'.repeat(309);
    expect(parseViewportScale(`${digits}:1`, 'mm')).toBeNull();
    expect(parseViewportScale(`1:${digits}`, 'mm')).toBeNull();
  });

  it('MVIEW Ajustar conserva una escala positiva con extremos finitos opuestos', async () => {
    const doc = createDocument();
    const layoutId = [...doc.data.layouts.keys()][0];
    doc.transact('línea extrema', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(doc), type: 'line', start: { x: -1e308, y: 0 }, end: { x: 1e308, y: 0 },
    }));
    const editor = new Editor(doc);
    editor.setSpace(layoutId);

    await editor.runner.execute('MVIEW', ['Fit']);

    const viewport = doc.entitiesOf(layoutId).find((entity): entity is ViewportEntity => entity.type === 'viewport');
    expect(viewport?.scale).toBeGreaterThan(0);
    expect(Number.isFinite(viewport?.scale)).toBe(true);
    expect(viewport?.viewCenter).toEqual({ x: 0, y: 0 });
  });

  it('MVIEW rechaza un ancho derivado infinito sin agregar viewport', async () => {
    const doc = createDocument();
    const layoutId = [...doc.data.layouts.keys()][0];
    const editor = new Editor(doc);
    editor.setSpace(layoutId);

    const command = editor.runner.execute('MVIEW');
    editor.runner.submitPoint({ x: -1e308, y: 0 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    editor.runner.submitPoint({ x: 1e308, y: 100 });
    await command;

    expect(doc.entitiesOf(layoutId).filter((entity) => entity.type === 'viewport')).toHaveLength(0);
    expect(editor.runner.log.some((entry) => entry.kind === 'error')).toBe(true);
  });

  it('no activa el viewport aplazado de un dibujo sustituido aunque se reutilice su ID', async () => {
    vi.useFakeTimers();
    const original = createDocument();
    const layoutId = addViewport(original, 'viewport-compartido');
    const editor = new Editor(original);
    editor.setSpace(layoutId);

    await editor.command('MSPACE');

    const replacement = createDocument();
    const replacementLayoutId = addViewport(replacement, 'viewport-compartido');
    editor.doc.replaceData(replacement.data, replacement.id);
    editor.setSpace(replacementLayoutId);
    await vi.runAllTimersAsync();

    expect(editor.activeViewportId).toBeNull();
  });

  it('rechaza IDs ausentes, apagados o pertenecientes a otra presentación', () => {
    const doc = createDocument();
    const layoutId = addViewport(doc, 'viewport-valido');
    const editor = new Editor(doc);
    editor.setSpace(layoutId);

    editor.activateViewport('ausente');
    expect(editor.activeViewportId).toBeNull();

    doc.transact('APAGA', (tx) => tx.updateEntity<ViewportEntity>('viewport-valido', { on: false }));
    editor.activateViewport('viewport-valido');
    expect(editor.activeViewportId).toBeNull();
  });

  it('ZOOM Escala no escribe un factor inválido en el viewport activo', async () => {
    const doc = createDocument();
    const layoutId = addViewport(doc, 'viewport-escala');
    const editor = new Editor(doc);
    editor.setSpace(layoutId);
    editor.activateViewport('viewport-escala');

    await editor.runner.script('ZOOM', ['Scale', '.']);

    expect((doc.entity('viewport-escala') as ViewportEntity).scale).toBe(1);
    expect(editor.runner.log.some((entry) => entry.kind === 'error')).toBe(true);
  });
});
