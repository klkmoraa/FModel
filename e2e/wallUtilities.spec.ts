import { expect, test, type Locator, type Page } from '@playwright/test';

async function workspace(page: Page, theme: 'dia' | 'noche') {
  await page.emulateMedia({ colorScheme: theme === 'dia' ? 'light' : 'dark' });
  await page.goto('/?surface=workspace');
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  const skip = page.getByRole('button', { name: /^(Omitir|Skip)$/ }).first();
  if (await skip.isVisible()) await skip.click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.evaluate(theme => (window as any).fmodel.editor.setPrefs({ lang: 'en', theme, grid: { ...(window as any).fmodel.editor.prefs.grid, on: false } }), theme);
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
const state = (page: Page) => page.evaluate(() => {
  const editor = (window as any).fmodel.editor, entities = [...editor.doc.data.entities.values()] as any[];
  return { entities, groups: [...editor.doc.data.groups.values()], preview: editor.preview, excluded: [...editor.previewExcluded],
    history: editor.doc.history.entries().length, anchor: entities.find(e => e.meta?.fmodelWallAssembly) };
});
async function pending(page: Page, kind: string) { await page.waitForFunction(kind => (window as any).fmodel.editor.runner.pending?.req.kind === kind, kind); }
async function select(page: Page, id: string) {
  await pending(page, 'entity');
  await page.evaluate(id => (window as any).fmodel.editor.runner.submitEntity(id, { x: 3000, y: 0 }), id);
}
async function settled(sheet: Locator) {
  await expect.poll(() => sheet.evaluate(element => {
    const style = getComputedStyle(element), matrix = style.transform === 'none' ? null : new DOMMatrixReadOnly(style.transform);
    return Number(style.opacity) === 1 && (!matrix || matrix.isIdentity) && element.getAnimations().every(a => a.playState === 'idle' || a.playState === 'finished');
  })).toBe(true);
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
    const vertices = [...editor.doc.data.entities.values()].flatMap((e: any) => e.type === 'mline' || e.type === 'lwpolyline' ? e.vertices : e.type === 'line' ? [e.start, e.end] : e.type === 'arc' ? [{ x: e.center.x - e.radius, y: e.center.y - e.radius }, { x: e.center.x + e.radius, y: e.center.y + e.radius }] : []);
    const framed = vertices.every((vertex: any) => { const p = editor.view.toScreen(vertex); return p.x > 8 && p.x < editor.view.width - 8 && p.y > 8 && p.y < editor.view.height - (phone ? 150 : 90); });
    return stable && framed && canvas.width === Math.round(last.width * devicePixelRatio) && canvas.height === Math.round(last.height * devicePixelRatio) && host.getAnimations().every(a => a.playState === 'idle' || a.playState === 'finished');
  }, phone)).toBe(true);
}
async function pixels(page: Page) {
  return page.evaluate(() => {
    const editor = (window as any).fmodel.editor;
    const [scene, overlay] = document.querySelectorAll<HTMLCanvasElement>('.canvas-host canvas');
    if (!scene || !overlay) throw Error('canvas not mounted');
    const at = (canvas: HTMLCanvasElement, x: number, y: number) => {
      const screen = editor.view.toScreen({ x, y });
      const cx = Math.round(screen.x * canvas.width / editor.view.width), cy = Math.round(screen.y * canvas.height / editor.view.height);
      const patch = canvas.getContext('2d')!.getImageData(cx - 2, cy - 2, 5, 5).data;
      return [...Array(25)].map((_, i) => [...patch.slice(i * 4, i * 4 + 4)]);
    };
    const background = at(scene, 3000, 1900)[12];
    const contrast = (x: number, y: number) => Math.max(...at(scene, x, y).map(pixel => Math.max(...pixel.slice(0, 3).map((c, i) => Math.abs(c - background[i])))));
    const alpha = (x: number, y: number) => Math.max(...at(overlay, x, y).map(pixel => pixel[3]));
    return { axisScene: contrast(3000, 0), axisOverlay: alpha(3000, 0), faceScene: contrast(3000, 1075), faceOverlay: alpha(3000, 1075) };
  });
}
async function catalogue(page: Page) {
  await page.getByRole('button', { name: /^(Open all tools|All tools)$/ }).click();
  await page.locator('.tool-deck').getByRole('tab', { name: 'Architecture', exact: true }).click();
  await page.locator('.tool-deck').getByRole('button', { name: 'Component catalogue ARCHITECTURE', exact: true }).click();
  await expect(page.locator('.panel--architecture')).toBeVisible();
}

test.describe('Wall utilities: physical axis and clear gap', () => {
  for (const phone of [false, true]) test.describe(phone ? 'phone' : 'desktop', () => {
    if (phone) test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    for (const theme of ['dia', 'noche'] as const) test(`${phone ? 'phone' : 'desktop'} ${theme}: associated axis, empty offset, pixels and reversible history`, async ({ page }, testInfo) => {
      await workspace(page, theme);
      await command(page, 'WALLRECT'); await command(page, '#0,0'); await command(page, '#6000,4000');
      await expect.poll(async () => (await state(page)).entities.filter((e: any) => e.type === 'mline').length).toBe(1);
      const id = (await state(page)).entities[0].id;
      await command(page, 'WALLDOOR'); await select(page, id); await pending(page, 'point'); await command(page, '#3000,0');
      await pending(page, 'point'); await command(page, 'Type'); await pending(page, 'keyword'); await command(page, 'Empty');
      await pending(page, 'point'); await command(page, '');
      await expect.poll(async () => (await state(page)).anchor?.meta.fmodelWallAssembly.openings[0]?.type).toBe('empty');
      const original = await state(page), members = original.groups.find((g: any) => g.id === original.anchor.meta.fmodelWallAssembly.groupId)!.members;
      const source = original.entities.filter((e: any) => members.includes(e.id));
      await command(page, 'ZOOM'); await command(page, 'E'); await command(page, 'ZOOM'); await command(page, 'Out');
      await canvasSettled(page, phone);
      await expect.poll(async () => (await pixels(page)).axisScene < 10).toBe(true);
      await command(page, 'WALLAXIS'); await select(page, members.at(-1)!); await pending(page, 'keyword');
      expect((await state(page)).preview.entities[0]).toMatchObject({ type: 'lwpolyline', closed: true,
        vertices: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }] });
      await expect.poll(async () => (await pixels(page)).axisOverlay > 30).toBe(true);
      await command(page, '');
      await expect.poll(async () => (await state(page)).entities.filter((e: any) => e.type === 'lwpolyline').length).toBe(1);
      await expect.poll(async () => (await pixels(page)).axisScene > 30).toBe(true);
      await command(page, 'WALLOFFSET'); await select(page, id); await pending(page, 'distance'); await command(page, '');
      await pending(page, 'point'); await command(page, 'Left'); await pending(page, 'keyword');
      await command(page, 'Thickness'); await pending(page, 'distance'); await command(page, '300'); await pending(page, 'keyword');
      const before = await state(page);
      expect(before.preview.entities[0]).toMatchObject({ type: 'mline', closed: true, scale: 300,
        vertices: [{ x: 1225, y: 1225 }, { x: 4775, y: 1225 }, { x: 4775, y: 2775 }, { x: 1225, y: 2775 }] });
      expect(before.excluded).toEqual([]);
      await expect.poll(async () => { const px = await pixels(page); return px.axisScene > 30 && px.faceScene < 10 && px.faceOverlay > 30; }).toBe(true);
      await command(page, '');
      await expect.poll(async () => (await state(page)).entities.filter((e: any) => e.type === 'mline' && !members.includes(e.id)).length).toBe(1);
      let after = await state(page);
      const copy = after.entities.find((e: any) => e.type === 'mline' && !members.includes(e.id));
      expect(copy.meta?.fmodelWallMember).toBeUndefined(); expect(copy.meta?.fmodelWallAssembly).toBeUndefined();
      expect(copy.vertices).toEqual([{ x: 1225, y: 1225 }, { x: 4775, y: 1225 }, { x: 4775, y: 2775 }, { x: 1225, y: 2775 }]);
      expect(after.entities.filter((e: any) => members.includes(e.id))).toEqual(source);
      expect(after.groups).toEqual(original.groups);
      await expect.poll(async () => (await pixels(page)).faceScene > 30).toBe(true);
      await command(page, 'UNDO'); await expect.poll(async () => (await pixels(page)).faceScene < 10).toBe(true);
      await command(page, 'REDO'); await expect.poll(async () => (await pixels(page)).faceScene > 30).toBe(true);
      after = await state(page); const count = after.entities.length, history = after.history;
      await command(page, 'WALLOFFSET'); await select(page, id); await pending(page, 'distance'); await command(page, '');
      await pending(page, 'point'); await command(page, 'Right'); await pending(page, 'keyword');
      await command(page, 'Gap'); await pending(page, 'distance');
      await page.evaluate(() => (window as any).fmodel.editor.key('Escape'));
      await expect.poll(async () => (await state(page)).preview).toBeNull();
      expect((await state(page)).entities).toHaveLength(count); expect((await state(page)).history).toBe(history);
      await canvasSettled(page, phone);
      if (phone) {
        await catalogue(page);
        const sheet = page.getByRole('dialog', { name: 'Architecture', exact: true });
        const panel = page.locator('.panel--architecture');
        for (const label of ['Wall axis', 'Parallel wall']) await expect(panel.getByRole('button', { name: label, exact: true })).toBeVisible();
        await panel.getByRole('button', { name: 'Parallel wall', exact: true }).scrollIntoViewIfNeeded();
        await settled(sheet);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`wall-utilities-phone-${theme}-actions.png`) });
        await panel.getByRole('button', { name: 'Wall axis', exact: true }).click();
        await expect(sheet).toHaveCount(0); await pending(page, 'entity');
        await expect(page.locator('.canvas-host')).toBeFocused();
        await page.evaluate(() => (window as any).fmodel.editor.key('Escape'));
        await catalogue(page);
        await panel.getByRole('button', { name: 'Parallel wall', exact: true }).click();
        await expect(sheet).toHaveCount(0); await pending(page, 'entity');
        await expect(page.locator('.canvas-host')).toBeFocused();
        await page.evaluate(() => (window as any).fmodel.editor.key('Escape'));
        await canvasSettled(page, phone);
      }
      await page.screenshot({ path: testInfo.outputPath(`wall-utilities-${phone ? 'phone' : 'desktop'}-${theme}-geometry.png`), animations: 'disabled' });
    });
  });
});
