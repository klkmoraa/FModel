import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LineEntity, ViewportEntity } from '../document/types';
import { entityDefaults } from '../document/defaults';
import { createDocument } from '../document/defaults';
import { Editor } from '../editor/editor';
import type { Vec2 } from '../geometry/vec';
import { registerAllCommands } from './index';
registerAllCommands();
import type { CommandDef } from './types';

const running: { editor: Editor; done: Promise<void> }[] = [];
function pointSession(existing?: Editor) {
  const editor = existing ?? new Editor(createDocument());
  editor.setPrefs({ lang: 'en' });
  editor.runner.lastPoint = { x: 2, y: 3 };
  let point: Vec2 | null = null;
  const def: CommandDef = { name: 'POINT_PRECISION_TEST', aliases: [], category: 'utility', readOnly: true,
    label: { es: 'Punto', en: 'Point' }, description: { es: 'Punto', en: 'Point' },
    async run(api) { const response = await api.getPoint({ prompt: { es: 'Punto', en: 'Point' } }); if (response.kind === 'point') point = response.p; } };
  const done = editor.runner.run(def); running.push({ editor, done });
  return { editor, done, point: () => point };
}
afterEach(async () => { for (const session of running.splice(0)) { session.editor.runner.cancelAll(); await session.done; } });

describe('point precision and modifiers', () => {
  it('sets a typed one-shot snap without answering or changing saved snap preferences', async () => {
    const s = pointSession(), pending = s.editor.runner.pending, prefs = structuredClone(s.editor.prefs.snap);
    s.editor.runner.submitText('MID');
    expect(s.editor.osnapOverride).toEqual(['midpoint']);
    expect(s.editor.runner.pending).toBe(pending);
    s.editor.runner.submitText('invalid-point');
    expect(s.editor.osnapOverride).toEqual(['midpoint']);
    s.editor.runner.submitText('#10,20'); await s.done;
    expect(s.point()).toEqual({ x: 10, y: 20 });
    expect(s.editor.osnapOverride).toBeNull();
    expect(s.editor.prefs.snap).toEqual(prefs);
  });

  it('FROM collects a base and relative offset without changing lastPoint with the base', async () => {
    const s = pointSession();
    s.editor.runner.submitText('FROM');
    expect(s.editor.runner.pending?.req.prompt.en).toContain('base');
    s.editor.runner.submitText('#10,20');
    expect(s.editor.runner.lastPoint).toEqual({ x: 2, y: 3 });
    s.editor.runner.submitText('5,7'); await s.done;
    expect(s.point()).toEqual({ x: 15, y: 27 });
    expect(s.editor.doc.version).toBe(0);
  });

  it('nests M2P inside FROM and restores the original request', async () => {
    const s = pointSession();
    s.editor.runner.submitText('FROM'); s.editor.runner.submitText('M2P');
    s.editor.runner.submitText('#0,0'); s.editor.runner.submitText('#10,0');
    s.editor.runner.submitText('@2,3'); await s.done;
    expect(s.point()).toEqual({ x: 7, y: 3 });
  });

  it('supports polar offsets and forced absolute coordinates in FROM', async () => {
    const a = pointSession(); a.editor.runner.submitText('DESDE'); a.editor.runner.submitText('#10,20'); a.editor.runner.submitText('@5<90'); await a.done;
    expect(a.point()?.x).toBeCloseTo(10); expect(a.point()?.y).toBeCloseTo(25);
    const b = pointSession(); b.editor.runner.submitText('FROM'); b.editor.runner.submitText('#10,20'); b.editor.runner.submitText('*3,4'); await b.done;
    expect(b.point()).toEqual({ x: 3, y: 4 });
  });

  it('computes a finite MTP midpoint at extreme finite coordinates and rejects non-finite input', async () => {
    const s = pointSession(); s.editor.runner.submitText('MTP');
    s.editor.runner.submitText('1e309,0'); expect(s.point()).toBeNull(); expect(s.editor.runner.feedback?.kind).toBe('error');
    s.editor.runner.submitText('#1e308,0'); s.editor.runner.submitText('#-1e308,0'); await s.done;
    expect(s.point()).toEqual({ x: 0, y: 0 });
  });

  it('Escape cancels only the top modifier and bounds nesting at eight levels', async () => {
    const s = pointSession(), original = s.editor.runner.pending;
    for (let i = 0; i < 8; i++) s.editor.runner.submitText('FROM');
    const deepest = s.editor.runner.pending;
    s.editor.runner.submitText('FROM'); expect(s.editor.runner.pending).toBe(deepest);
    expect(s.editor.runner.feedback?.text).toContain('8');
    for (let i = 0; i < 8; i++) s.editor.key('Escape');
    expect(s.editor.runner.pending).toBe(original); expect(s.editor.runner.busy).toBe(true);
    s.editor.runner.submitText('#3,4'); await s.done; expect(s.point()).toEqual({ x: 3, y: 4 });
  });

  it('preserves a pending modifier and command preview across a transparent command', async () => {
    const s = pointSession(); s.editor.runner.submitText('FROM');
    const pending = s.editor.runner.pending;
    const preview = { hint: 'underlying preview' }; s.editor.setPreview(preview);
    await s.editor.runner.run({ name: 'PRECISION_TRANSPARENT_TEST', aliases: [], category: 'view', readOnly: true, transparent: true,
      label: { es: 'Vista', en: 'View' }, description: { es: 'Vista', en: 'View' }, run() {} });
    expect(s.editor.runner.pending).toBe(pending); expect(s.editor.preview).toBe(preview);
    s.editor.runner.submitText('#0,0'); s.editor.runner.submitText('@1,2'); await s.done;
    expect(s.point()).toEqual({ x: 1, y: 2 });
  });

  it('uses owner coordinates in a rotated scaled active viewport for midpoint clicks', async () => {
    const doc = createDocument(), editor = new Editor(doc), layoutId = [...doc.data.layouts.keys()][0];
    doc.transact('viewport fixture', tx => tx.addEntity<ViewportEntity>({ ...entityDefaults(doc), id: 'precision-vp', type: 'viewport', owner: layoutId,
      center: { x: 100, y: 100 }, width: 100, height: 80, viewCenter: { x: 20, y: 30 }, scale: 2, viewTwist: Math.PI / 2,
      displayLocked: false, on: true, frozenLayers: [], layerOverrides: {} }));
    editor.setSpace(layoutId); editor.activateViewport('precision-vp');
    editor.setPrefs({ snap: { ...editor.prefs.snap, osnap: false, polar: false, ortho: false, otrack: false, gridSnap: false } });
    const s = pointSession(editor), version = doc.version;
    s.editor.runner.submitText('M2P');
    for (const paper of [{ x: 100, y: 102 }, { x: 100, y: 106 }]) {
      const screen = editor.view.toScreen(paper);
      s.editor.pointerDown(screen, 0); s.editor.pointerUp(screen, 0);
    }
    await s.done;
    expect(s.point()?.x).toBeCloseTo(22); expect(s.point()?.y).toBeCloseTo(30);
    expect(doc.version).toBe(version);
  });

  it('accepts registered MID and GCE commands while LINE is waiting for a point', async () => {
    const editor = new Editor(createDocument());
    const done = editor.command('LINE'); running.push({ editor, done });
    const pending = editor.runner.pending;
    await editor.command('MID');
    expect(editor.runner.pending).toBe(pending); expect(editor.osnapOverride).toEqual(['midpoint']);
    editor.runner.submitText('GCE'); expect(editor.osnapOverride).toEqual(['geocenter']);
  });

  it('retains a point override across a keyword and a transparent interactive command', async () => {
    const editor = new Editor(createDocument()); let response = '';
    const done = editor.runner.run({ name: 'PRECISION_KEYWORD_TEST', aliases: [], category: 'utility', readOnly: true,
      label: { es: 'Punto', en: 'Point' }, description: { es: 'Punto', en: 'Point' }, async run(api) {
        const r = await api.getPoint({ prompt: { es: 'Punto', en: 'Point' }, keywords: [{ key: 'Copy', label: { es: 'Copiar', en: 'Copy' } }] });
        response = r.kind;
        await api.getPoint({ prompt: { es: 'Punto', en: 'Point' } });
      } }); running.push({ editor, done });
    editor.runner.submitText('MID'); editor.runner.submitText('Copy'); await vi.waitFor(() => expect(editor.runner.pending).not.toBeNull());
    await vi.waitFor(() => expect(response).toBe('keyword')); expect(editor.osnapOverride).toEqual(['midpoint']);
    const pan = editor.command('PAN'); running.push({ editor, done: pan });
    expect(editor.osnapOverride).toBeNull();
    editor.runner.submitPoint({ x: 0, y: 0 }); await vi.waitFor(() => expect(editor.runner.pending).not.toBeNull());
    editor.runner.submitPoint({ x: 2, y: 0 }); await pan;
    expect(editor.osnapOverride).toEqual(['midpoint']);
    editor.runner.submitPoint({ x: 3, y: 4 }); await done;
    expect(editor.osnapOverride).toBeNull();
  });

  it.each([false, true])('invalidates modifiers on document load, including same id: %s', async sameId => {
    const editor = new Editor(createDocument());
    const done = editor.command('LINE'); running.push({ editor, done });
    editor.runner.submitText('FROM'); editor.runner.submitText('#10,20'); editor.setAngleLock(Math.PI / 2);
    const next = createDocument(), id = sameId ? editor.doc.id : next.id;
    editor.doc.replaceData(next.data, id);
    const version = editor.doc.version;
    editor.runner.submitText('@5,7'); await done;
    expect(editor.runner.busy).toBe(false); expect(editor.doc.version).toBe(version);
    expect(editor.doc.data.entities.size).toBe(0); expect(editor.runner.lastPoint).toBeNull(); expect(editor.angleLock).toBeNull();
    const newLine = editor.command('LINE'); running.push({ editor, done: newLine });
    editor.runner.submitPoint({ x: 0, y: 0 }); await vi.waitFor(() => expect(editor.runner.pending).not.toBeNull());
    editor.setPrefs({ snap: { ...editor.prefs.snap, osnap: false, polar: false, ortho: false, otrack: false } });
    const resolved = editor.resolveCursor(editor.ownerToScreen({ x: 10, y: 5 })); expect(resolved.p.x).toBeCloseTo(10); expect(resolved.p.y).toBeCloseTo(5);
    editor.runner.cancelAll(); await newLine;
    editor.doc.transact('new drawing edit', tx => tx.setSettings({ linearPrecision: 4 }));
    editor.doc.undo(); expect(editor.doc.settings.linearPrecision).toBe(next.settings.linearPrecision);
  });

  it.each(['EXT', 'PAR'])('acquires a hovered curve for %s with saved OSNAP disabled', async token => {
    const editor = new Editor(createDocument());
    editor.doc.transact('line fixture', tx => tx.addEntity<LineEntity>({ ...entityDefaults(editor.doc), id: 'snap-line', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }));
    editor.setViewportSize(800, 600); editor.view.scale = 20;
    editor.setPrefs({ snap: { ...editor.prefs.snap, osnap: false, otrack: false, types: [], ortho: false, polar: false } });
    const done = editor.command('LINE'); running.push({ editor, done });
    editor.runner.submitPoint({ x: 0, y: 5 }); await vi.waitFor(() => expect(editor.runner.pending).not.toBeNull());
    editor.runner.submitText(token);
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const hover = editor.ownerToScreen({ x: 5, y: 0 }); editor.pointerMove(hover);
    clock.mockReturnValue(1400); editor.pointerMove(hover);
    expect(editor.acquisition.curves.map(curve => curve.id)).toContain('snap-line');
    editor.pointerMove(editor.ownerToScreen(token === 'EXT' ? { x: 15, y: 0.1 } : { x: 15, y: 5.1 }));
    expect(editor.hover.resolved?.candidates.some(candidate => candidate.type === (token === 'EXT' ? 'extension' : 'parallel'))).toBe(true);
    editor.pointerDown(editor.hover.screen, 0); editor.pointerUp(editor.hover.screen, 0);
    expect(editor.osnapOverride).toBeNull(); expect(editor.prefs.snap.osnap).toBe(false); clock.mockRestore();
  });

});
