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
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  await skipOnboarding(page);
  await expect(page.locator('.onboarding')).toHaveCount(0);
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
  const workspaceBrand = page.locator('.brand--btn');
  if (await workspaceBrand.isVisible().catch(() => false)) await workspaceBrand.click();
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

  test('paleta y paneles flotantes por defecto conservan una ruta para fijarse', async ({ page }) => {
    await openWorkspace(page);
    await page.locator('.search-trigger').click();
    const palette = page.getByRole('dialog', { name: /Paleta de comandos|Command palette/ });
    await expect(palette).toBeVisible();
    const favorite = palette.getByRole('button', { name: /Marcar .* favorito|Mark .* favorite/ }).first();
    const initialFavorite = await favorite.getAttribute('aria-pressed');
    await favorite.focus();
    await favorite.press('Space');
    await expect(favorite).not.toHaveAttribute('aria-pressed', initialFavorite ?? 'false');
    await page.keyboard.press('Escape');

    await page.locator('.precision-dock').getByRole('button', { name: /Propiedades|Properties/, exact: true }).click();
    const floating = page.locator('.floating-panel');
    await expect(floating).toBeVisible();
    await expect(page.locator('.dock--right')).toHaveCount(0);

    await floating.getByRole('button', { name: /Fijar Propiedades|Pin Properties/ }).click();
    await expect(floating).toHaveCount(0);
    await expect(page.locator('.dock--right')).toBeVisible();

    const separator = page.getByRole('separator').first();
    await separator.focus();
    await separator.press('End');
    await expect(separator).toHaveAttribute('aria-valuenow', '720');

    await page.getByRole('button', { name: /Hacer flotante Propiedades|Float Properties/ }).click();
    await expect(floating).toBeVisible();
  });

  test('Tool Deck, panel flotante y paleta no se superponen', async ({ page }) => {
    await openWorkspace(page);
    const tools = page.getByRole('button', { name: /Abrir todas las herramientas|Open all tools/ });
    const deck = page.locator('.tool-deck');
    const floating = page.locator('.floating-panel');

    await tools.click();
    await expect(deck).toBeVisible();
    await expect(page.locator('.cmdline')).toBeHidden();
    await page.locator('.precision-dock').getByRole('button', { name: /Propiedades|Properties/, exact: true }).click();
    await expect(deck).toHaveCount(0);
    await expect(floating).toBeVisible();
    await expect(page.locator('.dock--right')).toHaveCount(0);

    await tools.click();
    await expect(floating).toHaveCount(0);
    await expect(deck).toBeVisible();

    await page.locator('.precision-dock').getByRole('button', { name: /Buscar comandos|Search commands/ }).click();
    await expect(deck).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: /Paleta de comandos|Command palette/ })).toBeVisible();

    await page.keyboard.press('Escape');
    await page.locator('.precision-dock').getByRole('button', { name: /Propiedades|Properties/, exact: true }).click();
    await expect(floating).toBeVisible();
    await page.locator('.search-trigger').click();
    await expect(page.getByRole('dialog', { name: /Paleta de comandos|Command palette/ })).toBeVisible();
  });

  test('un diálogo global cierra las superficies flotantes del workspace', async ({ page }) => {
    await openWorkspace(page);
    await page.getByRole('button', { name: /Abrir todas las herramientas|Open all tools/ }).click();
    await expect(page.locator('.tool-deck')).toBeVisible();
    await page.locator('.topbar__actions').getByRole('button', { name: /Archivo|File/, exact: true }).click();
    await expect(page.getByRole('dialog', { name: /Archivo|File/ })).toBeVisible();
    await expect(page.locator('.tool-deck')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await page.locator('.precision-dock').getByRole('button', { name: /Propiedades|Properties/, exact: true }).click();
    await expect(page.locator('.floating-panel')).toBeVisible();
    await page.locator('.topbar__actions').getByRole('button', { name: /Archivo|File/, exact: true }).click();
    await expect(page.locator('.floating-panel')).toHaveCount(0);
  });

  test('los campos principales de comandos conservan un foco visible', async ({ page }) => {
    await openWorkspace(page);
    await page.getByRole('button', { name: /Abrir todas las herramientas|Open all tools/ }).click();
    const search = page.getByRole('textbox', { name: /Buscar herramienta|Search tool/ });
    await search.focus();
    await expect(search).toBeFocused();
    expect(await search.evaluate((input) => getComputedStyle(input).outlineStyle)).toBe('solid');

    await page.getByRole('button', { name: /Cerrar herramientas|Close tools/ }).click();
    await page.locator('.search-trigger').click();
    const paletteInput = page.locator('.palette__input');
    await paletteInput.focus();
    expect(await paletteInput.evaluate((input) => getComputedStyle(input).outlineStyle)).toBe('solid');

    await page.keyboard.press('Escape');
    await command(page, 'LINE');
    const commandInput = page.getByRole('textbox', { name: /Línea de comandos|Command line/ });
    await commandInput.focus();
    expect(await commandInput.evaluate((input) => getComputedStyle(input).outlineStyle)).toBe('solid');
  });

  test('cerrar un panel flotante restaura el foco a su lanzador', async ({ page }) => {
    await openWorkspace(page);
    const properties = page.locator('.precision-dock').getByRole('button', { name: /Propiedades|Properties/, exact: true });
    await properties.click();
    await expect(page.locator('.floating-panel')).toBeVisible();
    await page.getByRole('button', { name: /Cerrar panel|Close panel/ }).click();
    await properties.click();
    await page.getByRole('button', { name: /Cerrar panel|Close panel/ }).click();
    await expect(properties).toBeFocused();
  });

  test('un comando activo conserva una sola superficie de prompt', async ({ page }) => {
    await openWorkspace(page);
    await command(page, 'LINE');
    await expect(page.locator('.cmdline__log')).toHaveCount(0);
    await expect(page.getByLabel(/Línea de comandos|Command line/)).toBeVisible();
    await expect(page.locator('.precision-dock__context')).toContainText(/Línea|Line/);
  });

  test('los journeys principales no tienen violaciones axe critical/serious', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openWorkspace(page);
    // El canvas y el centro de importación son las superficies observables de estos journeys;
    // los docks contienen formularios de propiedades que no participan en ellos.
    const workspace = await new AxeBuilder({ page }).include('.canvas-host').analyze();
    expect(workspace.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([]);

    await page.getByRole('button', { name: /Abrir todas las herramientas|Open all tools/ }).click();
    const toolDeck = await new AxeBuilder({ page }).include('.tool-deck').analyze();
    expect(toolDeck.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([]);
    await page.getByRole('button', { name: /Cerrar herramientas|Close tools/ }).click();

    await page.locator('.search-trigger').click();
    const commandPalette = await new AxeBuilder({ page }).include('.palette').analyze();
    expect(commandPalette.violations
      .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
      .map((violation) => ({ id: violation.id, targets: violation.nodes.slice(0, 3).map((node) => node.target) }))).toEqual([]);
    await page.keyboard.press('Escape');

    await page.locator('.precision-dock').getByRole('button', { name: /Propiedades|Properties/, exact: true }).click();
    await expect(page.locator('.floating-panel')).toBeVisible();
    const floatingPanel = await new AxeBuilder({ page }).include('.floating-panel').analyze();
    expect(floatingPanel.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([]);
    await page.getByRole('button', { name: /Cerrar panel|Close panel/ }).click();

    const input = await openImportView(page);
    await expect(input).toBeVisible();
    const welcome = await new AxeBuilder({ page }).include('.welcome-import').analyze();
    expect(welcome.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([]);
  });
});
