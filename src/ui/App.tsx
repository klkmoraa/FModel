import { Moon, Redo2, Search, Sun, Undo2 } from 'lucide-react';
import { Onboarding } from './Onboarding';
import { comboOf } from './keys';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findCommand } from '../commands/registry';
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
import { Ribbon } from './Ribbon';
import { SpaceTabs } from './SpaceTabs';
import { StatusBar } from './StatusBar';
import { Docks } from './Docks';
import { Dialogs, type DialogState } from './Dialogs';

export function App({ editor }: { editor: Editor }) {
  useEditorEvents(editor, ['prefs', 'command', 'space']);
  const lang = editor.lang;
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = editor.prefs.theme === 'system' ? systemDark : editor.prefs.theme === 'noche';
  const theme = useMemo(() => themeFor(dark, editor.prefs.canvasBackground), [dark, editor.prefs.canvasBackground]);
  const [palette, setPalette] = useState(false);
  const [clean, setClean] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [mobileSheet, setMobileSheet] = useState<string | null>(null);
  const cmdRef = useRef<CommandLineHandle>(null);
  const dynRef = useRef<DynamicInputHandle>(null);
  const isMobile = useMediaQuery('(max-width: 820px)');

  useEffect(() => {
    document.documentElement.dataset.theme = editor.prefs.theme === 'system' ? '' : editor.prefs.theme;
    if (editor.prefs.theme === 'system') delete document.documentElement.dataset.theme;
    document.documentElement.lang = lang;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14171a' : '#f7f6f1');
  }, [editor.prefs.theme, lang, dark]);

  const openUi = useCallback((ui: string, cmd?: string, payload?: unknown) => {
    if (ui === 'clean-screen') {
      setClean((c) => !c);
      return;
    }
    if (ui.startsWith('panel:')) {
      if (isMobile) setMobileSheet(ui.slice(6));
      editor.emit('prefs');
      window.dispatchEvent(new CustomEvent('fmodel:panel', { detail: ui.slice(6) }));
      return;
    }
    setDialog({ id: ui, cmd, payload });
  }, [editor, isMobile]);

  // Los comandos con UI abren su panel o diálogo
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ ui: string; cmd?: string; payload?: unknown }>).detail;
      openUi(d.ui, d.cmd, d.payload);
    };
    window.addEventListener('fmodel:ui', handler);
    return () => window.removeEventListener('fmodel:ui', handler);
  }, [openUi]);

  const runCommand = useCallback((name: string, args?: string[]) => editor.command(name, args), [editor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      const combo = comboOf(e);
      if (combo === 'Ctrl+K' || (combo === 'Ctrl+Shift+P')) {
        e.preventDefault();
        setPalette(true);
        return;
      }
      if (palette || dialog || !editor.prefs.onboardingDone) return;
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
  }, [editor, palette, dialog, runCommand, openUi]);

  const toggleFullscreen = () => {
    setClean((c) => !c);
    try {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
      else void document.exitFullscreen?.();
    } catch {
      /* pantalla completa no disponible */
    }
  };

  const mobileTools = ['LINE', 'PLINE', 'CIRCLE', 'ARC', 'RECTANG', 'MOVE', 'COPY', 'TRIM', 'OFFSET', 'ERASE', 'DIMLINEAR', 'MTEXT', 'HATCH', 'U', 'REDO'];

  return (
    <div className={`app${clean ? ' app--clean' : ''}`} data-busy={editor.runner.busy || undefined}>
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div className="brand__name">
            <strong>FModel</strong>
            <small>2D CAD · FS-M01</small>
          </div>
        </div>
        <div className="doc-tabs">
          <span className="doc-tab is-active" title={editor.doc.settings.title}>
            {editor.doc.dirty && <span className="doc-tab__dirty" aria-label={lang === 'es' ? 'Cambios sin guardar' : 'Unsaved changes'} />}
            {editor.fileName || editor.doc.settings.title}
          </span>
        </div>
        <span className="topbar__spacer" />
        <button className="search-trigger" onClick={() => setPalette(true)} aria-label={lang === 'es' ? 'Buscar comandos' : 'Search commands'}>
          <Search size={15} />
          <span>{lang === 'es' ? 'Buscar comando o acción' : 'Search command or action'}</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button className="icon-btn" onClick={() => runCommand('U')} disabled={!editor.doc.history.canUndo()} title={lang === 'es' ? 'Deshacer (Ctrl+Z)' : 'Undo (Ctrl+Z)'}>
          <Undo2 size={17} />
        </button>
        <button className="icon-btn" onClick={() => runCommand('REDO')} disabled={!editor.doc.history.canRedo()} title={lang === 'es' ? 'Rehacer (Ctrl+Y)' : 'Redo (Ctrl+Y)'}>
          <Redo2 size={17} />
        </button>
        <button className="icon-btn" onClick={() => editor.setPrefs({ theme: dark ? 'dia' : 'noche' })} title={lang === 'es' ? 'Día / noche' : 'Day / night'}>
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button className="icon-btn" onClick={() => editor.setPrefs({ lang: lang === 'es' ? 'en' : 'es' })} title={lang === 'es' ? 'Cambiar a inglés' : 'Switch to Spanish'} style={{ font: '600 11px var(--fs-font-data)' }}>
          {lang.toUpperCase()}
        </button>
        <button className="icon-btn" onClick={() => openUi('file-menu')} title={lang === 'es' ? 'Archivo' : 'File'}>
          <CadIcon name="properties" size={18} />
        </button>
      </header>
      <Ribbon editor={editor} onUi={(ui, cmd) => openUi(ui, cmd)} />
      <main className="workspace">
        <Docks editor={editor} side="left" mobileSheet={mobileSheet} onCloseSheet={() => setMobileSheet(null)} onUi={openUi} />
        <section className="stage">
          <div className="stage__canvas">
            <CanvasView editor={editor} theme={theme} />
            <DynamicInput ref={dynRef} editor={editor} />
            <CommandLine ref={cmdRef} editor={editor} />
            <CyclingList editor={editor} />
          </div>
          <SpaceTabs editor={editor} onUi={openUi} />
        </section>
        <Docks editor={editor} side="right" mobileSheet={mobileSheet} onCloseSheet={() => setMobileSheet(null)} onUi={openUi} />
      </main>
      {isMobile ? (
        <nav className="mobile-tools" aria-label={lang === 'es' ? 'Herramientas' : 'Tools'}>
          {mobileTools.map((c) => {
            const def = findCommand(c);
            return (
              <button key={c} className="tool-lg" onClick={() => runCommand(c)}>
                <CadIcon name={def?.icon ?? 'properties'} size={20} />
                <span>{def?.label[lang] ?? c}</span>
              </button>
            );
          })}
          <button className="tool-lg" onClick={() => setMobileSheet('layers')}>
            <CadIcon name="layers" size={20} />
            <span>{lang === 'es' ? 'Capas' : 'Layers'}</span>
          </button>
          <button className="tool-lg" onClick={() => setMobileSheet('properties')}>
            <CadIcon name="properties" size={20} />
            <span>{lang === 'es' ? 'Propiedades' : 'Properties'}</span>
          </button>
        </nav>
      ) : (
        <StatusBar editor={editor} onOpenSettings={() => openUi('drafting-settings')} fullscreen={clean} onFullscreen={toggleFullscreen} />
      )}
      {palette && <CommandPalette editor={editor} onClose={() => setPalette(false)} onRun={(n) => runCommand(n)} />}
      <Dialogs editor={editor} state={dialog} onClose={() => setDialog(null)} onUi={openUi} />
      {!editor.prefs.onboardingDone && !dialog && <Onboarding editor={editor} />}
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
            <small style={{ marginLeft: 'auto', color: 'var(--ink-muted)' }}>{layer}</small>
          </button>
        );
      })}
    </div>
  );
}
