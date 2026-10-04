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
  const fills = entities.filter(e => e.type === 'hatch');
  const area = (e: any) => {
    const values = e.loops.map((loop: any) => {
      const v = loop.vertices;
      if (v.length === 2 && v.every((p: any) => p.bulge === 1)) return Math.PI * ((v[0].x - v[1].x) ** 2 + (v[0].y - v[1].y) ** 2) / 4;
      return Math.abs(v.reduce((sum: number, p: any, i: number) => sum + p.x * v[(i + 1) % v.length].y - p.y * v[(i + 1) % v.length].x, 0)) / 2;
    }).sort((a: number, b: number) => b - a);
    return values[0] - values.slice(1).reduce((sum: number, value: number) => sum + value, 0);
  };
  return { entities, fills, area: fills.reduce((sum: number, e: any) => sum + area(e), 0), groups: [...editor.doc.data.groups.values()], styles: [...editor.doc.data.mlineStyles.values()], preview: editor.preview,
    excluded: [...editor.previewExcluded], requestIds: editor.requestIds, history: editor.doc.history.entries().length, version: editor.doc.version, dirty: editor.doc.dirty, anchor: entities.find(e => e.meta?.fmodelWallAssembly) };
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
    const vertices = [...editor.doc.data.entities.values()].flatMap((e: any) => e.type === 'hatch' ? e.loops.flatMap((l: any) => l.vertices) : e.type === 'mline' || e.type === 'lwpolyline' ? e.vertices : e.type === 'line' ? [e.start, e.end] : e.type === 'arc' || e.type === 'circle' ? [{ x: e.center.x - e.radius, y: e.center.y - e.radius }, { x: e.center.x + e.radius, y: e.center.y + e.radius }] : []);
    const framed = vertices.every((vertex: any) => { const p = editor.view.toScreen(vertex); return p.x > 8 && p.x < editor.view.width - 8 && p.y > 8 && p.y < editor.view.height - (phone ? 150 : 90); });
    return stable && framed && canvas.width === Math.round(last.width * devicePixelRatio) && canvas.height === Math.round(last.height * devicePixelRatio) && host.getAnimations().every(a => a.playState === 'idle' || a.playState === 'finished');
  }, phone)).toBe(true);
}
/** Actual scene/overlay patches; 400mm rayado has separate line and gap probes. */
async function pixels(page: Page) {
  return page.evaluate(() => {
    const editor = (window as any).fmodel.editor, [scene, overlay] = document.querySelectorAll<HTMLCanvasElement>('.canvas-host canvas');
    if (!scene || !overlay) throw Error('canvas not mounted');
    const at = (canvas: HTMLCanvasElement, x: number, y: number) => {
      const s = editor.view.toScreen({ x, y }), cx = Math.round(s.x * canvas.width / editor.view.width), cy = Math.round(s.y * canvas.height / editor.view.height);
      const patch = canvas.getContext('2d')!.getImageData(cx - 2, cy - 2, 5, 5).data;
      return [...Array(25)].map((_, i) => [...patch.slice(i * 4, i * 4 + 4)]);
    };
    const background = at(scene, 4500, 2500)[12];
    const probes = { wall: [1000, 0], column: [1300, 1300], hole: [3000, 0], room: [4500, 2500], wallLine: [800 * Math.SQRT2, 0], wallGap: [1000 * Math.SQRT2, 0], columnLine: [1300, 1300], columnGap: [1300 - 160 / Math.SQRT2, 1300 + 160 / Math.SQRT2] };
    return Object.fromEntries(Object.entries(probes).map(([key, [x, y]]) => [key, {
      scene: Math.max(...at(scene, x, y).map(pixel => Math.max(...pixel.slice(0, 3).map((c, i) => Math.abs(c - background[i]))))),
      overlay: Math.max(...at(overlay, x, y).map(pixel => pixel[3])),
    }]));
  });
}
async function solidPixels(page: Page, where: 'preview' | 'scene' | 'empty') {
  await expect.poll(async () => {
    const px = await pixels(page);
    if (where === 'preview') return px.wall.overlay > 30 && px.column.overlay > 30 && px.wall.scene < 10 && px.column.scene < 10 && px.hole.overlay < 10 && px.room.overlay < 10 && px.hole.scene < 10 && px.room.scene < 10;
    if (where === 'scene') return px.wall.scene > 30 && px.column.scene > 30 && px.hole.scene < 10 && px.room.scene < 10;
    return px.wall.scene < 10 && px.column.scene < 10 && px.hole.scene < 10 && px.room.scene < 10 && px.wall.overlay < 10 && px.column.overlay < 10;
  }).toBe(true);
}
async function hatchedPixels(page: Page, layer: 'overlay' | 'scene') {
  await expect.poll(async () => {
    const px = await pixels(page);
    return px.wallLine[layer] > 30 && px.columnLine[layer] > 30 && px.wallGap[layer] < 10 && px.columnGap[layer] < 10 && px.hole[layer] < 10 && px.room[layer] < 10;
  }).toBe(true);
}
async function selectBatch(page: Page, ids: string[]) {
  await pending(page, 'selection'); await command(page, 'All');
  expect((await state(page)).requestIds.sort()).toEqual([...ids].sort());
  await command(page, ''); await pending(page, 'keyword');
}
async function catalogue(page: Page) {
  await page.getByRole('button', { name: /^(Open all tools|All tools)$/ }).click();
  await page.locator('.tool-deck').getByRole('tab', { name: 'Architecture', exact: true }).click();
  await page.locator('.tool-deck').getByRole('button', { name: 'Component catalogue ARCHITECTURE', exact: true }).click();
  await expect(page.locator('.panel--architecture')).toBeVisible();
}

test.describe('Architectural wall fill: material snapshots and native controls', () => {
  for (const phone of [false, true]) test.describe(phone ? 'phone' : 'desktop', () => {
    if (phone) test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    for (const theme of ['dia', 'noche'] as const) test(`${phone ? 'phone' : 'desktop'} ${theme}: solid and rayado material, empty voids, atomic history and cancel`, async ({ page }, testInfo) => {
      await workspace(page, theme);
      await command(page, 'WALLRECT'); await command(page, 'Thickness'); await pending(page, 'distance'); await command(page, '300');
      await pending(page, 'point'); await command(page, '#0,0'); await command(page, '#6000,4000');
      await expect.poll(async () => (await state(page)).entities.length).toBe(1); const wallId = (await state(page)).entities[0].id;
      await command(page, 'WALLDOOR'); await select(page, wallId); await pending(page, 'point'); await command(page, '#3000,0');
      await pending(page, 'point'); await command(page, 'Type'); await pending(page, 'keyword'); await command(page, 'Empty'); await pending(page, 'point'); await command(page, '');
      await expect.poll(async () => (await state(page)).anchor?.meta.fmodelWallAssembly.openings[0]?.width).toBe(900);
      await command(page, 'COLUMN variant=circular diameter=600'); await pending(page, 'point'); await command(page, '#1000,1000');
      await expect.poll(async () => (await state(page)).entities.filter((e: any) => e.type === 'circle').length).toBe(1);
      const original = await state(page), ids = original.entities.map((e: any) => e.id);
      expect(original.anchor.meta.fmodelWallAssembly.source.scale).toBe(300);
      expect(original.entities.find((e: any) => e.type === 'circle')).toMatchObject({ center: { x: 1300, y: 1300 }, radius: 300 });
      await command(page, 'ZOOM'); await command(page, 'E'); await command(page, 'ZOOM'); await command(page, 'Out'); await canvasSettled(page, phone);
      await solidPixels(page, 'empty');
      await command(page, 'WALLFILL'); await selectBatch(page, ids);
      let data = await state(page); expect(data.preview.entities).toHaveLength(2); expect(data.preview.entities.every((e: any) => e.type === 'hatch' && e.pattern.type === 'solid')).toBe(true);
      expect(data.excluded).toEqual([]); expect(data.entities).toEqual(original.entities); expect(data.groups).toEqual(original.groups); expect(data.styles).toEqual(original.styles); expect(data.history).toBe(original.history); expect(data.version).toBe(original.version);
      await solidPixels(page, 'preview'); await command(page, '');
      await expect.poll(async () => (await state(page)).fills.length).toBe(2); await solidPixels(page, 'scene');
      data = await state(page); expect(data.area).toBeCloseTo(5730000 + 90000 * Math.PI, 5); expect(data.entities.filter((e: any) => ids.includes(e.id))).toEqual(original.entities); expect(data.groups).toEqual(original.groups); expect(data.styles).toEqual(original.styles); expect(data.history).toBe(original.history + 1);
      const solid = data.fills; expect(solid.every((e: any) => !e.associative && !e.meta?.fmodelWallMember && !e.meta?.fmodelComponentMember)).toBe(true);
      await command(page, 'UNDO'); await expect.poll(async () => (await state(page)).fills.length).toBe(0); await solidPixels(page, 'empty'); expect((await state(page)).entities).toEqual(original.entities);
      await command(page, 'REDO'); await expect.poll(async () => (await state(page)).fills).toEqual(solid); await solidPixels(page, 'scene');
      await canvasSettled(page, phone);
      await page.screenshot({ path: testInfo.outputPath(`wall-fill-${phone ? 'phone' : 'desktop'}-${theme}-geometry.png`), animations: 'disabled' });
      if (phone) {
        await catalogue(page); const sheet = page.getByRole('dialog', { name: 'Architecture', exact: true }), panel = page.locator('.panel--architecture');
        const action = panel.getByRole('button', { name: 'Fill walls', exact: true }); await action.scrollIntoViewIfNeeded(); await expect(action).toBeVisible(); await settled(sheet);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`wall-fill-phone-${theme}-actions.png`) });
        await action.tap(); await expect(sheet).toHaveCount(0); await pending(page, 'selection'); await expect(page.locator('.canvas-host')).toBeFocused();
        await page.evaluate(() => (window as any).fmodel.editor.key('Escape')); await expect.poll(async () => (await state(page)).preview).toBeNull();
        expect((await state(page)).fills).toEqual(solid); expect((await state(page)).history).toBe(original.history + 1);
      }
      // Remove every solid foreground before any rayado pixel assertion.
      await command(page, 'UNDO'); await expect.poll(async () => (await state(page)).fills.length).toBe(0); await solidPixels(page, 'empty');
      await command(page, 'WALLFILL'); await selectBatch(page, ids); await command(page, 'Spacing'); await pending(page, 'distance'); await command(page, '400'); await pending(page, 'keyword'); await command(page, 'Hatched'); await pending(page, 'keyword');
      expect((await state(page)).entities).toEqual(original.entities); expect((await state(page)).preview.entities.every((e: any) => e.pattern.type === 'user' && e.pattern.spacing === 400)).toBe(true);
      await hatchedPixels(page, 'overlay'); await command(page, ''); await expect.poll(async () => (await state(page)).fills.length).toBe(2);
      expect((await state(page)).fills.every((e: any) => e.pattern.type === 'user')).toBe(true); expect((await state(page)).area).toBeCloseTo(5730000 + 90000 * Math.PI, 5); await hatchedPixels(page, 'scene');
      await command(page, 'UNDO'); await expect.poll(async () => (await state(page)).fills.length).toBe(0); await solidPixels(page, 'empty');
      for (const [option, kind] of [['Spacing', 'distance'], ['Angle', 'angle']] as const) {
        const before = await state(page); await command(page, 'WALLFILL'); await selectBatch(page, ids); await command(page, option); await pending(page, kind);
        await page.evaluate(() => (window as any).fmodel.editor.key('Escape')); await expect.poll(async () => (await state(page)).preview).toBeNull();
        const after = await state(page); expect(after.entities).toEqual(before.entities); expect(after.groups).toEqual(before.groups); expect(after.styles).toEqual(before.styles); expect(after.version).toBe(before.version); expect(after.dirty).toBe(before.dirty); expect(after.history).toBe(before.history);
      }
      expect((await state(page)).entities).toEqual(original.entities); await solidPixels(page, 'empty');
    });
  });
});
