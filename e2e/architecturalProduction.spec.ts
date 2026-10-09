import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
test.use({ viewport: { width: 1440, height: 1000 }, trace: 'off' });
async function command(page: Page, text: string) { const line = page.getByRole('textbox', { name: 'Command line', exact: true }); await line.fill(text); await line.press('Enter'); }
const state = (page: Page) => page.evaluate(() => { const e = (window as any).fmodel.editor; return { entities: [...e.doc.data.entities.values()] as any[], groups: [...e.doc.data.groups.values()] as any[], layouts: [...e.doc.data.layouts.values()] as any[], pending: e.runner.pending?.req.kind, preview: !!e.preview }; });
async function select(page: Page, ids: string[]) { await page.evaluate(ids => (window as any).fmodel.editor.selection.set(ids), ids); }
async function pick(page: Page, id: string) { await expect.poll(async () => (await state(page)).pending).toBe('entity'); await page.evaluate(id => (window as any).fmodel.editor.runner.submitEntity(id, { x: 0, y: 0 }), id); }
test('architectural production live plan and multi-page PDF in Day/Night', async ({ page }, info) => {
  // Exercise download fallback; existing file-access tests cover the native picker.
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value:undefined,configurable:true }));
  await page.goto('/?surface=workspace');
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  const skip = page.getByRole('button', { name: /^(Omitir|Skip)$/ }).first();
  if (await skip.isVisible())
    await skip.click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.evaluate(() => { const e = (window as any).fmodel.editor; e.setPrefs({ lang: 'en', theme: 'dia', grid: { ...e.prefs.grid, on: false } }); });
  await command(page, 'WALLRECT');
  await command(page, '#0,0');
  await command(page, '#6000,4000');
  const wall = (await state(page)).entities.find(e => e.type === 'mline');
  await command(page, 'WALLDOOR');
  await pick(page, wall.id);
  await command(page, '#2000,0');
  await command(page, '');
  await command(page, 'WALL');
  await command(page, '#3000,4000');
  await command(page, '#3000,6500');
  await command(page, '');
  await select(page, [wall.id]);
  await command(page, 'WALLDIM');
  for (let i = 0; i < 3; i++)
    await command(page, '');
  await select(page, [wall.id]);
  await command(page, 'ROOMDATA');
  for (const input of ['Sala', 'Loseta', 'Pintura', '2700', ''])
    await command(page, input);
  await command(page, 'ROOMSCHEDULE');
  await command(page, '#8000,5000');
  await command(page, 'MATERIALSCHEDULE');
  await command(page, '#8000,2500');
  await command(page, 'WALLAUTO');
  await command(page, 'Solid');
  await command(page, '');
  expect((await state(page)).entities.find(e => e.roomLabel).text).toContain('22.52 m²');
  expect((await state(page)).groups.find(g => g.automation?.kind === 'wall-network').automation.status).toBeUndefined();
  const symbol = (await state(page)).entities.find(e => e.type === 'line' && e.meta?.fmodelWallMember?.openingId);
  await command(page, 'OPENINGEDIT');
  await pick(page, symbol.id);
  for (const input of ['Width', '1100', ''])
    await command(page, input);
  expect((await state(page)).entities.some(e => e.type === 'dimension' && Math.abs(Math.hypot(e.p2.x - e.p1.x, e.p2.y - e.p1.y) - 1100) < 0.001)).toBe(true);
  await command(page, 'ZOOM');
  await command(page, 'Window');
  await command(page, '#-1200,8000');
  await command(page, '#15600,-2000');
  await page.getByRole('button', { name: 'Open all tools', exact: true }).click();
  await page.getByRole('tab', { name: 'Architecture', exact: true }).click();
  await page.getByRole('button', { name: 'Plan dimensions WALLDIM', exact: true }).last().scrollIntoViewIfNeeded();
  for (const theme of ['dia', 'noche'] as const) {
    await page.evaluate(theme => (window as any).fmodel.editor.setPrefs({ theme }), theme);
    await page.screenshot({ path: info.outputPath(`architectural-tools-${theme}.png`), animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'Close tools', exact: true }).click();
  for (const theme of ['dia', 'noche'] as const) {
    await page.evaluate(theme => (window as any).fmodel.editor.setPrefs({ theme }), theme);
    await page.screenshot({ path: info.outputPath(`architectural-plan-${theme}.png`), animations: 'disabled' });
  }
  await command(page, 'RECTANG');
  await command(page, '#-1200,-1000');
  await command(page, '#7000,8000');
  await command(page, 'RECTANG');
  await command(page, '#7400,-2000');
  await command(page, '#15600,6200');
  const frames = (await state(page)).entities.filter(e => e.type === 'lwpolyline' && !e.meta).map(e => e.id);
  await select(page, frames);
  await command(page, 'SHEETSET');
  for (const input of ['A3', '1:50', 'Proyecto local', 'Planta', ''])
    await command(page, input);
  const sheets = (await state(page)).layouts.filter(l => l.name.startsWith('Planta'));
  expect(sheets).toHaveLength(2);
  for (const theme of ['dia', 'noche'] as const) {
    await page.evaluate(theme => (window as any).fmodel.editor.setPrefs({ theme }), theme);
    await page.screenshot({ path: info.outputPath(`architectural-sheet-${theme}.png`), animations: 'disabled' });
  }
  await command(page, 'PUBLISH');
  const dialog = page.getByRole('dialog', { name: 'Publish PDF' });
  await expect(dialog).toBeVisible();
  const extra = (await state(page)).layouts.filter(l => !sheets.some(s => s.id === l.id));
  for (const l of extra)
    await dialog.getByRole('checkbox', { name: `Include ${l.name}`, exact: true }).uncheck();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
  const download = await downloadPromise, path = info.outputPath('architectural-sheets.pdf');
  await download.saveAs(path);
  expect((await PDFDocument.load(await readFile(path))).getPageCount()).toBe(2);
  expect((await state(page)).preview).toBe(false);
});
