import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test.use({ trace: 'off' });
async function command(page: Page, value: string) {
  const line = page.getByRole('textbox', { name: 'Command line', exact: true });
  if (!await line.isVisible()) {
    const keyboard = page.getByRole('button', { name: 'Type a value or option' });
    if (await keyboard.isVisible()) await keyboard.tap();
    else { await page.getByRole('button', { name: /^(Menu|Menú)/ }).tap(); await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: /Type a command/ }).tap(); }
  }
  await line.fill(value); await line.press('Enter');
}
const state = (page: Page) => page.evaluate(() => {
  const editor = (window as any).fmodel.editor;
  return { entities: [...editor.doc.data.entities.values()] as any[], pending: editor.runner.pending?.req.kind, preview: !!editor.preview };
});
async function pick(page: Page, id: string) {
  await expect.poll(async () => (await state(page)).pending).toBe('entity');
  // Selection fixture uses the same runner interface as the established architecture journeys.
  await page.evaluate(id => (window as any).fmodel.editor.runner.submitEntity(id, { x: 0, y: 0 }), id);
}
async function catalogue(page: Page) {
  await page.getByRole('button', { name: /^(Open all tools|All tools)$/ }).click();
  await page.locator('.tool-deck').getByRole('tab', { name: 'Architecture', exact: true }).click();
  await page.locator('.tool-deck').getByRole('button', { name: 'Component catalogue ARCHITECTURE', exact: true }).click();
  await expect(page.locator('.panel--architecture')).toBeVisible();
}
for (const phone of [false, true]) test.describe(phone ? 'phone schedule' : 'desktop schedule', () => {
  if (phone) test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('opening schedule real placement and CSV in Day/Night', async ({ page }, testInfo) => {
    await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
    await page.goto('/?surface=workspace');
    await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
    const skip = page.getByRole('button', { name: /^(Omitir|Skip)$/ }).first(); if (await skip.isVisible()) await skip.click();
    await expect(page.locator('.onboarding')).toHaveCount(0);
    await page.evaluate(() => { const e = (window as any).fmodel.editor; e.setPrefs({ lang: 'en', theme: 'dia', grid: { ...e.prefs.grid, on: false } }); });
    await command(page, 'WALLRECT'); await command(page, '#0,0'); await command(page, '#6000,4000');
    const wall = (await state(page)).entities.find(e => e.type === 'mline');
    await command(page, 'WALLDOOR'); await pick(page, wall.id); await command(page, '#1800,0'); await command(page, '');
    await command(page, 'WALLWINDOW'); await pick(page, wall.id); await command(page, '#4200,0'); await command(page, '');
    const before = (await state(page)).entities;
    await catalogue(page);
    await page.locator('.panel--architecture').getByRole('button', { name: 'Opening schedule', exact: true }).click();
    await expect.poll(async () => (await state(page)).pending).toBe('point');
    await command(page, '#0,5000');
    const table = (await state(page)).entities.find(e => e.type === 'table');
    expect(table.cells[2].map((c: any) => c.text)).toEqual(['P-01', 'Single door', '900', '1']);
    expect(table.cells[3].map((c: any) => c.text)).toEqual(['V-01', 'Fixed window', '1200', '1']);
    expect((await state(page)).entities.filter(e => e.id !== table.id)).toEqual(before);
    // Close the desktop dock so screenshots show the table unobstructed.
    if (!phone) { const close = page.locator('.panel--architecture').getByRole('button', { name: /Close|Cerrar/ }); if (await close.isVisible()) await close.click(); }
    await command(page, 'ZOOM'); await command(page, 'Window'); await command(page, '#-10,5010'); await command(page, '#170,4945');
    for (const theme of ['dia', 'noche'] as const) {
      await page.evaluate(theme => (window as any).fmodel.editor.setPrefs({ theme }), theme);
      await expect.poll(() => page.evaluate(() => {
        const e = (window as any).fmodel.editor, t = [...e.doc.data.entities.values()].find((e: any) => e.type === 'table') as any;
        const a = e.view.toScreen(t.position), b = e.view.toScreen({ x: t.position.x + t.columnWidths.reduce((a: number, b: number) => a + b, 0), y: t.position.y - t.rowHeights.reduce((a: number, b: number) => a + b, 0) });
        return a.x > 0 && a.y > 0 && b.x < e.view.width && b.y < e.view.height;
      })).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`opening-schedule-${phone ? 'phone' : 'desktop'}-${theme}.png`), animations: 'disabled' });
    }
    const download = page.waitForEvent('download');
    await command(page, 'TABLECSV'); await pick(page, table.id);
    const file = await download;
    const csv = await readFile((await file.path())!, 'utf8');
    expect(csv).toContain('"P-01","Single door","900","1"');
    expect(csv).toContain('"V-01","Fixed window","1200","1"');
    const current = (await state(page)).entities; await command(page, 'UNDO');
    expect((await state(page)).entities).toEqual(before); await command(page, 'REDO'); expect((await state(page)).entities).toEqual(current);
    await command(page, 'OPENINGSCHEDULE'); await expect.poll(async () => (await state(page)).pending).toBe('point');
    await page.keyboard.press('Escape'); await expect.poll(async () => (await state(page)).preview).toBe(false);
    expect((await state(page)).entities).toEqual(current);
  });
});
