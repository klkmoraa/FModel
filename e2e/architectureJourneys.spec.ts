import { expect, test, type Page } from '@playwright/test';

async function openWorkspace(page: Page) {
  await page.goto('/?surface=workspace');
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  const skip = page.getByRole('button', { name: /^(Omitir|Skip)$/ }).first();
  if (await skip.isVisible()) await skip.click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
}

async function command(page: Page, text: string) {
  const input = page.getByLabel(/Línea de comandos|Command line/);
  await input.fill(text);
  await input.press('Enter');
}

async function entities(page: Page) {
  return page.evaluate(() => [...(window as any).fmodel.editor.doc.data.entities.values()]);
}

async function pickWall(page: Page, point: { x: number; y: number }) {
  await page.waitForFunction(() => (window as any).fmodel.editor.runner.pending?.req.kind === 'entity');
  const screen = await page.evaluate(p => (window as any).fmodel.editor.view.toScreen(p), point);
  const canvas = page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + screen.x, bounds!.y + screen.y);
  await page.waitForFunction(() => (window as any).fmodel.editor.runner.pending?.req.kind === 'point');
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Arquitectura: habitación, puerta real, cancelar ventana y undo/redo (${colorScheme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await openWorkspace(page);
    await page.getByRole('button', { name: /Abrir todas las herramientas|Open all tools/ }).click();
    await page.getByRole('tab', { name: /^(Arquitectura|Architecture)$/ }).click();
    await page.locator('.tool-deck__item').filter({ hasText: 'WALLRECT' }).click();
    await command(page, '#0,0');
    await command(page, '#6000,4000');
    await expect.poll(async () => (await entities(page)).length).toBe(1);
    const room = await entities(page);
    expect(room[0]).toMatchObject({ type: 'mline', scale: 150, closed: true });

    await command(page, 'ZOOM');
    await command(page, 'E');
    await command(page, 'PUERTA');
    await pickWall(page, { x: 3000, y: 75 });
    await command(page, '#3000,0');
    expect(await entities(page)).toEqual(room);
    await command(page, '#3000,1000');
    await command(page, '');
    await expect.poll(async () => (await entities(page)).length).toBe(5);
    const withDoor = await entities(page);
    expect(withDoor.find((e: any) => e.type === 'mline')).toMatchObject({ id: room[0].id, closed: false });
    const arc = withDoor.find((e: any) => e.type === 'arc');
    expect(arc.radius).toBe(900);
    expect((arc.endAngle - arc.startAngle + Math.PI * 2) % (Math.PI * 2)).toBeCloseTo(Math.PI / 2);

    await command(page, 'VENTANA');
    await pickWall(page, { x: 3000, y: 4075 });
    await command(page, '#3000,4000');
    expect(await entities(page)).toEqual(withDoor);
    await page.getByLabel(/Línea de comandos|Command line/).press('Escape');
    await page.waitForFunction(() => !(window as any).fmodel.editor.runner.busy);
    expect(await entities(page)).toEqual(withDoor);

    await command(page, 'UNDO');
    expect(await entities(page)).toEqual(room);
    await command(page, 'REDO');
    expect(await entities(page)).toEqual(withDoor);
    await page.getByRole('button', { name: /Abrir todas las herramientas|Open all tools/ }).click();
    await page.getByRole('tab', { name: /^(Arquitectura|Architecture)$/ }).click();
    await page.screenshot({ path: testInfo.outputPath(`architecture-${colorScheme}.png`) });
  });
}

test('Arquitectura: la hoja táctil permite iniciar el preset de 100 mm', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  await page.getByRole('button', { name: /^(Todas las herramientas|All tools)$/ }).click();
  const tools = page.getByRole('dialog', { name: /Biblioteca de herramientas|Tool library/ });
  await tools.getByRole('tab', { name: /^(Arquitectura|Architecture)$/ }).click();
  await expect(tools.locator('.tool-deck__item').filter({ hasText: 'WALLDOOR' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('architecture-touch.png') });
  await tools.locator('.tool-deck__item').filter({ hasText: '100 mm' }).click();
  await expect(tools).toHaveCount(0);
  await page.waitForFunction(() => (window as any).fmodel.editor.runner.active?.def.name === 'WALL');
  await page.getByRole('region', { name: /^(Comando activo|Active command)$/ }).getByRole('button', { name: /^(Cancelar|Cancel)$/ }).click();
  await page.waitForFunction(() => !(window as any).fmodel.editor.runner.busy);
  expect(await entities(page)).toEqual([]);
});
