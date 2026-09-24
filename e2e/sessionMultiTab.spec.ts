import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function workspace(page: Page): Promise<void> {
  await page.goto('/?surface=workspace');
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  const skip = page.getByRole('button', { name: /^(Omitir|Skip)$/ }).first();
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.getByLabel(/Línea de comandos|Command line/)).toBeVisible();
}

async function command(page: Page, value: string): Promise<void> {
  const input = page.getByLabel(/Línea de comandos|Command line/);
  await input.fill(value);
  await input.press('Enter');
}

async function drawLine(page: Page, x: number): Promise<void> {
  await command(page, 'LINE');
  await command(page, `${x},0`);
  await command(page, `${x + 10},10`);
  await page.getByLabel(/Línea de comandos|Command line/).press('Enter');
}

async function sessionDocumentIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('fmodel-2dcad', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const records = await new Promise<{ id: string; documentId: string }[]>((resolve, reject) => {
        const transaction = db.transaction('recovery', 'readonly');
        const request = transaction.objectStore('recovery').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return records.filter((record) => record.id.startsWith('session:')).map((record) => record.documentId).sort();
    } finally {
      db.close();
    }
  });
}

test('dos pestañas restauran sus propios dibujos tras guardados intercalados', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const first = await context.newPage();
    const second = await context.newPage();
    await workspace(first);
    await workspace(second);
    const firstId = await first.evaluate(() => (window as unknown as { fmodel: { editor: { doc: { id: string } } } }).fmodel.editor.doc.id);
    const secondId = await second.evaluate(() => (window as unknown as { fmodel: { editor: { doc: { id: string } } } }).fmodel.editor.doc.id);
    expect(firstId).not.toBe(secondId);

    await drawLine(first, 0);
    await drawLine(second, 100);
    await drawLine(second, 200);
    await expect.poll(() => sessionDocumentIds(first)).toEqual([firstId, secondId].sort());

    await first.reload();
    await expect(first.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toHaveAttribute('aria-description', /Objetos: 1|Objects: 1/);
    expect(await first.evaluate(() => (window as unknown as { fmodel: { editor: { doc: { id: string } } } }).fmodel.editor.doc.id)).toBe(firstId);
    await second.reload();
    await expect(second.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toHaveAttribute('aria-description', /Objetos: 2|Objects: 2/);
    expect(await second.evaluate(() => (window as unknown as { fmodel: { editor: { doc: { id: string } } } }).fmodel.editor.doc.id)).toBe(secondId);
  } finally {
    await context.close();
  }
});
