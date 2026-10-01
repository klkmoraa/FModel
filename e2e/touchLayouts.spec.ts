import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Abre la mesa sin la guía de bienvenida, en el tema pedido. */
async function openWorkspace(page: Page, theme: 'dia' | 'noche' = 'dia'): Promise<void> {
  await page.goto('/?surface=workspace');
  await page.waitForFunction(() => !!(window as any).fmodel?.editor);
  await page.evaluate((value) => (window as any).fmodel.editor.setPrefs({ onboardingDone: true, theme: value }), theme);
  await expect(page.getByRole('dialog', { name: /Bienvenido a FModel 2D CAD|Welcome to FModel 2D CAD/ })).toHaveCount(0);
}

async function seriousViolations(page: Page, selector: string) {
  const result = await new AxeBuilder({ page }).include(selector).analyze();
  return result.violations
    .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    .map((violation) => ({ id: violation.id, selector, targets: violation.nodes.slice(0, 3).map((node) => node.target) }));
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.viewport + 1);
}

test.describe('teléfono en vertical (UI-006)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('la mesa del teléfono usa el dock flotante, sin barra de estado ni barras propias', async ({ page }) => {
    await openWorkspace(page);
    await noHorizontalOverflow(page);
    // en vertical no se pide girar nada
    await expect(page.locator('.rotate-card')).toHaveCount(0);
    const dock = page.locator('.precision-dock--phone');
    await expect(dock).toBeVisible();
    await expect(page.locator('.statusbar')).toHaveCount(0);
    await expect(page.getByRole('toolbar', { name: /^Zoom$/ })).toBeVisible();
    // misma materia que el dock de escritorio
    const material = await dock.evaluate((element) => ({ shadow: getComputedStyle(element).boxShadow, radius: getComputedStyle(element).borderTopLeftRadius }));
    expect(material.shadow).not.toBe('none');
    expect(material.radius).toBe('18px');
    const box = await dock.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(56);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  });

  test('una herramienta de la hoja abre la tarjeta de comando con Aceptar y Cancelar', async ({ page }) => {
    await openWorkspace(page);
    await page.getByRole('button', { name: /Todas las herramientas|All tools/ }).tap();
    const deck = page.getByRole('dialog', { name: /Biblioteca de herramientas|Tool library/ });
    await expect(deck).toBeVisible();
    await deck.getByRole('button', { name: /Rectángulo RECTANG|Rectangle RECTANG/ }).tap();
    await expect(deck).toHaveCount(0);

    const card = page.getByRole('region', { name: /Comando activo|Active command/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/RECTANG/);
    await expect(card.getByRole('button', { name: /^(Aceptar|Accept)$/ })).toBeVisible();
    const cardBox = await card.boundingBox();
    const dockBox = await page.locator('.precision-dock--phone').boundingBox();
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(dockBox!.y + 1);

    await card.getByRole('button', { name: /^(Cancelar|Cancel)$/ }).tap();
    await expect(card).toHaveCount(0);
  });

  test('dibujar con toques y editar la selección desde la tarjeta', async ({ page }) => {
    await openWorkspace(page);
    await page.evaluate(() => {
      void (window as any).fmodel.editor.command('CIRCLE');
    });
    await page.touchscreen.tap(195, 420);
    await page.touchscreen.tap(255, 420);
    await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toHaveAttribute('aria-description', /Objetos: 1|Objects: 1/);

    // fuera de la ventana de doble toque, para que sea una selección y no un doble clic
    await page.waitForTimeout(400);
    await page.touchscreen.tap(255, 420);
    const selection = page.getByRole('region', { name: /^(Selección|Selection)$/ });
    await expect(selection).toBeVisible();
    await expect(selection).toContainText(/1 objeto seleccionado|1 object selected/);
    await selection.getByRole('button', { name: /^(Borrar|Erase)$/ }).tap();
    await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toHaveAttribute('aria-description', /Objetos: 0|Objects: 0/);
  });

  test('paneles, precisión y menú son hojas inferiores que se cierran con botón y Escape', async ({ page }) => {
    await openWorkspace(page);

    await page.getByRole('button', { name: /^(Paneles|Panels)/ }).tap();
    const panels = page.getByRole('dialog', { name: /Propiedades|Properties/ });
    await expect(panels).toBeVisible();
    await panels.getByRole('tab', { name: /^(Capas|Layers)$/ }).tap();
    await expect(page.getByRole('dialog', { name: /^(Capas|Layers)$/ })).toBeVisible();
    await expect(page.getByRole('table', { name: /^(Capas|Layers)$/ })).toBeVisible();
    await page.getByRole('button', { name: /Cerrar panel|Close panel/ }).tap();
    await expect(page.locator('.sheet')).toHaveCount(0);

    await page.getByRole('button', { name: /^(Precisión|Precision)/ }).tap();
    const precision = page.getByRole('dialog', { name: /Precisión y vista|Precision & view/ });
    await expect(precision).toBeVisible();
    const ortho = precision.getByRole('button', { name: /^(ORTO|ORTHO)/ });
    const before = await page.evaluate(() => (window as any).fmodel.editor.prefs.snap.ortho);
    await ortho.tap();
    expect(await page.evaluate(() => (window as any).fmodel.editor.prefs.snap.ortho)).toBe(!before);
    await expect(ortho).toHaveAttribute('aria-pressed', String(!before));
    await page.keyboard.press('Escape');
    await expect(precision).toHaveCount(0);

    await page.getByRole('button', { name: /^(Menú|Menu)/ }).tap();
    const menu = page.getByRole('dialog', { name: /^(Menú|Menu)$/ });
    await expect(menu).toBeVisible();
    await menu.getByRole('radio', { name: /^(Noche|Night)$/ }).tap();
    expect(await page.evaluate(() => (window as any).fmodel.editor.prefs.theme)).toBe('noche');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('el teclado abre la línea de comando arriba, con la solicitud como ayuda', async ({ page }) => {
    await openWorkspace(page);
    await page.evaluate(() => {
      void (window as any).fmodel.editor.command('LINE');
    });
    await page.getByRole('button', { name: /Escribir un valor o una opción|Type a value or option/ }).tap();
    const input = page.getByRole('textbox', { name: /Línea de comandos|Command line/ });
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('placeholder', /primer punto|first point|start point/i);
    const box = await input.boundingBox();
    expect(box!.y).toBeLessThan(844 / 3);
    await input.fill('0,0');
    await input.press('Enter');
    await expect(page.getByRole('region', { name: /Comando activo|Active command/ })).toContainText(/siguiente punto|next point/i);
  });

  for (const theme of ['dia', 'noche'] as const) {
    test(`sin violaciones axe critical/serious en el teléfono (${theme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openWorkspace(page, theme);
      expect(await seriousViolations(page, '.precision-dock--phone')).toEqual([]);
      expect(await seriousViolations(page, '.topbar')).toEqual([]);
      await page.evaluate(() => {
        void (window as any).fmodel.editor.command('RECTANG');
      });
      await expect(page.locator('.phone-card')).toBeVisible();
      expect(await seriousViolations(page, '.phone-card')).toEqual([]);
      await page.getByRole('button', { name: /^(Cancelar|Cancel)$/ }).tap();
      for (const name of [/^(Precisión|Precision)/, /^(Paneles|Panels)/, /^(Menú|Menu)/]) {
        await page.getByRole('button', { name }).tap();
        await expect(page.locator('.sheet')).toBeVisible();
        expect(await seriousViolations(page, '.sheet')).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(page.locator('.sheet')).toHaveCount(0);
      }
      await page.getByRole('button', { name: /Todas las herramientas|All tools/ }).tap();
      expect(await seriousViolations(page, '.tool-deck--sheet')).toEqual([]);
    });
  }
});

test.describe('teléfono en horizontal (UI-006, UI-007)', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('propone girar a vertical sin imponerlo y recuerda la elección en la sesión', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openWorkspace(page);
    const prompt = page.getByRole('dialog', { name: /Gira el teléfono a vertical|Turn your phone upright/ });
    await expect(prompt).toBeVisible();
    const keep = prompt.getByRole('button', { name: /Seguir en horizontal|Continue in landscape/ });
    await expect(keep).toBeFocused();
    expect(await seriousViolations(page, '.rotate-card')).toEqual([]);

    // las teclas no llegan a la mesa de debajo mientras el aviso está abierto
    await page.keyboard.press('l');
    await page.keyboard.press('c');
    await expect(keep).toBeFocused();
    expect(await page.evaluate(() => (window as any).fmodel.editor.runner.busy)).toBe(false);

    await keep.tap();
    await expect(prompt).toHaveCount(0);
    await page.reload();
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await expect(page.locator('.precision-dock--phone')).toBeVisible();
    await expect(prompt).toHaveCount(0);
  });

  test('si se sigue en horizontal, usa la mesa del teléfono con tarjeta y dock lado a lado', async ({ page }) => {
    await openWorkspace(page);
    await page.getByRole('button', { name: /Seguir en horizontal|Continue in landscape/ }).tap();
    await noHorizontalOverflow(page);
    await expect(page.locator('.precision-dock--phone')).toBeVisible();
    await expect(page.locator('.statusbar')).toHaveCount(0);
    await page.evaluate(() => {
      void (window as any).fmodel.editor.command('RECTANG');
    });
    const card = page.locator('.phone-card');
    await expect(card).toBeVisible();
    const cardBox = (await card.boundingBox())!;
    const dockBox = (await page.locator('.precision-dock--phone').boundingBox())!;
    // sin superposición y ambos dentro de la pantalla
    expect(cardBox.x + cardBox.width <= dockBox.x + 1 || dockBox.x + dockBox.width <= cardBox.x + 1).toBe(true);
    expect(cardBox.y).toBeGreaterThan(390 / 3);
    expect(dockBox.x + dockBox.width).toBeLessThanOrEqual(845);
  });
});

test.describe('tableta táctil (UI-006)', () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true });

  test('conserva la mesa de escritorio con zoom táctil y Aceptar en el dock', async ({ page }) => {
    await openWorkspace(page);
    await noHorizontalOverflow(page);
    await expect(page.getByRole('navigation', { name: /Herramientas de precisión|Precision tools/ })).toBeVisible();
    await expect(page.locator('.statusbar')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: /^Zoom$/ })).toBeVisible();
    await expect(page.locator('.precision-dock--phone')).toHaveCount(0);

    const tool = page.locator('.precision-dock__tool').first();
    const box = (await tool.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(42);

    await page.evaluate(() => {
      void (window as any).fmodel.editor.command('LINE');
    });
    const accept = page.locator('.precision-dock__context').getByRole('button', { name: /Aceptar|Accept/ });
    await expect(accept).toBeVisible();
    await page.touchscreen.tap(300, 400);
    await page.touchscreen.tap(420, 400);
    await accept.tap();
    await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toHaveAttribute('aria-description', /Objetos: 1|Objects: 1/);
  });
});

test.describe('tableta táctil en horizontal (UI-007)', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });

  test('la tableta apaisada no recibe el aviso de girar ni la mesa del teléfono', async ({ page }) => {
    await openWorkspace(page);
    await expect(page.locator('.rotate-card')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: /Herramientas de precisión|Precision tools/ })).toBeVisible();
    await expect(page.locator('.precision-dock--phone')).toHaveCount(0);
  });
});

