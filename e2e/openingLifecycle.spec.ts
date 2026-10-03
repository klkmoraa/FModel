import { expect, test, type Locator, type Page } from '@playwright/test';

async function workspace(page: Page, theme: 'dia' | 'noche', phone: boolean) {
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: theme === 'dia' ? 'light' : 'dark' });
  await page.goto('/?surface=workspace');
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  const skip = page.getByRole('button', { name: /^(Omitir|Skip)$/ }).first();
  if (await skip.isVisible()) await skip.click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.evaluate(theme => (window as any).fmodel.editor.setPrefs({ lang: 'en', theme }), theme);
}
async function command(page: Page, value: string) {
  const line = page.getByLabel('Command line', { exact: true });
  await line.fill(value); await line.press('Enter');
}
const data = (page: Page) => page.evaluate(() => {
  const editor = (window as any).fmodel.editor;
  const entities = [...editor.doc.data.entities.values()] as any[];
  const anchor = entities.find(e => e.meta?.fmodelWallAssembly);
  return { entities, anchor, openings: anchor?.meta.fmodelWallAssembly.openings ?? [], preview: editor.preview, excluded: [...editor.previewExcluded] };
});
async function pending(page: Page, kind: string) { await page.waitForFunction(kind => (window as any).fmodel.editor.runner.pending?.req.kind === kind, kind); }
async function select(page: Page, id: string) {
  await pending(page, 'entity');
  await page.evaluate(id => (window as any).fmodel.editor.runner.submitEntity(id, { x: 0, y: 0 }), id);
}
async function settled(sheet: Locator) {
  await expect.poll(() => sheet.evaluate(element => {
    const style = getComputedStyle(element), matrix = style.transform === 'none' ? null : new DOMMatrixReadOnly(style.transform);
    return Number(style.opacity) === 1 && (!matrix || matrix.isIdentity) && element.getAnimations().every(a => a.playState === 'idle' || a.playState === 'finished');
  })).toBe(true);
}
async function catalogue(page: Page) {
  await page.getByRole('button', { name: /^(Open all tools|All tools)$/ }).click();
  await page.locator('.tool-deck').getByRole('tab', { name: 'Architecture', exact: true }).click();
  await page.locator('.tool-deck').getByRole('button', { name: 'Component catalogue ARCHITECTURE', exact: true }).click();
  await expect(page.locator('.panel--architecture')).toBeVisible();
}

test.describe('Associated opening lifecycle: room geometry and controls', () => {
  for (const theme of ['dia', 'noche'] as const) for (const phone of [false, true]) {
    test(`${phone ? 'phone' : 'desktop'} ${theme}: two openings, repaired move, undo/redo, delete/undo`, async ({ page }, testInfo) => {
      await workspace(page, theme, phone);
      await command(page, 'WALLRECT'); await command(page, '#0,0'); await command(page, '#6000,4000');
      await expect.poll(async () => (await data(page)).entities.filter((e: any) => e.type === 'mline').length).toBe(1);
      const original = (await data(page)).entities[0];
      await command(page, 'WALLDOOR'); await select(page, original.id); await pending(page, 'point'); await command(page, '#1800,0');
      await pending(page, 'point'); await command(page, '');
      await expect.poll(async () => (await data(page)).openings.length).toBe(1);
      await command(page, 'WALLWINDOW'); await select(page, original.id); await pending(page, 'point'); await command(page, '#4200,0');
      await pending(page, 'point'); await command(page, '');
      await expect.poll(async () => (await data(page)).openings.length).toBe(2);
      let state = await data(page);
      expect(state.openings.map((o: any) => [o.offset, o.width, o.type])).toEqual([[1800, 900, 'single'], [4200, 1200, 'fixed']]);
      expect(state.entities.filter((e: any) => e.type === 'arc')).toHaveLength(1);
      const doorId = state.entities.find((e: any) => e.type === 'arc')!.id;
      const oldEdges = state.entities.filter((e: any) => e.type === 'mline').flatMap((e: any) => e.vertices.map((v: any) => v.x));
      expect(oldEdges).toContain(1350); expect(oldEdges).toContain(2250);
      await command(page, 'OPENINGMOVE'); await select(page, doorId); await pending(page, 'point'); await command(page, '#3000,0');
      await pending(page, 'point');
      state = await data(page);
      expect(state.openings[0].offset).toBe(1800);
      expect(state.excluded).toHaveLength(state.entities.length);
      const previewEdges = state.preview.entities.filter((e: any) => e.type === 'mline').flatMap((e: any) => e.vertices.map((v: any) => v.x));
      expect(previewEdges).not.toContain(1350); expect(previewEdges).toContain(2550); expect(previewEdges).toContain(3450);
      await command(page, '');
      await expect.poll(async () => (await data(page)).openings[0].offset).toBe(3000);
      state = await data(page); expect(state.excluded).toEqual([]);
      const moved = state.entities.filter((e: any) => e.type === 'mline').flatMap((e: any) => e.vertices.map((v: any) => v.x));
      expect(moved).not.toContain(1350); expect(moved).toContain(2550);
      await command(page, 'UNDO'); await expect.poll(async () => (await data(page)).openings[0].offset).toBe(1800);
      await command(page, 'REDO'); await expect.poll(async () => (await data(page)).openings[0].offset).toBe(3000);
      const windowId = (await data(page)).entities.find((e: any) => e.meta?.fmodelWallMember?.openingId === state.openings[1].id)!.id;
      await command(page, 'OPENINGDELETE'); await select(page, windowId); await pending(page, 'keyword');
      expect((await data(page)).openings).toHaveLength(2);
      await command(page, ''); await expect.poll(async () => (await data(page)).openings.length).toBe(1);
      await command(page, 'UNDO'); await expect.poll(async () => (await data(page)).openings.length).toBe(2);
      await command(page, 'ZOOM'); await command(page, 'E');
      if (phone) {
        await catalogue(page);
        const sheet = page.getByRole('dialog', { name: 'Architecture', exact: true });
        const panel = page.locator('.panel--architecture');
        for (const label of ['Move opening', 'Copy opening', 'Edit opening', 'Mirror opening', 'Delete opening', 'Wall thickness']) await expect(panel.getByRole('button', { name: label, exact: true })).toBeVisible();
        const action = panel.getByRole('button', { name: 'Move opening', exact: true });
        await action.scrollIntoViewIfNeeded(); await expect(action).toBeInViewport({ ratio: 1 });
        await settled(sheet);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`openings-phone-${theme}-actions.png`) });
        await panel.getByLabel('Width · mm', { exact: true }).focus();
        await panel.getByLabel('Width · mm', { exact: true }).press('Escape'); await expect(sheet).toHaveCount(0);
      }
      await page.screenshot({ path: testInfo.outputPath(`openings-${phone ? 'phone' : 'desktop'}-${theme}-geometry.png`), animations: 'disabled' });
    });
  }
});
