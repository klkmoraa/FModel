import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

test.describe('alineación visual con FusionStructureBrand', () => {
  test('la interacción de FModel usa morado Modelo y los glifos CAD exponen master 48u', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => {
      (window as any).fmodel.editor.setPrefs({ onboardingDone: true });
    });
    await expect(page.getByRole('dialog', { name: /Bienvenido a FModel 2D CAD|Welcome to FModel 2D CAD/ })).toHaveCount(0);

    const brandButton = page.locator('.brand--btn');
    await brandButton.focus();
    const focus = await brandButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outline: style.outlineColor,
        interaction: getComputedStyle(document.documentElement).getPropertyValue('--fs-interaction').trim(),
      };
    });
    expect(focus.interaction).toBe('#7657d5');
    expect(focus.outline).toBe('rgb(118, 87, 213)');

    const glyph = page.locator('svg.cad-icon').first();
    await expect(glyph).toHaveAttribute('viewBox', '0 0 48 48');
    await expect(glyph.locator('g')).toHaveAttribute('transform', 'scale(2)');
  });

  test('los diálogos atrapan el foco y lo devuelven al control de origen', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => {
      (window as any).fmodel.editor.setPrefs({ onboardingDone: true });
    });
    await expect(page.getByRole('dialog', { name: /Bienvenido a FModel 2D CAD|Welcome to FModel 2D CAD/ })).toHaveCount(0);

    const origin = page.locator('.brand--btn');
    await origin.focus();
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('fmodel:ui', { detail: { ui: 'options' } }));
    });

    const dialog = page.getByRole('dialog', { name: /Opciones|Options/ });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    const focusableCount = await dialog
      .locator('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      .count();
    for (let index = 0; index < focusableCount + 2; index += 1) {
      await page.keyboard.press('Tab');
    }
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    await dialog.focus();
    await page.keyboard.press('Shift+Tab');
    const lastFocusable = dialog
      .locator('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      .last();
    await expect(lastFocusable).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(origin).toBeFocused();
  });

  test('respeta autofocus en Ayuda y restaura el foco al cerrarla', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => {
      (window as any).fmodel.editor.setPrefs({ onboardingDone: true });
    });

    const origin = page.locator('.brand--btn');
    await origin.focus();
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('fmodel:ui', { detail: { ui: 'help' } }));
    });

    const dialog = page.getByRole('dialog', { name: /Ayuda de FModel 2D CAD|FModel 2D CAD help/ });
    const search = dialog.getByRole('textbox', { name: /Buscar comandos|Search commands/ });
    await expect(dialog).toBeVisible();
    await expect(search).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(origin).toBeFocused();
  });

  test('las transiciones entre diálogos conservan el opener externo', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => {
      (window as any).fmodel.editor.setPrefs({ onboardingDone: true });
    });

    const origin = page.locator('.brand--btn');
    await origin.focus();
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('fmodel:ui', { detail: { ui: 'file-menu' } }));
    });

    const fileDialog = page.getByRole('dialog', { name: /Archivo|File/ });
    await expect(fileDialog).toBeVisible();
    await fileDialog.getByRole('button', { name: /Opciones, alias y atajos|Options, aliases & shortcuts/ }).click();

    const optionsDialog = page.getByRole('dialog', { name: /Opciones|Options/ });
    await expect(optionsDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(optionsDialog).toHaveCount(0);
    await expect(origin).toBeFocused();
  });

  test('un control modal puede consumir Escape y los atajos globales no atraviesan el diálogo', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => {
      (window as any).fmodel.editor.setPrefs({ onboardingDone: true });
    });

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('fmodel:ui', { detail: { ui: 'options', cmd: 'SHORTCUTS' } }));
    });

    const dialog = page.getByRole('dialog', { name: /Opciones|Options/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Nuevo atajo|New shortcut/ }).click();

    const capture = dialog.getByRole('textbox', { name: /Combinación|Combination/ });
    await expect(capture).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(capture).toHaveCount(0);
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Control+K');
    await expect(page.locator('.palette')).toHaveCount(0);
    await expect(dialog).toBeVisible();
  });

  test('las etiquetas activas pequeñas usan el morado de alto contraste', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => {
      (window as any).fmodel.editor.setPrefs({ onboardingDone: true });
    });

    const active = page.locator('.status-toggle.is-on').first();
    const colors = await active.evaluate((element) => ({
      text: getComputedStyle(element).color,
      token: getComputedStyle(document.documentElement).getPropertyValue('--fs-interaction-text').trim(),
    }));
    expect(colors.token).toBe('#5b3fc0');
    expect(colors.text).toBe('rgb(91, 63, 192)');

    await page.goto('/?surface=welcome');
    const eyebrow = page.locator('.fmodel-hero__eyebrow');
    await expect(eyebrow).toBeVisible();
    await expect(eyebrow).toHaveCSS('color', 'rgb(91, 63, 192)');
  });

  test('el onboarding aplica el mismo contrato modal de teclado', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);

    const onboarding = page.getByRole('dialog', { name: /Bienvenido a FModel 2D CAD|Welcome to FModel 2D CAD/ });
    await expect(onboarding).toBeVisible();
    expect(await onboarding.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    const focusableCount = await onboarding.locator('button:not([disabled]), [tabindex]:not([tabindex="-1"])').count();
    for (let index = 0; index < focusableCount + 2; index += 1) {
      await page.keyboard.press('Tab');
    }
    expect(await onboarding.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(onboarding).toHaveCount(0);
  });

  for (const viewport of VIEWPORTS) {
    test(`layout crítico estable a ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);

      await page.goto('/?surface=welcome');
      await page.waitForSelector('.welcome-screen');
      const welcomeMetrics = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        bodyScroll: document.body.scrollWidth,
      }));
      expect(welcomeMetrics.scroll).toBeLessThanOrEqual(welcomeMetrics.viewport + 1);
      expect(welcomeMetrics.bodyScroll).toBeLessThanOrEqual(welcomeMetrics.viewport + 1);
      const consoleBox = await page.locator('.welcome-console').boundingBox();
      expect(consoleBox).not.toBeNull();
      expect(consoleBox!.x).toBeGreaterThanOrEqual(-1);
      expect(consoleBox!.x + consoleBox!.width).toBeLessThanOrEqual(viewport.width + 1);

      await page.goto('/?surface=workspace');
      await page.waitForFunction(() => !!(window as any).fmodel?.editor);
      await page.evaluate(() => {
        (window as any).fmodel.editor.setPrefs({ onboardingDone: true });
      });

      const workspaceMetrics = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        bodyScroll: document.body.scrollWidth,
      }));
      expect(workspaceMetrics.scroll).toBeLessThanOrEqual(workspaceMetrics.viewport + 1);
      expect(workspaceMetrics.bodyScroll).toBeLessThanOrEqual(workspaceMetrics.viewport + 1);

      const stageBox = await page.locator('.stage__canvas').boundingBox();
      expect(stageBox).not.toBeNull();
      expect(stageBox!.width).toBeGreaterThan(200);
      expect(stageBox!.height).toBeGreaterThan(180);
      expect(stageBox!.x).toBeGreaterThanOrEqual(-1);
      expect(stageBox!.x + stageBox!.width).toBeLessThanOrEqual(viewport.width + 1);

      if (viewport.width <= 820) {
        await expect(page.locator('.ribbon')).toBeHidden();
        await expect(page.locator('.statusbar')).toBeHidden();
        await expect(page.locator('.mbar')).toBeVisible();
      } else {
        await expect(page.locator('.ribbon')).toBeVisible();
        await expect(page.locator('.statusbar')).toBeVisible();
        await expect(page.locator('.mbar')).toHaveCount(0);
      }
    });
  }
});
