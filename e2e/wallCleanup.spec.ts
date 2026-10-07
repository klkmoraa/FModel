import { expect, test, type Page } from '@playwright/test';

test.use({ trace: 'off' });
async function command(page: Page, value: string) {
  const line = page.getByRole('textbox', { name: 'Command line', exact: true });
  if (!await line.isVisible()) {
    const active = page.getByRole('button', { name: 'Type a value or option' });
    if (await active.isVisible()) await active.tap();
    else { await page.getByRole('button', { name: /^(Menu|Menú)/ }).tap(); await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: /Type a command/ }).tap(); }
  }
  await expect(line).toBeVisible(); await line.fill(value); await line.press('Enter');
}
async function pending(page: Page, kind: string) { await page.waitForFunction(kind => (window as any).fmodel.editor.runner.pending?.req.kind === kind, kind); }
const state = (page: Page) => page.evaluate(() => {
  const editor = (window as any).fmodel.editor, entities = [...editor.doc.data.entities.values()] as any[];
  return { entities, outputs: entities.filter(e => e.meta?.fmodelWallCleanupOutput), groups: [...editor.doc.data.groups.values()], preview: editor.preview, excluded: [...editor.previewExcluded], history: editor.doc.history.entries().length, version: editor.doc.version };
});
async function tools(page: Page, label: string) {
  await page.getByRole('button', { name: /^(Open all tools|All tools)$/ }).click();
  await page.locator('.tool-deck').getByRole('tab', { name: 'Architecture', exact: true }).click();
  await page.locator('.tool-deck').getByRole('button', { name: label, exact: true }).click();
}
async function architecture(page: Page, label: string) {
  await tools(page, 'Component catalogue ARCHITECTURE');
  const sheet = page.getByRole('dialog', { name: 'Architecture', exact: true }), action = page.locator('.panel--architecture').getByRole('button', { name: label, exact: true });
  await action.scrollIntoViewIfNeeded(); await expect(action).toBeVisible();
  await expect.poll(() => sheet.evaluate(element => element.getAnimations().every(a => a.playState === 'idle' || a.playState === 'finished') && Number(getComputedStyle(element).opacity) === 1)).toBe(true);
  expect(await action.evaluate(e => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  return { sheet, action };
}
async function cleanSelection(page: Page) { await pending(page, 'selection'); await command(page, 'All'); await command(page, ''); await pending(page, 'keyword'); }
async function clearSelection(page: Page) { await page.evaluate(() => (window as any).fmodel.editor.selection.clear()); }
async function pixels(page: Page, phase: 'native' | 'preview' | 'clean') {
  await expect.poll(() => page.evaluate(phase => {
    const editor = (window as any).fmodel.editor, [scene, overlay] = document.querySelectorAll<HTMLCanvasElement>('.canvas-host canvas');
    const sample = (canvas: HTMLCanvasElement, x: number, y: number) => {
      const p = editor.view.toScreen({ x, y }), cx = Math.round(p.x * canvas.width / editor.view.width), cy = Math.round(p.y * canvas.height / editor.view.height);
      const bytes = canvas.getContext('2d')!.getImageData(cx - 1, cy - 1, 3, 3).data;
      return Array.from({ length: 9 }, (_, i) => [...bytes.slice(i * 4, i * 4 + 4)]);
    };
    const bg = sample(scene, 4500, 1500)[4];
    const contrast = (x: number, y: number) => Math.max(...sample(scene, x, y).flatMap(p => p.slice(0, 3).map((v, i) => Math.abs(v - bg[i]))));
    const alpha = (x: number, y: number) => Math.max(...sample(overlay, x, y).map(p => p[3]));
    const missing = contrast(2000, 150) < 10 && contrast(700, -150) < 10;
    if (phase === 'native') return contrast(2000, 150) > 30 && contrast(700, -150) > 30 && contrast(4000, 150) < 10;
    if (phase === 'preview') return missing && alpha(1000, 150) > 30 && alpha(2000, 150) < 10 && alpha(700, -150) < 10 && alpha(4000, 150) < 10;
    return missing && contrast(1000, 150) > 30 && contrast(4000, 150) < 10;
  }, phase)).toBe(true);
}
async function frame(page: Page) {
  await command(page, 'ZOOM'); await command(page, 'E'); await command(page, 'ZOOM'); await command(page, 'Out');
  await expect.poll(() => page.evaluate(async () => {
    const host = document.querySelector('.canvas-host')!, canvas = host.querySelector('canvas')!, first = host.getBoundingClientRect();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); const last = host.getBoundingClientRect();
    return first.width === last.width && first.height === last.height && canvas.width === Math.round(last.width * devicePixelRatio);
  })).toBe(true);
}

test.describe('Wall cleanup: reversible native snapshots and real access', () => {
  for (const phone of [false, true]) test.describe(phone ? 'phone' : 'desktop', () => {
    if (phone) test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    for (const theme of ['dia', 'noche'] as const) test(`${phone ? 'phone' : 'desktop'} ${theme}: T column opening preview cancel restore undo`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme: theme === 'dia' ? 'light' : 'dark' }); await page.goto('/?surface=workspace');
      await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
      const skip = page.getByRole('button', { name: /^(Omitir|Skip)$/ }).first(); if (await skip.isVisible()) await skip.click(); await expect(page.locator('.onboarding')).toHaveCount(0);
      await page.evaluate(theme => (window as any).fmodel.editor.setPrefs({ lang: 'en', theme, grid: { ...(window as any).fmodel.editor.prefs.grid, on: false } }), theme);
      await command(page, 'WALL'); await command(page, 'Thickness'); await pending(page, 'distance'); await command(page, '300'); await command(page, '#0,0'); await command(page, '#6000,0'); await command(page, '');
      await expect.poll(async () => (await state(page)).entities.length).toBe(1); const anchor = (await state(page)).entities[0].id;
      await command(page, 'WALLDOOR'); await pending(page, 'entity'); await page.evaluate(id => (window as any).fmodel.editor.runner.submitEntity(id, { x: 4000, y: 0 }), anchor);
      await pending(page, 'point'); await command(page, '#4000,0'); await command(page, 'Type'); await pending(page, 'keyword'); await command(page, 'Empty'); await pending(page, 'point'); await command(page, '');
      await command(page, 'WALL'); await command(page, 'Thickness'); await pending(page, 'distance'); await command(page, '200'); await command(page, '#2000,0'); await command(page, '#2000,2500'); await command(page, '');
      await command(page, 'COLUMN width=400 depth=400'); await pending(page, 'point'); await command(page, '#500,-200');
      await clearSelection(page); await frame(page); await pixels(page, 'native'); const original = await state(page);
      // Real desktop command-deck and touch architecture actions start the same native flow.
      if (phone) {
        const { sheet, action } = await architecture(page, 'Clean walls');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`wall-cleanup-phone-${theme}-actions.png`), animations: 'disabled' });
        await action.tap(); await expect(sheet).toHaveCount(0); await expect(page.locator('.canvas-host')).toBeFocused();
      } else await tools(page, 'Clean walls WALLCLEAN');
      await cleanSelection(page); const preview = await state(page);
      expect(preview.entities).toEqual(original.entities); expect(preview.groups).toEqual(original.groups); expect(preview.history).toBe(original.history); expect(preview.version).toBe(original.version);
      expect(preview.excluded.sort()).toEqual(original.entities.filter((e: any) => e.type === 'mline').map((e: any) => e.id).sort()); await pixels(page, 'preview');
      await page.evaluate(() => (window as any).fmodel.editor.key('Escape')); await expect.poll(async () => (await state(page)).preview).toBeNull(); expect((await state(page)).entities).toEqual(original.entities);
      await command(page, 'WALLCLEAN'); await cleanSelection(page); await command(page, ''); await expect.poll(async () => (await state(page)).outputs.length).toBeGreaterThan(4);
      const cleaned = await state(page); expect(cleaned.history).toBe(original.history + 1); expect(cleaned.entities.filter((e: any) => e.type !== 'mline' && original.entities.some((s: any) => s.id === e.id))).toEqual(original.entities.filter((e: any) => e.type !== 'mline'));
      await clearSelection(page); await pixels(page, 'clean'); await page.screenshot({ path: info.outputPath(`wall-cleanup-${phone ? 'phone' : 'desktop'}-${theme}-geometry.png`), animations: 'disabled' });
      await command(page, 'UNDO'); await expect.poll(async () => (await state(page)).outputs.length).toBe(0); expect((await state(page)).entities).toEqual(original.entities); await pixels(page, 'native');
      await command(page, 'REDO'); await expect.poll(async () => (await state(page)).outputs).toEqual(cleaned.outputs); await clearSelection(page); await pixels(page, 'clean');
      if (phone) { const { sheet, action } = await architecture(page, 'Restore walls'); await action.tap(); await expect(sheet).toHaveCount(0); await expect(page.locator('.canvas-host')).toBeFocused(); }
      else await tools(page, 'Restore walls WALLRESTORE');
      await pending(page, 'keyword'); await command(page, 'All'); await pending(page, 'keyword');
      expect((await state(page)).entities).toEqual(cleaned.entities); await page.evaluate(() => (window as any).fmodel.editor.key('Escape')); await expect.poll(async () => (await state(page)).preview).toBeNull();
      await command(page, 'WALLRESTORE'); await command(page, 'All'); await command(page, ''); await expect.poll(async () => (await state(page)).outputs.length).toBe(0);
      expect((await state(page)).entities).toEqual(original.entities); expect((await state(page)).groups).toEqual(original.groups); await clearSelection(page); await pixels(page, 'native');
      await command(page, 'UNDO'); await expect.poll(async () => (await state(page)).outputs).toEqual(cleaned.outputs); await command(page, 'REDO'); await expect.poll(async () => (await state(page)).entities).toEqual(original.entities);
    });
  });
});
