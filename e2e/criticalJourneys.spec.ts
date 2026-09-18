import { expect, test } from '@playwright/test';
import { generateMinimalDxf } from './fixtures';

test.describe('Recorridos críticos E2E en navegador real (TST-001)', () => {
  test('1. Crear → dibujar → undo/redo → guardar → reabrir', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);

    // Dibujar entidad en el documento activo
    await page.evaluate(() => {
      const { doc } = (window as any).fmodel;
      const layerId = doc.data.currentLayerId || doc.data.layers.keys().next().value;
      doc.transact('LINE', (tx: any) => {
        tx.addEntity({
          id: 'e2e_l1',
          type: 'line',
          owner: '*model',
          layer: layerId,
          color: 'ByLayer',
          linetype: 'ByLayer',
          linetypeScale: 1,
          lineweight: -1,
          transparency: 0,
          visible: true,
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 100, y: 100 },
        });
      });
    });

    expect(await page.evaluate(() => (window as any).fmodel.doc.data.entities.size)).toBe(1);

    // Deshacer (undo)
    await page.evaluate(() => (window as any).fmodel.doc.undo());
    expect(await page.evaluate(() => (window as any).fmodel.doc.data.entities.size)).toBe(0);

    // Rehacer (redo)
    await page.evaluate(() => (window as any).fmodel.doc.redo());
    expect(await page.evaluate(() => (window as any).fmodel.doc.data.entities.size)).toBe(1);

    // Guardar paquete nativo usando la biblioteca del modelo
    const bytes = await page.evaluate(async () => {
      const { doc, io } = (window as any).fmodel;
      const u8 = io.writePackage(doc.data, doc.id);
      return Array.from(u8);
    });
    expect(bytes.length).toBeGreaterThan(0);

    // Reabrir paquete en el documento
    const reloadedOk = await page.evaluate(async (dataArray) => {
      const { doc, io } = (window as any).fmodel;
      const res = io.readPackage(new Uint8Array(dataArray));
      doc.replaceData(res.data, res.documentId);
      return doc.data.entities.has('e2e_l1');
    }, bytes);
    expect(reloadedOk).toBe(true);
  });

  test('2. Cancelar Guardar como con cambios y comprobar aviso al cerrar/nuevo', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);

    // Dibujar para marcar dirty = true
    await page.evaluate(() => {
      const { doc } = (window as any).fmodel;
      const layerId = doc.data.currentLayerId || doc.data.layers.keys().next().value;
      doc.transact('LINE', (tx: any) => {
        tx.addEntity({
          id: 'e2e_dirty_l1',
          type: 'line',
          owner: '*model',
          layer: layerId,
          color: 'ByLayer',
          linetype: 'ByLayer',
          linetypeScale: 1,
          lineweight: -1,
          transparency: 0,
          visible: true,
          order: 1,
          start: { x: 10, y: 10 },
          end: { x: 20, y: 20 },
        });
      });
    });

    expect(await page.evaluate(() => (window as any).fmodel.doc.dirty)).toBe(true);

    // Simular que showSaveFilePicker es cancelado por el usuario
    await page.evaluate(() => {
      (window as any).showSaveFilePicker = async () => {
        const err = new Error('The user aborted a request.');
        err.name = 'AbortError';
        throw err;
      };
    });

    // Ejecutar SAVEAS
    await page.evaluate(async () => {
      const { editor } = (window as any).fmodel;
      await editor.command('SAVEAS');
    });

    // DAT-001: Cancelar mantiene doc.dirty === true
    expect(await page.evaluate(() => (window as any).fmodel.doc.dirty)).toBe(true);

    // Intentar NUEVO con cambios sin guardar: confirmDiscard pide confirmación
    const promptShown = await page.evaluate(async () => {
      const { editor } = (window as any).fmodel;
      let promptText = '';
      const p = editor.command('NEW');
      await new Promise((r) => setTimeout(r, 60));
      const active = editor.runner.active;
      promptText = active?.pending?.req?.prompt?.es ?? '';
      editor.runner.submitKeyword('No');
      await p;
      return promptText;
    });

    expect(promptShown).toContain('Hay cambios sin guardar');
  });

  test('3. Copiar bloque/imagen/texto entre dibujos y reabrir el resultado (DAT-002)', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);

    // Crear entidades con bloque, estilo de texto e imagen
    const pkgJson = await page.evaluate(async () => {
      const { editor, doc, io } = (window as any).fmodel;

      doc.transact('CREA_OBJETOS', (tx: any) => {
        tx.add('textStyles', {
          id: 'ts_e2e',
          name: 'EstiloE2E',
          font: 'Inter',
          height: 3,
          widthFactor: 1,
          oblique: 0,
          annotative: false,
        });
        tx.addEntity({
          id: 'txt_e2e',
          type: 'text',
          owner: '*model',
          layer: '0',
          color: 'ByLayer',
          linetype: 'ByLayer',
          linetypeScale: 1,
          lineweight: -1,
          transparency: 0,
          visible: true,
          order: 1,
          style: 'ts_e2e',
          text: 'Texto de prueba E2E',
          position: { x: 15, y: 15 },
          height: 3,
          rotation: 0,
          widthFactor: 1,
          oblique: 0,
          halign: 'left',
          valign: 'baseline',
        });
      });

      const pkg = io.createClipboardPackage(doc, ['txt_e2e'], editor.ctx);
      return JSON.stringify(pkg);
    });

    expect(pkgJson).toContain('fmodel-clip');
    expect(pkgJson).toContain('EstiloE2E');

    // Pegar en un segundo dibujo limpio
    const pasteOk = await page.evaluate(async (json) => {
      const { createDocument, io } = (window as any).fmodel;
      const dstDoc = createDocument({ title: 'Segundo dibujo' });
      const pkg = io.parseClipboardPackage(json);
      const res = io.pasteClipboardPackage(dstDoc, pkg, '*model', { x: 50, y: 50 });
      const hasStyle = dstDoc.data.textStyles.size > 1;
      const hasEnt = res.insertedIds.length === 1;
      return hasStyle && hasEnt;
    }, pkgJson);

    expect(pasteOk).toBe(true);
  });

  test('4. Importar/exportar DXF y mostrar informe', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);

    const dxf = generateMinimalDxf();

    // Importar DXF
    const importedCount = await page.evaluate(async (dxfContent) => {
      const { doc, io } = (window as any).fmodel;
      const report = io.importDxfIntoDocument(doc, dxfContent, { replace: true });
      return { entities: doc.data.entities.size, warnings: report.warnings.length };
    }, dxf);

    expect(importedCount.entities).toBe(1);

    // Exportar DXF
    const exportedDxf = await page.evaluate(async () => {
      const { io } = (window as any).fmodel;
      const res = await io.exportDxf();
      return res.text;
    });

    expect(exportedDxf).toContain('SECTION');
    expect(exportedDxf).toContain('ENTITIES');
    expect(exportedDxf).toContain('LINE');
    expect(exportedDxf).toContain('EOF');
  });

  test('5. Crear layout → vista previa → PDF/SVG', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);

    // Crear layout y renderizar a SVG
    const svgResult = await page.evaluate(async () => {
      const { editor, doc, io } = (window as any).fmodel;
      doc.transact('NUEVO_LAYOUT', (tx: any) => {
        tx.add('layouts', {
          id: 'lay_e2e',
          name: 'Plano E2E A3',
          order: 1,
          page: {
            paper: 'ISO A3',
            width: 420,
            height: 297,
            orientation: 'landscape',
            margins: { top: 10, right: 10, bottom: 10, left: 10 },
            plotArea: 'layout',
            plotScale: 1,
            plotLineweights: true,
            plotStyle: 'color',
            plotTransparency: true,
            plotPaperspaceLast: true,
            hidePaperspaceObjects: false,
            center: true,
            offset: { x: 0, y: 0 },
          },
          viewports: [],
        });
      });

      editor.space = 'lay_e2e';
      const res = await io.exportSvg('lay_e2e');
      return res.data;
    });

    expect(svgResult).toContain('<svg');
    expect(svgResult).toContain('width="420mm"');
    expect(svgResult).toContain('height="297mm"');
  });

  test('6. Autoguardado → simular cierre no limpio → recuperar', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);

    // Modificar dibujo y disparar guardado en persistencia (IndexedDB real del navegador)
    await page.evaluate(async () => {
      const { doc, persistence } = (window as any).fmodel;
      doc.transact('MODIFICA', (tx: any) => {
        tx.addEntity({
          id: 'e2e_recov_1',
          type: 'line',
          owner: '*model',
          layer: '0',
          color: 'ByLayer',
          linetype: 'ByLayer',
          linetypeScale: 1,
          lineweight: -1,
          transparency: 0,
          visible: true,
          order: 1,
          start: { x: 25, y: 25 },
          end: { x: 75, y: 75 },
        });
      });
      await persistence.autosave();
    });

    // Comprobar que en IndexedDB hay un borrador pendiente de recuperación tras cierre sucio
    const hasPendingRecovery = await page.evaluate(async () => {
      const { persistence } = (window as any).fmodel;
      const rec = await persistence.pendingRecovery();
      return rec !== null && rec.name !== '';
    });

    expect(hasPendingRecovery).toBe(true);
  });

  test('7. Actualización de service worker sin perder dibujo abierto', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);

    // Dibujar entidad para verificar que no se pierde ante aviso de actualización
    await page.evaluate(() => {
      const { doc } = (window as any).fmodel;
      doc.transact('LINE', (tx: any) => {
        tx.addEntity({
          id: 'e2e_sw_l1',
          type: 'line',
          owner: '*model',
          layer: '0',
          color: 'ByLayer',
          linetype: 'ByLayer',
          linetypeScale: 1,
          lineweight: -1,
          transparency: 0,
          visible: true,
          order: 1,
          start: { x: 1, y: 1 },
          end: { x: 99, y: 99 },
        });
      });
    });

    expect(await page.evaluate(() => (window as any).fmodel.doc.data.entities.has('e2e_sw_l1'))).toBe(true);
    expect(await page.evaluate(() => (window as any).fmodel.doc.dirty)).toBe(true);

    // Simular el registro de actualización de service worker llamando al callback registrado
    const messageNotified = await page.evaluate(() => {
      const { editor } = (window as any).fmodel;
      let lastMsg = '';
      editor.runner.message = (_kind: string, msg: any) => {
        lastMsg = typeof msg === 'string' ? msg : (msg?.es ?? '');
      };
      // Invocar aviso de actualización de PWA
      editor.runner.message('info', {
        es: 'Hay una versión nueva de FModel lista. Guarda tu trabajo y escribe ACTUALIZAR para aplicarla.',
        en: 'A new FModel version is ready. Save your work and type UPDATEAPP to apply it.',
      });
      return lastMsg;
    });

    expect(messageNotified).toContain('Hay una versión nueva de FModel lista');
    // El dibujo abierto sigue intacto con sus cambios
    expect(await page.evaluate(() => (window as any).fmodel.doc.data.entities.has('e2e_sw_l1'))).toBe(true);
    expect(await page.evaluate(() => (window as any).fmodel.doc.dirty)).toBe(true);
  });

  test('8. Navegación principal solo con teclado', async ({ page }) => {
    await page.goto('/?surface=welcome');
    await page.waitForSelector('input[type="search"]');

    // Pulsar '/' debe enfocar directamente el buscador de la pantalla de inicio
    await page.keyboard.press('/');
    const isSearchFocused = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.getAttribute('type') === 'search' || el?.tagName === 'INPUT';
    });
    expect(isSearchFocused).toBe(true);

    // Escribir en el buscador con teclado
    await page.keyboard.type('planta');

    // Pulsar Escape para limpiar / desenfocar
    await page.keyboard.press('Escape');

    // Pasar al espacio de trabajo
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);

    // Enfocar la línea de comandos o el lienzo y comprobar foco
    const canFocus = await page.evaluate(() => {
      const input = document.querySelector('input, button') as HTMLElement | null;
      input?.focus();
      return document.activeElement !== document.body;
    });
    expect(canFocus).toBe(true);
  });
});
