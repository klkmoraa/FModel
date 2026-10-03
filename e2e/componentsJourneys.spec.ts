import { expect, test, type Page } from '@playwright/test';

async function openWorkspace(page: Page, theme: 'dia' | 'noche', units: 'mm' | 'm') {
  await page.emulateMedia({ colorScheme: theme === 'dia' ? 'light' : 'dark' });
  await page.goto('/?surface=workspace');
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  const skip = page.getByRole('button', { name: /^(Omitir|Skip)$/ }).first();
  if (await skip.isVisible()) await skip.click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.evaluate(({ theme, units }) => {
    const editor = (window as any).fmodel.editor;
    editor.setPrefs({ lang: 'en', theme });
    editor.doc.transact('test units', (tx: any) => tx.setSettings({ units }));
  }, { theme, units });
}
async function openCatalogue(page: Page) {
  await page.getByRole('button', { name: /^(Open all tools|All tools)$/ }).click();
  await page.locator('.tool-deck').getByRole('tab', { name: 'Architecture', exact: true }).click();
  await page.locator('.tool-deck').getByRole('button', { name: 'Component catalogue ARCHITECTURE', exact: true }).click();
  await expect(page.locator('.panel--architecture')).toBeVisible();
}
async function command(page: Page, text: string) {
  const line = page.getByLabel('Command line', { exact: true });
  await line.fill(text); await line.press('Enter');
}
const entities = (page: Page) => page.evaluate(() => [...(window as any).fmodel.editor.doc.data.entities.values()] as any[]);
async function assertRefused(page: Page, units: 'mm' | 'm') {
  const panel = page.locator('.panel--architecture');
  await panel.getByLabel(`Width · ${units}`, { exact: true }).fill('Infinity');
  for (const action of ['Place', 'Edit component']) {
    await panel.getByRole('button', { name: action, exact: true }).click();
    await expect(panel.getByRole('alert')).toBeVisible();
    await expect(panel.getByLabel(`Width · ${units}`, { exact: true })).toHaveAttribute('aria-invalid', 'true');
    expect(await page.evaluate(() => (window as any).fmodel.editor.runner.busy)).toBe(false);
    expect(await entities(page)).toEqual([]);
  }
}

test.describe('Construction components: native panel journeys', () => {
  for (const units of ['mm', 'm'] as const) for (const theme of ['dia', 'noche'] as const) {
    test(`desktop ${units} ${theme}: fields, refusal, placement, edit and undo/redo`, async ({ page }, testInfo) => {
      await openWorkspace(page, theme, units); await openCatalogue(page);
      const panel = page.locator('.panel--architecture');
      await expect(panel.getByLabel(`Width · ${units}`, { exact: true })).toHaveValue(units === 'm' ? '0.4' : '400');
      await assertRefused(page, units);
      await panel.getByLabel(`Width · ${units}`, { exact: true }).fill('600mm');
      await panel.getByLabel('Rotation · °', { exact: true }).fill('90');
      await panel.getByLabel('Search components', { exact: true }).fill('no-matches');
      await expect(panel.getByRole('button', { name: 'Place', exact: true })).toBeDisabled();
      await panel.getByLabel('Search components', { exact: true }).fill('');
      await expect(panel.getByLabel(`Width · ${units}`, { exact: true })).toHaveValue('600mm');
      await panel.getByLabel(`Width · ${units}`, { exact: true }).focus();
      await panel.getByLabel(`Width · ${units}`, { exact: true }).press('Tab');
      await expect(panel.getByLabel(`Depth · ${units}`, { exact: true })).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath(`components-desktop-${units}-${theme}.png`), animations: 'disabled' });
      await panel.getByRole('button', { name: 'Place', exact: true }).click();
      await expect(page.getByRole('application', { name: 'Drawing canvas' })).toBeFocused();
      await command(page, '#0,0');
      await expect.poll(async () => (await entities(page)).length).toBe(1);
      const placed = await entities(page), state = placed[0].meta.fmodelComponent;
      expect(state.parameters.width).toBe(units === 'm' ? 0.6 : 600); expect(state.rotation).toBeCloseTo(Math.PI / 2);
      expect(placed[0].vertices[1].x).toBeCloseTo(0); expect(placed[0].vertices[1].y).toBeCloseTo(units === 'm' ? 0.6 : 600);
      await command(page, 'ZOOM'); await command(page, 'E');
      await panel.getByRole('button', { name: 'Edit component', exact: true }).click();
      await page.waitForFunction(() => (window as any).fmodel.editor.runner.pending?.req.kind === 'selection');
      const point = await page.evaluate(() => {
        const e = (window as any).fmodel.editor, vertices = [...e.doc.data.entities.values()][0].vertices;
        return e.view.toScreen({ x: (vertices[0].x + vertices[1].x) / 2, y: (vertices[0].y + vertices[1].y) / 2 });
      });
      const bounds = await page.getByRole('application', { name: 'Drawing canvas' }).boundingBox(); expect(bounds).not.toBeNull();
      await page.mouse.click(bounds!.x + point.x, bounds!.y + point.y);
      await page.waitForFunction(() => (window as any).fmodel.editor.runner.pending?.req.kind === 'keyword');
      await command(page, 'width'); await command(page, '800mm');
      expect(await entities(page)).toEqual(placed);
      await command(page, '');
      await expect.poll(async () => (await entities(page))[0].meta.fmodelComponent.parameters.width).toBe(units === 'm' ? 0.8 : 800);
      const edited = await entities(page); expect(edited[0].id).toBe(placed[0].id);
      await command(page, 'UNDO'); expect(await entities(page)).toEqual(placed);
      await command(page, 'REDO'); expect(await entities(page)).toEqual(edited);
      await panel.getByRole('button', { name: 'Place', exact: true }).click();
      await page.waitForFunction(() => (window as any).fmodel.editor.runner.pending?.req.kind === 'point');
      const canvas = page.getByRole('application', { name: 'Drawing canvas' });
      await canvas.press('Escape');
      await expect(panel).toHaveCount(0);
      await page.waitForFunction(() => (window as any).fmodel.editor.runner.pending?.req.kind === 'point');
      await canvas.press('Escape');
      await page.waitForFunction(() => !(window as any).fmodel.editor.runner.busy); expect(await entities(page)).toEqual(edited);
      await command(page, 'ZOOM'); await command(page, 'E');
      await command(page, 'ZOOM'); await command(page, 'Out');
      await page.waitForFunction(() => !(window as any).fmodel.editor.runner.busy);
      await expect.poll(() => page.evaluate(() => {
        const editor = (window as any).fmodel.editor, member = [...editor.doc.data.entities.values()][0];
        return member.vertices.every((vertex: any) => {
          const p = editor.view.toScreen(vertex);
          return p.x > 48 && p.x < editor.view.width - 48 && p.y > 48 && p.y < editor.view.height - 90;
        });
      })).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`components-desktop-${units}-${theme}-placed.png`), animations: 'disabled' });
    });
  }
  for (const theme of ['dia', 'noche'] as const) {
    test(`phone ${theme}: no autofocus/overflow, invalid Place/Edit, close/place/cancel/reopen`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 }); await openWorkspace(page, theme, 'mm'); await openCatalogue(page);
      const sheet = page.getByRole('dialog', { name: 'Architecture', exact: true }), panel = page.locator('.panel--architecture');
      await expect(sheet).toBeVisible();
      expect(await page.evaluate(() => document.activeElement?.tagName === 'INPUT')).toBe(false);
      await assertRefused(page, 'mm'); await expect(sheet).toBeVisible();
      await panel.getByLabel('Width · mm', { exact: true }).fill('650mm');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`components-phone-${theme}.png`), animations: 'disabled' });
      const place = panel.getByRole('button', { name: 'Place', exact: true });
      await place.scrollIntoViewIfNeeded();
      await expect(place).toBeInViewport({ ratio: 1 });
      await expect(panel.getByRole('button', { name: 'Edit component', exact: true })).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: testInfo.outputPath(`components-phone-${theme}-actions.png`), animations: 'disabled' });
      await place.click(); await expect(sheet).toHaveCount(0);
      const canvas = page.getByRole('application', { name: 'Drawing canvas' }); await expect(canvas).toBeFocused();
      const bounds = await canvas.boundingBox(); expect(bounds).not.toBeNull();
      await page.mouse.click(bounds!.x + bounds!.width * 0.4, bounds!.y + bounds!.height * 0.2);
      await expect.poll(async () => (await entities(page)).length).toBe(1);
      const placed = await entities(page); expect(placed[0].meta.fmodelComponent.parameters.width).toBe(650);
      await openCatalogue(page); await expect(panel.getByLabel('Width · mm', { exact: true })).toHaveValue('650mm');
      await panel.getByRole('button', { name: 'Edit component', exact: true }).click(); await expect(sheet).toHaveCount(0);
      await page.waitForFunction(() => (window as any).fmodel.editor.runner.active?.def.name === 'COMPONENTEDIT');
      await page.getByRole('region', { name: 'Active command', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.waitForFunction(() => !(window as any).fmodel.editor.runner.busy); expect(await entities(page)).toEqual(placed);
      await openCatalogue(page); await panel.getByRole('button', { name: 'Place', exact: true }).click();
      await page.getByRole('region', { name: 'Active command', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.waitForFunction(() => !(window as any).fmodel.editor.runner.busy); expect(await entities(page)).toEqual(placed);
      await openCatalogue(page); await expect(panel.getByLabel('Width · mm', { exact: true })).toHaveValue('650mm');
      await page.screenshot({ path: testInfo.outputPath(`components-phone-${theme}-reopened.png`), animations: 'disabled' });
    });
  }
});
