import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pin, PinOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import { useEditorEvents, useMediaQuery } from './hooks';
import { CadIcon } from './icons';
import { LayersPanel } from './panels/LayersPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { BlocksPanel } from './panels/BlocksPanel';
import { ToolPalettesPanel } from './panels/ToolPalettesPanel';
import { BlockAuthoringPanel } from './panels/BlockAuthoringPanel';
import { ParametersPanel } from './panels/ParametersPanel';
import { tr } from './controls';
import { isWorkspacePanelId, normalizeDockWidth, setPanelFloating, type WorkspacePanelId } from '../editor/workspaceChrome';

export const PANELS: Record<string, { icon: string; label: { es: string; en: string }; render: (editor: Editor, onUi: (ui: string, cmd?: string) => void) => React.ReactNode }> = {
  properties: { icon: 'properties', label: { es: 'Propiedades', en: 'Properties' }, render: (e) => <PropertiesPanel editor={e} /> },
  layers: { icon: 'layers', label: { es: 'Capas', en: 'Layers' }, render: (e) => <LayersPanel editor={e} /> },
  blocks: { icon: 'block', label: { es: 'Bloques', en: 'Blocks' }, render: (e, onUi) => <BlocksPanel editor={e} onUi={onUi} /> },
  palettes: { icon: 'palettes', label: { es: 'Paletas', en: 'Palettes' }, render: (e) => <ToolPalettesPanel editor={e} /> },
  authoring: { icon: 'dynblock', label: { es: 'Autoría', en: 'Authoring' }, render: (e) => <BlockAuthoringPanel editor={e} /> },
  parameters: { icon: 'constraint', label: { es: 'Parámetros', en: 'Parameters' }, render: (e) => <ParametersPanel editor={e} /> },
};

/** Paneles de un lado; «Autoría» solo existe durante una sesión del Editor de bloques. */
function dockPanels(editor: Editor, side: 'left' | 'right', includeFloating = false): WorkspacePanelId[] {
  const { left, right } = editor.prefs.panels;
  const list = (side === 'left' ? left : right).filter((panel) => (includeFloating || !editor.prefs.panels.floating.includes(panel)) && (panel !== 'authoring' || editor.blockEdit));
  if (editor.blockEdit && side === 'right' && ![...left, ...right].includes('authoring')) return ['authoring', ...list];
  return list;
}

export function Docks({ editor, side, mobileSheet, onCloseSheet, onUi }: { editor: Editor; side: 'left' | 'right'; mobileSheet: string | null; onCloseSheet: () => void; onUi: (ui: string, cmd?: string) => void }) {
  useEditorEvents(editor, ['prefs', 'space']);
  const lang = editor.lang;
  const isMobile = useMediaQuery('(max-width: 820px)');
  const panels = dockPanels(editor, side, isMobile);
  const editing = !!editor.blockEdit;
  const [active, setActive] = useState<string>(panels[0] ?? '');
  const defaultWidth = side === 'right' ? 340 : 260;
  const [width, setWidth] = useState(() => {
    try {
      return normalizeDockWidth(localStorage.getItem(`fmodel.dock.${side}`), defaultWidth);
    } catch {
      return defaultWidth;
    }
  });
  const collapsed = editor.prefs.panels.collapsed.includes(side);
  const drag = useRef<{ x: number; w: number; current: number } | null>(null);
  const setDockWidth = (next: number) => {
    const value = normalizeDockWidth(next, defaultWidth);
    setWidth(value);
    try {
      localStorage.setItem(`fmodel.dock.${side}`, String(value));
    } catch {
      /* sin almacenamiento */
    }
  };

  useEffect(() => {
    const onPanel = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (isWorkspacePanelId(id) && panels.includes(id)) {
        setActive(id);
        if (collapsed) editor.setPrefs({ panels: { ...editor.prefs.panels, collapsed: editor.prefs.panels.collapsed.filter((c) => c !== side) } });
      }
    };
    window.addEventListener('fmodel:panel', onPanel);
    return () => window.removeEventListener('fmodel:panel', onPanel);
  }, [panels, collapsed, editor, side]);

  // al abrir el Editor de bloques se muestra la autoría en el lado donde viva
  useEffect(() => {
    if (!editing || !dockPanels(editor, side, isMobile).includes('authoring')) return;
    setActive('authoring');
    if (editor.prefs.panels.collapsed.includes(side)) editor.setPrefs({ panels: { ...editor.prefs.panels, collapsed: editor.prefs.panels.collapsed.filter((c) => c !== side) } });
  }, [editing, editor, isMobile, side]);

  const sheetPanel = isMobile && mobileSheet && isWorkspacePanelId(mobileSheet) && panels.includes(mobileSheet) ? mobileSheet : null;
  if (isMobile && !sheetPanel) return null;
  if (!panels.length) return null;
  const shown: WorkspacePanelId = sheetPanel ?? (isWorkspacePanelId(active) && panels.includes(active) ? active : panels[0]);

  const toggleCollapse = () => {
    const c = editor.prefs.panels.collapsed;
    editor.setPrefs({ panels: { ...editor.prefs.panels, collapsed: collapsed ? c.filter((x) => x !== side) : [...c, side] } });
  };

  const moveTo = (id: WorkspacePanelId) => {
    const other = side === 'left' ? 'right' : 'left';
    const p = editor.prefs.panels;
    editor.setPrefs({ panels: { ...p, [side]: p[side].filter((x) => x !== id), [other]: [...p[other], id] } });
  };

  const floatPanel = (id: WorkspacePanelId) => {
    editor.setPrefs({ panels: setPanelFloating(editor.prefs.panels, id, true) });
    onUi(`panel:${id}`);
  };

  return (
    <aside className={`dock dock--${side}${collapsed && !sheetPanel ? ' dock--collapsed' : ''}${sheetPanel ? ' is-sheet' : ''}`} style={{ width: sheetPanel ? undefined : width }} aria-label={tr(lang, side === 'left' ? 'Panel izquierdo' : 'Panel derecho', side === 'left' ? 'Left dock' : 'Right dock')}>
      {!sheetPanel && (
        <div
          className="dock__resize"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, w: width, current: width };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = e.clientX - drag.current.x;
            const w = Math.max(200, Math.min(720, drag.current.w + (side === 'left' ? dx : -dx)));
            drag.current.current = w;
            setWidth(w);
          }}
          onPointerUp={() => {
            const value = drag.current?.current ?? width;
            drag.current = null;
            setDockWidth(value);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 40 : 10;
            const next = e.key === 'ArrowRight' ? width + step : e.key === 'ArrowLeft' ? width - step : e.key === 'Home' ? 200 : e.key === 'End' ? 720 : null;
            if (next === null) return;
            e.preventDefault();
            setDockWidth(next);
          }}
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          aria-label={tr(lang, `Redimensionar panel ${side === 'left' ? 'izquierdo' : 'derecho'}`, `Resize ${side} dock`)}
          aria-valuemin={200}
          aria-valuemax={720}
          aria-valuenow={Math.round(width)}
          aria-valuetext={tr(lang, `${Math.round(width)} píxeles`, `${Math.round(width)} pixels`)}
        />
      )}
      <div className="dock__tabs">
        <div className="dock__tab-list" role="tablist">
          {(sheetPanel ? [sheetPanel] : panels).map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={shown === id}
              className={`dock__tab${shown === id ? ' is-active' : ''}`}
              onClick={() => {
                setActive(id);
                if (collapsed) toggleCollapse();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                moveTo(id);
              }}
              title={tr(lang, `${PANELS[id].label.es} · clic derecho: mover al otro lado`, `${PANELS[id].label.en} · right-click: move to other side`)}
            >
              <CadIcon name={PANELS[id].icon} size={15} />
              <span>{PANELS[id].label[lang]}</span>
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {sheetPanel ? (
          <button className="icon-btn" onClick={onCloseSheet} aria-label={tr(lang, 'Cerrar', 'Close')}>
            <X size={16} />
          </button>
        ) : (
          <>
            <button className="icon-btn" onClick={() => floatPanel(shown)} title={tr(lang, 'Convertir en panel flotante', 'Make panel floating')} aria-label={tr(lang, `Hacer flotante ${PANELS[shown].label.es}`, `Float ${PANELS[shown].label.en}`)}>
              <PinOff size={15} />
            </button>
            <button className="icon-btn" onClick={toggleCollapse} aria-label={tr(lang, collapsed ? 'Expandir panel' : 'Contraer panel', collapsed ? 'Expand dock' : 'Collapse dock')}>
              {side === 'left' ? collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} /> : collapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
            </button>
          </>
        )}
      </div>
      <div className="dock__body" role="tabpanel">
        {PANELS[shown]?.render(editor, onUi)}
      </div>
    </aside>
  );
}

export function FloatingPanel({ editor, panelId, onClose, onUi }: { editor: Editor; panelId: string | null; onClose: () => void; onUi: (ui: string, cmd?: string) => void }) {
  useEditorEvents(editor, ['prefs', 'space']);
  if (!panelId || !isWorkspacePanelId(panelId) || !editor.prefs.panels.floating.includes(panelId)) return null;
  if (panelId === 'authoring' && !editor.blockEdit) return null;
  const panel = PANELS[panelId];
  const lang = editor.lang;
  const pin = () => {
    const current = editor.prefs.panels;
    const right = current.right.includes(panelId) ? current.right : [...current.right, panelId];
    editor.setPrefs({ panels: { ...setPanelFloating(current, panelId, false), right } });
    onClose();
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('fmodel:panel', { detail: panelId })));
  };

  return (
    <aside className="floating-panel" aria-label={panel.label[lang]}>
      <div className="floating-panel__head">
        <CadIcon name={panel.icon} size={16} />
        <strong>{panel.label[lang]}</strong>
        <span />
        <button type="button" className="icon-btn" onClick={pin} title={tr(lang, 'Fijar a la derecha', 'Pin to the right')} aria-label={tr(lang, `Fijar ${panel.label.es}`, `Pin ${panel.label.en}`)}>
          <Pin size={15} />
        </button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={tr(lang, 'Cerrar panel', 'Close panel')}>
          <X size={16} />
        </button>
      </div>
      <div className="floating-panel__body">{panel.render(editor, onUi)}</div>
    </aside>
  );
}
