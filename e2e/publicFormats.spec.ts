import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { generateMinimalDxf } from './fixtures';

async function selectedFile(page: Page, name: string, bytes: number[]) {
  await page.evaluate(({ name, bytes }) => {
    (window as any).publicSmokeFile = { name, bytes };
  }, { name, bytes });
}
async function command(page: Page, name: string) {
  await page.evaluate(name => (window as any).fmodel.editor.command(name), name);
}
async function state(page: Page) {
  return page.evaluate(() => {
    const editor = (window as any).fmodel.editor;
    return { entities: [...editor.doc.data.entities.values()], id: editor.doc.id, version: editor.doc.version,
      dirty: editor.doc.dirty, history: editor.doc.history.entries().length, fileName: editor.fileName };
  });
}

test('public build keeps native/DXF access and atomically rejects DWG (REL-001 route B)', async ({ page }) => {
  test.skip(process.env.FMODEL_PUBLIC_SMOKE !== '1', 'Run against FMODEL_DWG_ENABLED=false build only.');
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async (options: unknown) => {
        (window as any).publicSmokePicker = options;
        const { name, bytes } = (window as any).publicSmokeFile;
        return [{ name, getFile: async () => new File([new Uint8Array(bytes)], name) }];
      },
    });
  });
  await page.goto('/?surface=workspace');
  await page.waitForFunction(() => !!(window as any).fmodel?.editor);
  await expect(page.getByRole('application', { name: /Lienzo de dibujo|Drawing canvas/ })).toBeVisible();
  await page.evaluate(() => (window as any).fmodel.editor.setPrefs({ onboardingDone: true, lang: 'en' }));

  await selectedFile(page, 'public-line.dxf', [...Buffer.from(generateMinimalDxf())]);
  await command(page, 'OPEN');
  expect((await state(page)).entities.map((entity: any) => entity.type)).toEqual(['line']);
  await expect(page.getByRole('dialog', { name: /DXF import report/i })).toBeVisible();
  expect(await page.evaluate(() => (window as any).publicSmokePicker.types[0].accept)).toEqual({
    'application/x-fmodel': ['.fmodel'], 'application/json': ['.json'], 'application/dxf': ['.dxf'],
  });
  const downloadPromise = page.waitForEvent('download');
  await command(page, 'QSAVE');
  const downloaded = await downloadPromise;
  const native = await readFile((await downloaded.path())!);
  await selectedFile(page, 'public-native.fmodel', [...native]);
  await command(page, 'OPEN');
  expect((await state(page)).entities.map((entity: any) => entity.type)).toEqual(['line']);

  await selectedFile(page, 'blocked.dwg', [...Buffer.from('AC1032')]);
  for (const lang of ['es', 'en']) {
    await page.evaluate(lang => (window as any).fmodel.editor.setPrefs({ lang }), lang);
    const before = await state(page);
    for (const entryPoint of ['OPEN', 'LIBRARYIMPORT']) {
      await command(page, entryPoint);
      expect(await state(page)).toEqual(before);
      const error = await page.evaluate(() => (window as any).fmodel.editor.runner.log.at(-1));
      expect(error.kind).toBe('error');
      expect(error.text).toContain('Convierte el archivo a DXF');
      expect(error.text).toContain('Convert the file to DXF');
      const picker = await page.evaluate(() => (window as any).publicSmokePicker);
      expect(JSON.stringify(picker)).not.toContain('.dwg');
    }
  }
  expect(requests.filter(url => /libredwg|readDwg|wasmUrl|\.wasm(?:\?|$)/i.test(url))).toEqual([]);
});
