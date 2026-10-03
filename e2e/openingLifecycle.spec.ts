import { expect, test, type Locator, type Page } from '@playwright/test';

async function workspace(page: Page, theme: 'dia' | 'noche', phone: boolean) {
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: theme === 'dia' ? 'light' : 'dark' });
  await page.goto('/?surface=workspace');
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  const skip = page.getByRole('button', { name: /^(Omitir|Skip)$/ }).first();
  if (await skip.isVisible()) await skip.click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.evaluate(theme => { const e = (window as any).fmodel.editor; e.setPrefs({ lang: 'en', theme, grid: { ...e.prefs.grid, on: false } }); }, theme);
}
async function command(page: Page, value: string) {
  const line = page.getByRole('textbox', { name: 'Command line', exact: true });
  if (!await line.isVisible()) {
    const active = page.getByRole('button', { name: 'Type a value or option' });
    if (await active.isVisible()) await active.tap();
    else {
      await page.getByRole('button', { name: /^(Menu|Menú)/ }).tap();
      await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: /Type a command/ }).tap();
    }
  }
  await expect(line).toBeVisible();
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
/** Samples actual scene and overlay pixels at the original and destination wall faces. */
async function wallPixels(page: Page) {
  return page.evaluate(() => {
    const editor = (window as any).fmodel.editor;
    const [scene, overlay] = document.querySelectorAll<HTMLCanvasElement>('.canvas-host canvas');
    if (!scene || !overlay) throw Error('canvas not mounted');
    const at = (canvas: HTMLCanvasElement, x: number, y: number) => {
      const screen = editor.view.toScreen({ x, y });
      const cx = Math.round(screen.x * canvas.width / editor.view.width), cy = Math.round(screen.y * canvas.height / editor.view.height);
      const ctx = canvas.getContext('2d')!;
      const patch = ctx.getImageData(cx - 2, cy - 2, 5, 5).data;
      return [...Array(25)].map((_, i) => [...patch.slice(i * 4, i * 4 + 4)]);
    };
    const background = at(scene, 3000, 2000)[12];
    const contrast = (x: number, y: number) => Math.max(...at(scene, x, y).map(pixel => Math.max(...pixel.slice(0, 3).map((channel, i) => Math.abs(channel - background[i])))));
    const alpha = (x: number, y: number) => Math.max(...at(overlay, x, y).map(pixel => pixel[3]));
    return {
      oldScene: contrast(1800, 75), newScene: contrast(3000, 75), solidScene: contrast(500, 75),
      oldOverlay: alpha(1800, 75), newOverlay: alpha(3000, 75), solidOverlay: alpha(500, 75),
    };
  });
}
async function canvasSettled(page: Page, phone: boolean) {
  await expect.poll(() => page.evaluate(async phone => {
    const host = document.querySelector<HTMLElement>('.canvas-host')!, canvas = host.querySelector('canvas')!;
    const box = host.getBoundingClientRect();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const next = host.getBoundingClientRect();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const last = host.getBoundingClientRect();
    const editor = (window as any).fmodel.editor;
    const stable = [box, next].every(rect => rect.width === last.width && rect.height === last.height && rect.x === last.x && rect.y === last.y);
    const vertices = [...editor.doc.data.entities.values()].flatMap((e: any) => e.type === 'mline' ? e.vertices : e.type === 'line' ? [e.start, e.end] : e.type === 'arc' ? [{ x: e.center.x - e.radius, y: e.center.y - e.radius }, { x: e.center.x + e.radius, y: e.center.y + e.radius }] : []);
    const framed = vertices.every((vertex: any) => { const p = editor.view.toScreen(vertex); return p.x > 8 && p.x < editor.view.width - 8 && p.y > 8 && p.y < editor.view.height - (phone ? 150 : 90); });
    return stable && framed && canvas.width === Math.round(last.width * devicePixelRatio) && canvas.height === Math.round(last.height * devicePixelRatio) && host.getAnimations().every(a => a.playState === 'idle' || a.playState === 'finished');
  }, phone)).toBe(true);
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
      await command(page, 'ZOOM'); await command(page, 'E');
      await command(page, 'ZOOM'); await command(page, 'Out');
      await canvasSettled(page, phone);
      await expect.poll(async () => { const px = await wallPixels(page); return px.oldScene < 10 && px.newScene > 30 && px.solidScene > 30; }).toBe(true);
      await command(page, 'OPENINGMOVE'); await select(page, doorId); await pending(page, 'point'); await command(page, '#3000,0');
      await pending(page, 'point');
      state = await data(page);
      expect(state.openings[0].offset).toBe(1800);
      expect(state.excluded).toHaveLength(state.entities.length);
      const previewEdges = state.preview.entities.filter((e: any) => e.type === 'mline').flatMap((e: any) => e.vertices.map((v: any) => v.x));
      expect(previewEdges).not.toContain(1350); expect(previewEdges).toContain(2550); expect(previewEdges).toContain(3450);
      await expect.poll(async () => { const px = await wallPixels(page); return px.oldScene < 10 && px.newScene < 10 && px.oldOverlay > 30 && px.solidOverlay > 30 && px.newOverlay < 10; }).toBe(true);
      await command(page, '');
      await expect.poll(async () => (await data(page)).openings[0].offset).toBe(3000);
      state = await data(page); expect(state.excluded).toEqual([]);
      const moved = state.entities.filter((e: any) => e.type === 'mline').flatMap((e: any) => e.vertices.map((v: any) => v.x));
      expect(moved).not.toContain(1350); expect(moved).toContain(2550);
      await expect.poll(async () => { const px = await wallPixels(page); return px.oldScene > 30 && px.newScene < 10 && px.oldOverlay < 10 && px.newOverlay < 10; }).toBe(true);
      await command(page, 'UNDO'); await expect.poll(async () => (await data(page)).openings[0].offset).toBe(1800);
      await command(page, 'REDO'); await expect.poll(async () => (await data(page)).openings[0].offset).toBe(3000);
      const windowId = (await data(page)).entities.find((e: any) => e.meta?.fmodelWallMember?.openingId === state.openings[1].id)!.id;
      await command(page, 'OPENINGDELETE'); await select(page, windowId); await pending(page, 'keyword');
      expect((await data(page)).openings).toHaveLength(2);
      await command(page, ''); await expect.poll(async () => (await data(page)).openings.length).toBe(1);
      await command(page, 'UNDO'); await expect.poll(async () => (await data(page)).openings.length).toBe(2);
      await canvasSettled(page, phone);
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
        await canvasSettled(page, phone);
      }
      await page.screenshot({ path: testInfo.outputPath(`openings-${phone ? 'phone' : 'desktop'}-${theme}-geometry.png`), animations: 'disabled' });
    });
  }
});
