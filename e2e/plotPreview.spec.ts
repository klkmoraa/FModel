import { expect, test } from '@playwright/test';
import type { CadDocument } from '../src/document/document';
import type { ImageEntity } from '../src/document/types';

test('la vista previa de trazado incluye una imagen incrustada', async ({ page }) => {
  await page.goto('/?surface=workspace');
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  const skip = page.getByRole('button', { name: /^(Omitir|Skip)$/ }).first();
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await page.evaluate(() => {
    const doc = (window as unknown as { fmodel: { editor: { doc: CadDocument } } }).fmodel.editor.doc;
    const settings = doc.settings;
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2y8AAAAASUVORK5CYII=';
    doc.transact('IMAGE', (tx) => {
      tx.add('assets', { id: 'preview-logo', name: 'logo.png', mime: 'image/png', size: 68, dataUrl });
      tx.addEntity<ImageEntity>({
        type: 'image', owner: '*model', layer: settings.currentLayer, color: settings.currentColor,
        linetype: settings.currentLinetype, linetypeScale: 1, lineweight: settings.currentLineweight,
        transparency: settings.currentTransparency, visible: true,
        assetId: 'preview-logo', position: { x: 0, y: 0 }, u: { x: 10, y: 0 }, v: { x: 0, y: 10 },
        clipEnabled: false, opacity: 1, fade: 0, brightness: 50, contrast: 50,
      });
    });
  });

  const command = page.getByLabel(/Línea de comandos|Command line/);
  await command.fill('PLOT');
  await command.press('Enter');
  const dialog = page.getByRole('dialog', { name: /Trazar|Plot/ });
  await expect(dialog).toBeVisible();
  const preview = dialog.getByRole('img', { name: /Vista previa del trazado|Plot preview/ });
  await expect.poll(async () => decodeURIComponent((await preview.getAttribute('src')) ?? '')).toContain('<image href="data:image/png;base64,');
  await expect.poll(async () => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});
