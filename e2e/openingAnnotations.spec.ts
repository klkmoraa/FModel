import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 }, trace: 'off' });
async function command(page: Page, text: string) {
  const line = page.getByRole('textbox', { name: 'Command line', exact: true });
  await line.fill(text); await line.press('Enter');
}
const state = (page: Page) => page.evaluate(() => {
  const e = (window as any).fmodel.editor;
  return { entities: [...e.doc.data.entities.values()] as any[], pending: e.runner.pending?.req.kind, preview: !!e.preview };
});
async function pick(page: Page, id: string) {
  await expect.poll(async () => (await state(page)).pending).toBe('entity');
  // Explicit selection fixture, as in the existing architecture journeys.
  await page.evaluate(id => (window as any).fmodel.editor.runner.submitEntity(id, { x: 0, y: 0 }), id);
}

test('linked opening tags and schedule update through real commands in Day/Night', async ({ page }, testInfo) => {
  await page.goto('/?surface=workspace');
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  const skip = page.getByRole('button', { name: /^(Omitir|Skip)$/ }).first(); if (await skip.isVisible()) await skip.click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.evaluate(() => { const e = (window as any).fmodel.editor; e.setPrefs({ lang: 'en', theme: 'dia', grid: { ...e.prefs.grid, on: false } }); });
  await command(page, 'WALL'); await command(page, '#0,0'); await command(page, '#4000,0'); await command(page, '');
  const wall = (await state(page)).entities.find(e => e.type === 'mline');
  await command(page, 'WALLDOOR'); await pick(page, wall.id); await command(page, '#1000,0'); await command(page, '');
  await command(page, 'WALLWINDOW'); await pick(page, wall.id); await command(page, '#2800,0'); await command(page, '');
  await command(page, 'OPENINGSCHEDULE'); await command(page, '#800,2200');
  const table = (await state(page)).entities.find(e => e.type === 'table');
  await command(page, 'OPENINGTAGS'); await pick(page, table.id); await command(page, ''); await command(page, '');
  const tags = (await state(page)).entities.filter(e => e.type === 'text' && e.openingTag);
  expect(tags.map(e => e.text)).toEqual(['P-01', 'V-01']);
  expect(tags.every(e => e.openingTag.scheduleId === table.id)).toBe(true);
  const door = tags[0], symbol = (await state(page)).entities.find(e => e.type === 'line' && e.meta?.fmodelWallMember?.openingId === door.openingTag.openingId);
  await command(page, 'OPENINGEDIT'); await pick(page, symbol.id); await command(page, 'Width'); await command(page, '1000'); await command(page, '');
  expect((await state(page)).entities.find(e => e.id === table.id).cells[2][2].text).toBe('1000');
  await command(page, 'UNDO'); expect((await state(page)).entities.find(e => e.id === table.id).cells[2][2].text).toBe('900');
  await command(page, 'REDO'); expect((await state(page)).entities.find(e => e.id === table.id).cells[2][2].text).toBe('1000');
  expect((await state(page)).entities.find(e => e.id === door.id).text).toBe('P-01');
  // Layout fixture: enlarge this table and its own style for a readable combined
  // plan/legend frame. Source/tag generation and editing above use real commands.
  await page.evaluate(tableId => {
    const e = (window as any).fmodel.editor, t = e.doc.entity(tableId), style = e.doc.data.tableStyles.get(t.style);
    e.doc.transact('visual table layout', (tx: any) => {
      tx.updateEntity(tableId, { columnWidths: t.columnWidths.map((x: number) => x * 20), rowHeights: t.rowHeights.map((x: number) => x * 20) });
      tx.update('tableStyles', style.id, { cellMargin: style.cellMargin * 20, title: { ...style.title, textHeight: style.title.textHeight * 20 }, header: { ...style.header, textHeight: style.header.textHeight * 20 }, data: { ...style.data, textHeight: style.data.textHeight * 20 } });
    });
  }, table.id);
  await command(page, 'ZOOM'); await command(page, 'Window'); await command(page, '#-300,2500'); await command(page, '#4300,-1200');
  const canvas = await page.locator('.canvas-host canvas').first().boundingBox(), line = await page.getByRole('textbox', { name: 'Command line', exact: true }).boundingBox();
  const tagScreens = await page.evaluate(() => {
    const e = (window as any).fmodel.editor;
    return [...e.doc.data.entities.values()].filter((t: any) => t.openingTag).map((t: any) => e.view.toScreen(t.position).y);
  });
  for (const y of tagScreens) expect(canvas!.y + y + 20).toBeLessThan(line!.y);
  for (const theme of ['dia', 'noche'] as const) {
    await page.evaluate(theme => (window as any).fmodel.editor.setPrefs({ theme }), theme);
    await expect(page.locator('.canvas-host canvas').first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`opening-annotations-${theme}.png`), animations: 'disabled' });
  }
  const before = (await state(page)).entities;
  await command(page, 'OPENINGTAGS'); await pick(page, table.id); await command(page, '');
  await expect.poll(async () => (await state(page)).pending).toBe('keyword');
  await page.keyboard.press('Escape'); await expect.poll(async () => (await state(page)).preview).toBe(false);
  expect((await state(page)).entities).toEqual(before);
});
