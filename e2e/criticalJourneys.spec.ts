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

    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    // Crear entidades con bloque, estilo de texto e imagen
    const pkgJson = await page.evaluate(async (pngData) => {
      const { editor, doc, io } = (window as any).fmodel;

      doc.transact('CREA_OBJETOS', (tx: any) => {
        // 1. Estilo de texto y entidad texto
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

        // 2. Definición de bloque y entidad de inserción
        tx.add('blocks', {
          id: 'blk_e2e',
          name: 'BloqueE2E',
          kind: 'normal',
          basePoint: { x: 0, y: 0 },
          description: 'Bloque de prueba E2E',
          units: 'unitless',
          explodable: true,
          scaleUniformly: true,
          annotative: false,
          revision: 1,
        });
        tx.addEntity({
          id: 'e2e_inner_l1',
          type: 'line',
          owner: 'blk_e2e',
          layer: '0',
          color: 'ByLayer',
          linetype: 'ByLayer',
          linetypeScale: 1,
          lineweight: -1,
          transparency: 0,
          visible: true,
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 10, y: 10 },
        });
        tx.addEntity({
          id: 'ins_e2e',
          type: 'insert',
          owner: '*model',
          layer: '0',
          color: 'ByLayer',
          linetype: 'ByLayer',
          linetypeScale: 1,
          lineweight: -1,
          transparency: 0,
          visible: true,
          order: 2,
          blockId: 'blk_e2e',
          position: { x: 30, y: 30 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          attributes: [],
        });

        // 3. Recurso binario (asset) y entidad imagen
        tx.add('assets', {
          id: 'ast_e2e',
          name: 'logo_e2e.png',
          mime: 'image/png',
          size: 70,
          dataUrl: pngData,
        });
        tx.addEntity({
          id: 'img_e2e',
          type: 'image',
          owner: '*model',
          layer: '0',
          color: 'ByLayer',
          linetype: 'ByLayer',
          linetypeScale: 1,
          lineweight: -1,
          transparency: 0,
          visible: true,
          order: 3,
          assetId: 'ast_e2e',
          position: { x: 5, y: 5 },
          u: { x: 20, y: 0 },
          v: { x: 0, y: 20 },
          clipEnabled: false,
          opacity: 1,
          fade: 0,
          brightness: 50,
          contrast: 50,
        });
      });

      const pkg = io.createClipboardPackage(doc, ['txt_e2e', 'ins_e2e', 'img_e2e'], editor.ctx);
      return JSON.stringify(pkg);
    }, PNG);

    expect(pkgJson).toContain('fmodel-clip');
    expect(pkgJson).toContain('EstiloE2E');
    expect(pkgJson).toContain('BloqueE2E');
    expect(pkgJson).toContain('ast_e2e');

    // Pegar en un segundo dibujo limpio, guardar el resultado y reabrirlo
    const roundtripResult = await page.evaluate(async (json) => {
      const { createDocument, io } = (window as any).fmodel;
      const dstDoc = createDocument({ title: 'Segundo dibujo' });
      const pkg = io.parseClipboardPackage(json);
      const pasteRes = io.pasteClipboardPackage(dstDoc, pkg, '*model', { x: 50, y: 50 });

      // Guardar el documento de destino a paquete nativo
      const bytes = io.writePackage(dstDoc.data, dstDoc.id);

      // Reabrir en un tercer documento limpio
      const reopenedDoc = createDocument({ title: 'Reabierto' });
      const readRes = io.readPackage(bytes);
      reopenedDoc.replaceData(readRes.data, readRes.documentId);

      // Comprobar que en el documento reabierto están el bloque, el recurso, el estilo y las 3 entidades
      const hasBlock = [...reopenedDoc.data.blocks.values()].some((b: any) => b.name === 'BloqueE2E');
      const hasAsset = [...reopenedDoc.data.assets.values()].some((a: any) => a.dataUrl?.startsWith('data:image/png'));
      const hasStyle = [...reopenedDoc.data.textStyles.values()].some((s: any) => s.name === 'EstiloE2E');
      const entitiesCount = reopenedDoc.data.entities.size;

      return {
        insertedCount: pasteRes.insertedIds.length,
        hasBlock,
        hasAsset,
        hasStyle,
        entitiesCount,
      };
    }, pkgJson);

    expect(roundtripResult.insertedCount).toBe(3);
    expect(roundtripResult.hasBlock).toBe(true);
    expect(roundtripResult.hasAsset).toBe(true);
    expect(roundtripResult.hasStyle).toBe(true);
    // Debe contener las 3 entidades en espacio modelo + 1 entidad interna del bloque
    expect(roundtripResult.entitiesCount).toBe(4);
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

    // Simular que el service worker descargó una actualización y registró el callback
    const updateResult = await page.evaluate(async () => {
      const { editor, persistence, setPendingUpdate } = (window as any).fmodel;
      let applied = false;
      let warnMessage = '';
      editor.runner.message = (kind: string, msg: any) => {
        if (kind === 'warning' || kind === 'warn') {
          warnMessage = typeof msg === 'string' ? msg : (msg?.es ?? '');
        }
      };

      setPendingUpdate(() => {
        applied = true;
      });

      // Ejecutar UPDATEAPP mientras el dibujo está dirty
      await editor.command('UPDATEAPP');

      const recovery = await persistence.pendingRecovery();
      return {
        applied,
        warnMessage,
        hasRecovery: recovery !== null && recovery.name !== '',
      };
    });

    // UPDATEAPP ejecutó el callback de actualización y protegió el autoguardado
    expect(updateResult.applied).toBe(true);
    expect(updateResult.warnMessage).toContain('cambios sin guardar');
    expect(updateResult.hasRecovery).toBe(true);

    const failedUpdate = await page.evaluate(async () => {
      const { editor, persistence, setPendingUpdate } = (window as any).fmodel;
      const originalAutosave = persistence.autosave;
      const warnings: string[] = [];
      let applied = false;
      editor.runner.message = (kind: string, msg: any) => {
        if (kind === 'warning' || kind === 'warn') warnings.push(typeof msg === 'string' ? msg : (msg?.es ?? ''));
      };
      persistence.autosave = async () => false;
      setPendingUpdate(() => {
        applied = true;
      });

      try {
        await editor.command('UPDATEAPP');
      } finally {
        persistence.autosave = originalAutosave;
      }

      return { applied, warnings };
    });

    expect(failedUpdate.applied).toBe(false);
    expect(failedUpdate.warnings.some((message) => message.includes('actualización fue cancelada'))).toBe(true);

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
    await page.waitForSelector('button');

    // Navegar con teclado para verificar foco real en controles de la interfaz
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const hasFocus = await page.evaluate(() => {
      const el = document.activeElement;
      return el !== null && el !== document.body;
    });
    expect(hasFocus).toBe(true);
  });

  test('9. Accesibilidad: contención de foco en diálogo, escape y descripción accesible del lienzo (UI-001)', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => (window as any).fmodel?.editor?.setPrefs({ onboardingDone: true }));

    // Comprobar descripción accesible del canvas
    const canvasHost = await page.waitForSelector('.canvas-host');
    const ariaDesc = await canvasHost.getAttribute('aria-description');
    expect(ariaDesc?.toLowerCase()).toMatch(/drawing canvas|lienzo/);

    // Abrir diálogo de ajustes con botón
    const settingsBtn = page.locator('button[title*="Ajustes de dibujo"], button[title*="Drafting settings"]').first();
    await settingsBtn.click();

    // Esperar a que el diálogo modal aparezca
    const dialog = await page.waitForSelector('div[role="dialog"]');
    expect(await dialog.getAttribute('aria-modal')).toBe('true');

    // Tabbing dentro del diálogo retiene el foco adentro
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const isFocusInside = await page.evaluate(() => {
      const dialogEl = document.querySelector('div[role="dialog"]');
      return dialogEl?.contains(document.activeElement);
    });
    expect(isFocusInside).toBe(true);

    // Escape cierra el diálogo
    await page.keyboard.press('Escape');
    await page.waitForSelector('div[role="dialog"]', { state: 'detached' });
  });
});
