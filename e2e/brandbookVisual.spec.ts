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

  test('el chrome superior y las pestañas de espacio no compiten con el lienzo', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => {
      (window as any).fmodel.editor.setPrefs({ onboardingDone: true, theme: 'dia' });
    });

    const chrome = await page.locator('.topbar').evaluate((element) => ({
      shadow: getComputedStyle(element).boxShadow,
      searchShadow: getComputedStyle(element.querySelector('.search-trigger')!).boxShadow,
      actionsShadow: getComputedStyle(element.querySelector('.topbar__actions')!).boxShadow,
    }));
    expect(chrome.shadow).toBe('none');
    expect(chrome.searchShadow).toBe('none');
    expect(chrome.actionsShadow).toBe('none');

    const activeSpace = page.locator('.space-tab.is-active');
    await expect(activeSpace).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(activeSpace).toHaveCSS('box-shadow', 'none');
  });

  test('el comando activo usa violeta de Modelo y no el rojo de error', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => {
      (window as any).fmodel.editor.setPrefs({ onboardingDone: true, theme: 'dia' });
    });

    await page.getByRole('button', { name: /Abrir todas las herramientas|Open all tools/ }).click();
    const deck = page.getByRole('dialog', { name: /Biblioteca de herramientas|Tool library/ });
    await deck.getByRole('button', { name: /Línea LINE|Line LINE/, exact: true }).click();

    const state = await page.locator('.precision-dock__context').evaluate((element) => ({
      active: element.classList.contains('is-command-active'),
      color: getComputedStyle(element).color,
      interaction: getComputedStyle(document.documentElement).getPropertyValue('--fs-interaction-text').trim(),
      danger: getComputedStyle(document.documentElement).getPropertyValue('--fm-danger').trim(),
    }));
    expect(state.active).toBe(true);
    expect(state.interaction).toBe('#5b3fc0');
    expect(state.danger).toBe('#c9362f');
    expect(state.color).toBe('rgb(91, 63, 192)');
  });

  test('el dock de precisión es una sola barra continua, no una fila de tarjetas', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => {
      (window as any).fmodel.editor.setPrefs({ onboardingDone: true, theme: 'dia' });
    });

    const rail = page.locator('.precision-dock');
    await expect(rail).toBeVisible();

    const railMaterial = await rail.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, shadow: style.boxShadow };
    });
    expect(railMaterial.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(railMaterial.shadow).not.toBe('none');

    const toolMaterial = await rail.locator('.precision-dock__tool').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, shadow: style.boxShadow };
    });
    expect(toolMaterial.background).toBe('rgba(0, 0, 0, 0)');
    expect(toolMaterial.shadow).toBe('none');

    const [selectionBox, launcherBox] = await Promise.all([
      rail.locator('.precision-dock__context').boundingBox(),
      rail.locator('.precision-dock__launcher').boundingBox(),
    ]);
    expect(selectionBox).not.toBeNull();
    expect(launcherBox).not.toBeNull();
    expect(selectionBox!.x).toBeLessThan(launcherBox!.x);
  });

  test('los inspectores flotan como una superficie compacta y no como otra columna fija', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => {
      (window as any).fmodel.editor.setPrefs({ onboardingDone: true, theme: 'dia' });
    });

    await page.locator('.precision-dock').getByRole('button', { name: /Propiedades|Properties/, exact: true }).click();
    const panel = page.locator('.floating-panel');
    await expect(panel).toBeVisible();
    await expect(page.locator('.dock--right')).toHaveCount(0);
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.width).toBeLessThanOrEqual(380);
    expect(panelBox!.height).toBeLessThanOrEqual(620);
    expect(panelBox!.x).toBeGreaterThan(0);
    expect(panelBox!.y).toBeGreaterThan(0);

    const panelAction = panel.locator('.icon-btn').first();
    const panelMaterial = await panelAction.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, shadow: style.boxShadow };
    });
    expect(panelMaterial.background).toBe('rgba(0, 0, 0, 0)');
    expect(panelMaterial.shadow).toBe('none');

    const sectionMaterial = await panel.locator('.section').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { left: style.borderLeftStyle, right: style.borderRightStyle, shadow: style.boxShadow };
    });
    expect(sectionMaterial.left).toBe('none');
    expect(sectionMaterial.right).toBe('none');
    expect(sectionMaterial.shadow).toBe('none');

    await page.locator('.precision-dock').getByRole('button', { name: /Capas|Layers/, exact: true }).click();
    await expect(panel).toContainText(/Capas|Layers/);
    const layersBox = await panel.boundingBox();
    expect(layersBox).not.toBeNull();
    expect(layersBox!.height).toBeLessThanOrEqual(430);

    await page.locator('.precision-dock').getByRole('button', { name: /Paletas|Palettes/, exact: true }).click();
    const tabs = panel.locator('.panel-tabs');
    await expect(tabs).toBeVisible();
    const tabMaterial = await tabs.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(tabMaterial).not.toBe('rgba(0, 0, 0, 0)');
    const inactiveTab = tabs.locator('.btn:not(.btn--accent)').first();
    await expect(inactiveTab).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');

    const statusAction = page.locator('button.status-toggle:not(.is-on):not(.is-warn)').first();
    const statusMaterial = await statusAction.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderColor, shadow: style.boxShadow };
    });
    expect(statusMaterial.background).toBe('rgba(0, 0, 0, 0)');
    expect(statusMaterial.border).toBe('rgba(0, 0, 0, 0)');
    expect(statusMaterial.shadow).toBe('none');

    const railAction = page.locator('.topbar__actions .icon-btn').first();
    const railMaterial = await railAction.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, shadow: style.boxShadow };
    });
    expect(railMaterial.background).toBe('rgba(0, 0, 0, 0)');
    expect(railMaterial.shadow).toBe('none');
  });

  test('la línea CAD se retrae al estar lista y se expande sólo al pedir entrada', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => {
      (window as any).fmodel.editor.setPrefs({ onboardingDone: true, theme: 'dia' });
    });

    const commandLine = page.locator('.cmdline');
    await expect(commandLine).toHaveClass(/cmdline--idle/);
    const resting = await commandLine.boundingBox();
    expect(resting).not.toBeNull();
    expect(resting!.width).toBeLessThanOrEqual(500);

    await commandLine.getByRole('textbox', { name: /Línea de comandos|Command line/ }).focus();
    await expect(commandLine).toHaveClass(/cmdline--idle/);
    await expect.poll(async () => (await commandLine.boundingBox())?.width ?? 0).toBeGreaterThan(resting!.width + 120);
  });

  test('la biblioteca de herramientas se abre como una bandeja inferior compacta', async ({ page }) => {
    await page.goto('/?surface=workspace');
    await page.waitForFunction(() => !!(window as any).fmodel?.editor);
    await page.evaluate(() => {
      (window as any).fmodel.editor.setPrefs({ onboardingDone: true, theme: 'dia' });
    });

    await page.getByRole('button', { name: /Abrir todas las herramientas|Open all tools/ }).click();
    const deck = page.locator('.tool-deck');
    await expect(deck).toBeVisible();
    const box = await deck.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(380);
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
        await expect(page.locator('.precision-dock')).toHaveCount(0);
        await expect(page.locator('.statusbar')).toBeHidden();
        await expect(page.locator('.mbar')).toBeVisible();
      } else {
        await expect(page.locator('.ribbon')).toHaveCount(0);
        await expect(page.getByRole('navigation', { name: /Herramientas de precisión|Precision tools/ })).toBeVisible();
        await expect(page.locator('.statusbar')).toBeVisible();
        await expect(page.locator('.mbar')).toHaveCount(0);
      }
    });
  }
});
