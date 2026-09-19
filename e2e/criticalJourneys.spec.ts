import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { generateMinimalDxf } from './fixtures';

async function skipOnboarding(page: import('@playwright/test').Page): Promise<void> {
  const skip = page.getByRole('button', { name: /^(Omitir|Skip)$/ }).first();
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function openWorkspace(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?surface=workspace');
  await skipOnboarding(page);
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  await expect(page.getByLabel(/Línea de comandos|Command line/)).toBeVisible();
}

async function command(page: import('@playwright/test').Page, value: string): Promise<void> {
  const input = page.getByLabel(/Línea de comandos|Command line/);
  await input.fill(value);
  await input.press('Enter');
}

async function drawLine(page: import('@playwright/test').Page): Promise<void> {
  await command(page, 'LINE');
  await command(page, '0,0');
  await command(page, '100,100');
  await page.getByLabel(/Línea de comandos|Command line/).press('Enter');
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toHaveAttribute('aria-description', /Objetos: 1|Objects: 1/);
}

async function openImportView(page: import('@playwright/test').Page): Promise<import('@playwright/test').Locator> {
  await page.getByRole('button', { name: /Inicio|Home/ }).click();
  await page.getByRole('button', { name: /Importar|Import/ }).first().click();
  return page.locator('input[type="file"]').first();
}

test.describe('Recorridos críticos E2E en navegador real (TST-001)', () => {
  test('crear, dibujar, undo/redo, guardar y reabrir mediante la UI', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    });
    await openWorkspace(page);
    await drawLine(page);

    await page.getByTitle(/Deshacer|Undo/).click();
    await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toHaveAttribute('aria-description', /Objetos: 0|Objects: 0/);
    await page.getByTitle(/Rehacer|Redo/).click();
    await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toHaveAttribute('aria-description', /Objetos: 1|Objects: 1/);

    const downloadPromise = page.waitForEvent('download');
    await command(page, 'QSAVE');
    const download = await downloadPromise;
    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();
    const savedBytes = await readFile(savedPath!);
    await expect(page.locator('.doc-tab__dirty')).toHaveCount(0);

    const input = await openImportView(page);
    await input.setInputFiles({ name: 'reopened.fmodel', mimeType: 'application/octet-stream', buffer: savedBytes });
    await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toHaveAttribute('aria-description', /Objetos: 1|Objects: 1/);
  });

  test('importar DXF y exportar DXF mediante selección de archivo y comandos visibles', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    });
    await page.goto('/?surface=welcome');
    const input = await openImportView(page);
    await input.setInputFiles({ name: 'line.dxf', mimeType: 'application/dxf', buffer: Buffer.from(generateMinimalDxf()) });
    await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
    await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toHaveAttribute('aria-description', /Objetos: 1|Objects: 1/);
    await expect(page.getByRole('dialog', { name: /informe de importación|DXF import report/i })).toBeVisible();

    const exportPromise = page.waitForEvent('download');
    await command(page, 'EXPORTDXF');
    const exported = await exportPromise;
    const exportedPath = await exported.path();
    expect(exportedPath).toBeTruthy();
    const text = await readFile(exportedPath!, 'utf8');
    expect(text).toContain('SECTION');
    expect(text).toContain('ENTITIES');
    expect(text).toContain('LINE');
    expect(text).toContain('EOF');
  });

  test('cancelar Guardar como conserva cambios y el aviso de Nuevo es visible', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => {
          const error = new Error('The user aborted the request.');
          error.name = 'AbortError';
          throw error;
        },
      });
    });
    await openWorkspace(page);
    await drawLine(page);
    await command(page, 'SAVEAS');
    await expect(page.locator('.doc-tab__dirty')).toBeVisible();

    await command(page, 'NEW');
    await expect(page.getByText(/Hay cambios sin guardar|unsaved changes/i).first()).toBeVisible();
    await page.getByRole('button', { name: /^No$/i }).last().click();
    await expect(page.locator('.doc-tab__dirty')).toBeVisible();
  });

  test('paleta, favoritos y resize de docks son navegables por teclado', async ({ page }) => {
    await openWorkspace(page);
    await page.getByRole('button', { name: /Buscar comandos|Search commands/ }).click();
    const palette = page.getByRole('dialog', { name: /Paleta de comandos|Command palette/ });
    await expect(palette).toBeVisible();
    const favorite = palette.getByRole('button', { name: /Marcar .* favorito|Mark .* favorite/ }).first();
    const initialFavorite = await favorite.getAttribute('aria-pressed');
    await favorite.focus();
    await favorite.press('Space');
    await expect(favorite).not.toHaveAttribute('aria-pressed', initialFavorite ?? 'false');
    await page.keyboard.press('Escape');

    const separator = page.getByRole('separator').first();
    await separator.focus();
    await separator.press('End');
    await expect(separator).toHaveAttribute('aria-valuenow', '720');
  });

  test('los journeys principales no tienen violaciones axe critical/serious', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openWorkspace(page);
    // El canvas y el centro de importación son las superficies observables de estos journeys;
    // los docks contienen formularios de propiedades que no participan en ellos.
    const workspace = await new AxeBuilder({ page }).include('.canvas-host').analyze();
    expect(workspace.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([]);

    const input = await openImportView(page);
    await expect(input).toBeVisible();
    const welcome = await new AxeBuilder({ page }).include('.welcome-import').analyze();
    expect(welcome.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([]);
  });
});
