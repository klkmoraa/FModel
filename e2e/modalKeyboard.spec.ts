import { expect, test } from '@playwright/test';

test('Styles keeps one Tab stop per color grid and restores focus when closed', async ({ page }) => {
  await page.goto('/?surface=workspace');
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  await page.getByRole('button', { name: /^(Omitir|Skip)$/ }).click();
  const command = page.getByRole('textbox', { name: /Línea de comandos|Command line/ });
  await command.click();
  await command.fill('DIMSTYLE');
  await command.press('Enter');

  const dialog = page.getByRole('dialog', { name: /Administrador de estilos|Styles manager/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab', { selected: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('option').first()).toBeFocused();

  const close = dialog.getByRole('button', { name: /^(Cerrar|Close)$/ });
  const done = dialog.getByRole('button', { name: /^(Listo|Done)$/ });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(done).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  const colorTrigger = dialog.locator('button[aria-haspopup="dialog"]').first();
  await colorTrigger.click();
  const colors = page.getByRole('dialog', { name: /Seleccionar color|Select color/ });
  const basic = colors.getByRole('grid', { name: /Colores ACI básicos|Basic ACI colors/ });
  const extended = colors.getByRole('grid', { name: /Colores ACI ampliados|Extended ACI colors/ });
  const aciNumber = colors.getByRole('textbox', { name: /Número ACI|ACI number/ });
  await basic.locator('[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(basic.locator('[data-aci="2"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(colors.getByRole('button', { name: /^(PorBloque|ByBlock)$/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(basic.locator('[data-aci="2"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(extended.locator('[data-aci="10"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(extended.locator('[data-aci="11"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(basic.locator('[data-aci="2"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(extended.locator('[data-aci="11"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(aciNumber).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(extended.locator('[data-aci="11"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(basic.locator('[data-aci="2"]')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(colors).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(colorTrigger).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(command).toBeFocused();
});
