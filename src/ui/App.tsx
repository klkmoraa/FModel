import { Ellipsis, FolderOpen, Monitor, Moon, Redo2, Save, Search, Sun, TriangleAlert, Undo2 } from 'lucide-react';
import { QuickProperties } from './QuickProperties';
import { Onboarding } from './Onboarding';
import { EmptyCanvasHint } from './EmptyCanvasHint';
import { comboOf } from './keys';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Editor } from '../editor/editor';
import { themeFor } from '../render/theme';
import { CanvasView } from './CanvasView';
import type { CommandLineHandle } from './CommandLine';
import { CommandLine } from './CommandLine';
import { CommandPalette } from './CommandPalette';
import type { DynamicInputHandle } from './DynamicInput';
import { DynamicInput } from './DynamicInput';
import { useEditorEvents, useMediaQuery } from './hooks';
import { BrandMark, CadIcon } from './icons';
import { SpaceTabs } from './SpaceTabs';
import { StatusBar } from './StatusBar';
import { Docks, FloatingPanel } from './Docks';
import { Dialogs, type DialogState } from './Dialogs';
import { TouchHud } from './TouchHud';
import { AppMenuSheet, PanelSheet, PhoneContext, PhoneDock, PrecisionSheet, type PhoneSheet } from './phone/PhoneChrome';
import { PHONE_QUERY, TOUCH_QUERY } from './layoutMode';
import { TaskStatus } from './TaskStatus';
import { getServices, hasServices } from '../app/services';
import type { PersistenceHealth } from '../storage/persistence';
import { WelcomeScreen } from './welcome/WelcomeScreen';
import { ConfirmHost } from './ConfirmHost';
import { PrecisionDeck, ToolDeck } from './PrecisionDeck';
import { isWorkspacePanelId, type WorkspacePanelId } from '../editor/workspaceChrome';

export function App({ editor }: { editor: Editor }) {
  useEditorEvents(editor, ['prefs', 'command', 'space']);
  const lang = editor.lang;
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = editor.prefs.theme === 'system' ? systemDark : editor.prefs.theme === 'noche';
  const theme = useMemo(() => themeFor(dark, editor.prefs.canvasBackground), [dark, editor.prefs.canvasBackground]);
  const [palette, setPalette] = useState(false);
  const [clean, setClean] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);
  // teléfono: una hoja inferior a la vez (precisión, paneles o menú) y el panel elegido en la hoja de paneles
  const [phoneSheet, setPhoneSheet] = useState<PhoneSheet | null>(null);
  const [phonePanel, setPhonePanel] = useState<WorkspacePanelId>('properties');
  const [floatingPanel, setFloatingPanel] = useState<string | null>(null);
  const [deckOpen, setDeckOpen] = useState(false);
  const floatingPanelReturnFocusRef = useRef<HTMLElement | null>(null);
  // en el teléfono la línea de comandos solo ocupa lienzo cuando hace falta: con comando en marcha o al pedirla
  const [cmdOpen, setCmdOpen] = useState(false);
  const cmdRef = useRef<CommandLineHandle>(null);
  const dynRef = useRef<DynamicInputHandle>(null);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const touch = useMediaQuery(TOUCH_QUERY);
  const persistence = hasServices() ? getServices().persistence : null;
  const [health, setHealth] = useState<PersistenceHealth | null>(() => persistence?.health ?? null);
  useEffect(() => {
    if (!persistence) return;
    return persistence.onHealthChange(setHealth);
  }, [persistence]);
  const [surface, setSurface] = useState<'welcome' | 'workspace'>(() => {
    if (typeof window === 'undefined') return 'workspace';
    const param = new URLSearchParams(window.location.search).get('surface');
    if (param === 'workspace') return 'workspace';
    if (param === 'welcome') return 'welcome';
    return 'welcome';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (surface === 'welcome') {
      url.searchParams.delete('surface');
    } else {
      url.searchParams.set('surface', 'workspace');
    }
    window.history.replaceState(null, '', url);
  }, [surface]);

  useEffect(() => {
    document.documentElement.dataset.theme = editor.prefs.theme === 'system' ? '' : editor.prefs.theme;
    if (editor.prefs.theme === 'system') delete document.documentElement.dataset.theme;
    document.documentElement.lang = lang;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14171a' : '#f7f6f1');
  }, [editor.prefs.theme, lang, dark]);

  const openUi = useCallback((ui: string, cmd?: string, payload?: unknown) => {
    if (ui === 'welcome') {
      setSurface('welcome');
      return;
    }
    if (ui === 'workspace') {
      setSurface('workspace');
      return;
    }
    if (ui === 'clean-screen') {
      setClean((c) => !c);
      return;
    }
    if (ui.startsWith('panel:')) {
      const id = ui.slice(6);
      if (isPhone) {
        setDeckOpen(false);
        if (isWorkspacePanelId(id)) setPhonePanel(id);
        setPhoneSheet('panels');
        return;
      }
      setDeckOpen(false);
      setPalette(false);
      if (isWorkspacePanelId(id) && editor.prefs.panels.floating.includes(id)) {
        floatingPanelReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setFloatingPanel((current) => (current === id ? null : id));
        return;
      }
      window.dispatchEvent(new CustomEvent('fmodel:panel', { detail: id }));
      return;
    }
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!active?.closest('[role="dialog"][aria-modal="true"]')) dialogReturnFocusRef.current = active;
    setDeckOpen(false);
    setFloatingPanel(null);
    setPhoneSheet(null);
    setDialog({ id: ui, cmd, payload });
  }, [editor, isPhone]);

  // Los comandos con UI abren su panel o diálogo
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<unknown>).detail;
      if (!d || typeof d !== 'object' || typeof (d as { ui?: unknown }).ui !== 'string') return;
      const request = d as { ui: string; cmd?: unknown; payload?: unknown };
      openUi(request.ui, typeof request.cmd === 'string' ? request.cmd : undefined, request.payload);
    };
    window.addEventListener('fmodel:ui', handler);
    return () => window.removeEventListener('fmodel:ui', handler);
  }, [openUi]);

  const runCommand = useCallback((name: string, args?: string[]) => editor.command(name, args), [editor]);
  const closeFloatingPanel = useCallback((restoreFocus = true) => {
    setFloatingPanel(null);
    if (restoreFocus) requestAnimationFrame(() => floatingPanelReturnFocusRef.current?.focus());
  }, []);
  const changeDeckOpen = useCallback((next: boolean) => {
    setDeckOpen(next);
    if (next) {
      setFloatingPanel(null);
      setPalette(false);
      setPhoneSheet(null);
    }
  }, []);
  const changePhoneSheet = useCallback((next: PhoneSheet | null) => {
    setPhoneSheet(next);
    if (next) setDeckOpen(false);
  }, []);
  const openKeyboard = useCallback(() => {
    setPhoneSheet(null);
    setCmdOpen(true);
    requestAnimationFrame(() => cmdRef.current?.focus());
  }, []);
  const openPalette = useCallback(() => {
    setDeckOpen(false);
    setFloatingPanel(null);
    setPhoneSheet(null);
    setPalette(true);
  }, []);
  const cycleTheme = useCallback(() => {
    const next = editor.prefs.theme === 'system' ? 'dia' : editor.prefs.theme === 'dia' ? 'noche' : 'system';
    editor.setPrefs({ theme: next });
  }, [editor]);
  const themeTitle =
    lang === 'es'
      ? editor.prefs.theme === 'system'
        ? 'Tema automático · cambiar a claro'
        : editor.prefs.theme === 'dia'
          ? 'Tema claro · cambiar a oscuro'
          : 'Tema oscuro · cambiar a automático'
      : editor.prefs.theme === 'system'
        ? 'Automatic theme · switch to light'
        : editor.prefs.theme === 'dia'
          ? 'Light theme · switch to dark'
          : 'Dark theme · switch to automatic';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      const combo = comboOf(e);
      if (palette || dialog || !editor.prefs.onboardingDone) return;
      if (combo === 'Ctrl+K' || combo === 'Ctrl+Shift+P') {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.key === 'Escape' && floatingPanel) {
        closeFloatingPanel();
        return;
      }
      if (e.key === 'Escape' && phoneSheet) {
        setPhoneSheet(null);
        return;
      }
      if (inField && !target.classList.contains('cmdline__input')) return;
      editor.shiftDown = e.shiftKey;
      // atajos configurables
      const sc = editor.prefs.shortcuts[combo];
      if (sc && (e.ctrlKey || e.metaKey || e.key.startsWith('F') || e.key === 'Delete')) {
        if (!(inField && e.key === 'Delete')) {
          e.preventDefault();
          if (sc === 'PROPERTIES') openUi('panel:properties');
          else if (sc === 'TOOLPALETTES') openUi('panel:palettes');
          else runCommand(sc);
          return;
        }
      }
      if (inField) return;
      if (dynRef.current?.key(e)) {
        e.preventDefault();
        return;
      }
      if (['Escape', 'Enter', ' ', 'Tab'].includes(e.key)) {
        if (editor.key(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey })) e.preventDefault();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        cmdRef.current?.focus(e.key);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      editor.shiftDown = e.shiftKey;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, [editor, palette, dialog, runCommand, openUi, floatingPanel, closeFloatingPanel, openPalette, phoneSheet]);

  const toggleFullscreen = () => {
    setClean((c) => !c);
    try {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
      else void document.exitFullscreen?.();
    } catch {
      /* pantalla completa no disponible */
    }
  };

  if (surface === 'welcome') {
    return (
      <>
        <WelcomeScreen editor={editor} dark={dark} onOpenWorkspace={() => setSurface('workspace')} />
        <ConfirmHost lang={lang} />
      </>
    );
  }

  const healthWarning = health && health.status !== 'protected' ? health : null;
  const healthTitle = healthWarning
    ? healthWarning.status === 'unavailable'
      ? lang === 'es'
        ? 'IndexedDB no disponible: los cambios no se guardan automáticamente.'
        : 'IndexedDB unavailable: changes are not autosaved.'
      : lang === 'es'
        ? `Almacenamiento degradado (${healthWarning.lastError?.message ?? 'error'}). Toca para ver versiones o liberar espacio.`
        : `Storage degraded (${healthWarning.lastError?.message ?? 'error'}). Tap to view versions or free space.`
    : '';

  return (
    <div className={`app${clean ? ' app--clean' : ''}${isPhone ? ' app--phone' : ''}${touch ? ' app--touch' : ''}`} data-busy={editor.runner.busy || undefined}>
      <header className="topbar">
        <button
          type="button"
          className="brand brand--btn"
          onClick={() => setSurface('welcome')}
          title={lang === 'es' ? 'Ir al inicio (HOME)' : 'Go to Home (HOME)'}
        >
          <BrandMark />
          <div className="brand__name">
            <strong>FModel</strong>
            <small>2D CAD · FS-M01</small>
          </div>
        </button>
        <div className="doc-tabs">
          <span className="doc-tab is-active" title={editor.doc.settings.title}>
            {editor.doc.dirty && <span className="doc-tab__dirty" aria-label={lang === 'es' ? 'Cambios sin guardar' : 'Unsaved changes'} />}
            <span className="doc-tab__name">{editor.fileName || editor.doc.settings.title}</span>
          </span>
        </div>
        <span className="topbar__spacer" />
        {!isPhone && (
          <button className="search-trigger" onClick={openPalette} aria-label={lang === 'es' ? 'Buscar comandos' : 'Search commands'}>
            <Search size={15} />
            <span>{lang === 'es' ? 'Buscar comando o acción' : 'Search command or action'}</span>
            <kbd>Ctrl K</kbd>
          </button>
        )}
        <nav className="topbar__actions" aria-label={lang === 'es' ? 'Acciones del dibujo' : 'Drawing actions'}>
          {isPhone && healthWarning && (
            <button className="icon-btn topbar__warn" onClick={() => openUi('versions')} title={healthTitle} aria-label={healthTitle}>
              <TriangleAlert size={17} />
            </button>
          )}
          <button
            className={`icon-btn${editor.doc.dirty ? ' has-dirty' : ''}`}
            onClick={() => runCommand('QSAVE')}
            title={editor.doc.dirty ? (lang === 'es' ? 'Guardar cambios (Ctrl+S)' : 'Save changes (Ctrl+S)') : lang === 'es' ? 'Guardar (Ctrl+S) · sin cambios pendientes' : 'Save (Ctrl+S) · no pending changes'}
            aria-label={editor.doc.dirty ? (lang === 'es' ? 'Guardar: hay cambios sin guardar' : 'Save: there are unsaved changes') : lang === 'es' ? 'Guardar' : 'Save'}
          >
            <Save size={17} />
          </button>
          <button className="icon-btn" onClick={() => runCommand('U')} disabled={!editor.doc.history.canUndo()} title={lang === 'es' ? 'Deshacer (Ctrl+Z)' : 'Undo (Ctrl+Z)'} aria-label={lang === 'es' ? 'Deshacer' : 'Undo'}>
            <Undo2 size={17} />
          </button>
          <button className="icon-btn" onClick={() => runCommand('REDO')} disabled={!editor.doc.history.canRedo()} title={lang === 'es' ? 'Rehacer (Ctrl+Y)' : 'Redo (Ctrl+Y)'} aria-label={lang === 'es' ? 'Rehacer' : 'Redo'}>
            <Redo2 size={17} />
          </button>
          {isPhone ? (
            <button className={`icon-btn${phoneSheet === 'menu' ? ' is-active' : ''}`} onClick={() => changePhoneSheet(phoneSheet === 'menu' ? null : 'menu')} aria-expanded={phoneSheet === 'menu'} aria-label={lang === 'es' ? 'Menú: archivo, buscar, tema, idioma y ayuda' : 'Menu: file, search, theme, language and help'} title={lang === 'es' ? 'Menú' : 'Menu'}>
              <Ellipsis size={18} />
            </button>
          ) : (
            <>
              <button className="icon-btn" onClick={cycleTheme} title={themeTitle} aria-label={themeTitle}>
                {editor.prefs.theme === 'system' ? <Monitor size={17} /> : dark ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              {/* el botón muestra el idioma al que se cambia, igual que en el Inicio */}
              <button className="icon-btn topbar__lang" onClick={() => editor.setPrefs({ lang: lang === 'es' ? 'en' : 'es' })} title={lang === 'es' ? 'Cambiar a inglés' : 'Switch to Spanish'} aria-label={lang === 'es' ? 'Cambiar a inglés' : 'Switch to Spanish'}>
                {lang === 'es' ? 'EN' : 'ES'}
              </button>
              <button className="btn btn--sm btn--ghost topbar__file" onClick={() => openUi('file-menu')} title={lang === 'es' ? 'Archivo: abrir, guardar, importar y exportar' : 'File: open, save, import and export'} aria-label={lang === 'es' ? 'Archivo' : 'File'}>
                <FolderOpen size={16} />
                <span>{lang === 'es' ? 'Archivo' : 'File'}</span>
              </button>
            </>
          )}
        </nav>
      </header>
      <main className="workspace">
        {!isPhone && <Docks editor={editor} side="left" onUi={openUi} />}
        <section className="stage">
          <div className={`stage__canvas${isPhone && !cmdOpen ? ' stage__canvas--nocmd' : ''}${deckOpen && !editor.runner.pending ? ' stage__canvas--deck-open' : ''}`}>
            <CanvasView editor={editor} theme={theme} />
            <DynamicInput ref={dynRef} editor={editor} />
            <CommandLine ref={cmdRef} editor={editor} compact={isPhone} onDismiss={isPhone ? () => setCmdOpen(false) : undefined} />
            {editor.prefs.onboardingDone && <EmptyCanvasHint editor={editor} touch={touch} />}
            <CyclingList editor={editor} />
            {!isPhone && <QuickProperties editor={editor} onMore={() => openUi('panel:properties')} />}
            {!isPhone && <PrecisionDeck editor={editor} open={deckOpen} onOpenChange={changeDeckOpen} onUi={openUi} onRun={runCommand} onOpenPalette={openPalette} activePanel={floatingPanel} touch={touch} />}
            {isPhone && (
              <div className="phone-bottom">
                <div className="phone-tasks">
                  <TaskStatus lang={lang} />
                </div>
                <PhoneContext editor={editor} onKeyboard={openKeyboard} onUi={openUi} />
                <PhoneDock editor={editor} deckOpen={deckOpen} onToggleDeck={() => changeDeckOpen(!deckOpen)} sheet={phoneSheet} onSheet={changePhoneSheet} />
              </div>
            )}
            {touch && <TouchHud editor={editor} />}
          </div>
          <SpaceTabs editor={editor} onUi={openUi} />
          {!isPhone && <FloatingPanel editor={editor} panelId={floatingPanel} onClose={closeFloatingPanel} onUi={openUi} />}
        </section>
        {!isPhone && <Docks editor={editor} side="right" onUi={openUi} />}
      </main>
      {!isPhone && <StatusBar editor={editor} onOpenSettings={() => openUi('drafting-settings')} fullscreen={clean} onFullscreen={toggleFullscreen} />}
      {isPhone && deckOpen && (
        <ToolDeck
          editor={editor}
          variant="sheet"
          touch
          onClose={() => setDeckOpen(false)}
          onRun={(name, args) => {
            setDeckOpen(false);
            runCommand(name, args);
          }}
        />
      )}
      {isPhone && phoneSheet === 'precision' && <PrecisionSheet editor={editor} onClose={() => setPhoneSheet(null)} onUi={openUi} />}
      {isPhone && phoneSheet === 'panels' && <PanelSheet editor={editor} panel={phonePanel} onPanel={setPhonePanel} onClose={() => setPhoneSheet(null)} onUi={openUi} />}
      {isPhone && phoneSheet === 'menu' && <AppMenuSheet editor={editor} onClose={() => setPhoneSheet(null)} onUi={openUi} onPalette={openPalette} onHome={() => setSurface('welcome')} onKeyboard={openKeyboard} />}
      {palette && <CommandPalette editor={editor} onClose={() => setPalette(false)} onRun={(n) => runCommand(n)} />}
      <Dialogs editor={editor} state={dialog} returnFocusRef={dialogReturnFocusRef} onClose={() => setDialog(null)} onUi={openUi} />
      {!editor.prefs.onboardingDone && !dialog && <Onboarding editor={editor} />}
      <ConfirmHost lang={lang} />
    </div>
  );
}

function CyclingList({ editor }: { editor: Editor }) {
  useEditorEvents(editor, ['overlay']);
  const c = editor.cycling;
  if (!c || c.hits.length < 2) return null;
  const lang = editor.lang;
  return (
    <div className="popover" style={{ left: c.screen.x + 16, top: c.screen.y + 16 }} role="listbox" aria-label={lang === 'es' ? 'Ciclo de selección' : 'Selection cycling'}>
      <div className="eyebrow" style={{ padding: '4px 8px' }}>
        {lang === 'es' ? 'Objetos superpuestos' : 'Overlapping objects'}
      </div>
      {c.hits.map((id, i) => {
        const e = editor.doc.entity(id);
        const layer = e ? editor.doc.data.layers.get(e.layer)?.name : '';
        return (
          <button key={id} className={`menu-item${i === c.index ? ' is-active' : ''}`} onMouseEnter={() => { editor.hover.entityId = id; editor.emit('overlay'); }} onClick={() => editor.chooseCycled(id)}>
            <CadIcon name={e?.type === 'lwpolyline' ? 'pline' : e?.type === 'insert' ? 'block' : (e?.type ?? 'line')} size={15} />
            <span>{e?.type}</span>
            <small style={{ marginLeft: 'auto', color: 'var(--ink-secondary)' }}>{layer}</small>
          </button>
        );
      })}
    </div>
  );
}
