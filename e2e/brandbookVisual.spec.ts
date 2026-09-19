import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

test.describe('alineación visual con FusionStructureBrand', () => {
  test('la interacción compartida usa verde de marca y los glifos CAD exponen master 48u', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);

    const brandButton = page.locator('.brand--btn');
    await brandButton.focus();
    const focus = await brandButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outline: style.outlineColor,
        interaction: getComputedStyle(document.documentElement).getPropertyValue('--fs-interaction').trim(),
      };
    });
    expect(focus.interaction).toBe('#1aa57a');
    expect(focus.outline).toBe('rgb(26, 165, 122)');

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

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(origin).toBeFocused();
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
    test(`sin desbordes horizontales a ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);

      for (const surface of ['welcome', 'workspace'] as const) {
        await page.goto(surface === 'workspace' ? '/?surface=workspace' : '/?surface=welcome');
        if (surface === 'workspace') {
          await page.waitForFunction(() => !!(window as any).fmodel?.editor);
        } else {
          await page.waitForSelector('.welcome-screen');
        }

        const metrics = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          bodyScroll: document.body.scrollWidth,
        }));
        expect(metrics.scroll).toBeLessThanOrEqual(metrics.viewport + 1);
        expect(metrics.bodyScroll).toBeLessThanOrEqual(metrics.viewport + 1);
      }
    });
  }
});
