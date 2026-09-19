import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import { useEditorEvents, useMediaQuery } from './hooks';
import { CadIcon } from './icons';
import { LayersPanel } from './panels/LayersPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { BlocksPanel } from './panels/BlocksPanel';
import { ToolPalettesPanel } from './panels/ToolPalettesPanel';
import { BlockAuthoringPanel } from './panels/BlockAuthoringPanel';
import { tr } from './controls';

export const PANELS: Record<string, { icon: string; label: { es: string; en: string }; render: (editor: Editor, onUi: (ui: string, cmd?: string) => void) => React.ReactNode }> = {
  properties: { icon: 'properties', label: { es: 'Propiedades', en: 'Properties' }, render: (e) => <PropertiesPanel editor={e} /> },
  layers: { icon: 'layers', label: { es: 'Capas', en: 'Layers' }, render: (e) => <LayersPanel editor={e} /> },
  blocks: { icon: 'block', label: { es: 'Bloques', en: 'Blocks' }, render: (e, onUi) => <BlocksPanel editor={e} onUi={onUi} /> },
  palettes: { icon: 'palettes', label: { es: 'Paletas', en: 'Palettes' }, render: (e) => <ToolPalettesPanel editor={e} /> },
  authoring: { icon: 'dynblock', label: { es: 'Autoría', en: 'Authoring' }, render: (e) => <BlockAuthoringPanel editor={e} /> },
};

/** Paneles de un lado; «Autoría» solo existe durante una sesión del Editor de bloques. */
function dockPanels(editor: Editor, side: 'left' | 'right'): string[] {
  const { left, right } = editor.prefs.panels;
  const list = (side === 'left' ? left : right).filter((p) => PANELS[p] && (p !== 'authoring' || editor.blockEdit));
  if (editor.blockEdit && side === 'right' && ![...left, ...right].includes('authoring')) return ['authoring', ...list];
  return list;
}

export function Docks({ editor, side, mobileSheet, onCloseSheet, onUi }: { editor: Editor; side: 'left' | 'right'; mobileSheet: string | null; onCloseSheet: () => void; onUi: (ui: string, cmd?: string) => void }) {
  useEditorEvents(editor, ['prefs', 'space']);
  const lang = editor.lang;
  const isMobile = useMediaQuery('(max-width: 820px)');
  const panels = dockPanels(editor, side);
  const editing = !!editor.blockEdit;
  const [active, setActive] = useState(panels[0] ?? '');
  const [width, setWidth] = useState(() => {
    try {
      return Number(localStorage.getItem(`fmodel.dock.${side}`)) || (side === 'right' ? 340 : 260);
    } catch {
      return side === 'right' ? 340 : 260;
    }
  });
  const collapsed = editor.prefs.panels.collapsed.includes(side);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const setDockWidth = (next: number) => {
    const value = Math.max(200, Math.min(720, Math.round(next)));
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
      if (panels.includes(id)) {
        setActive(id);
        if (collapsed) editor.setPrefs({ panels: { ...editor.prefs.panels, collapsed: editor.prefs.panels.collapsed.filter((c) => c !== side) } });
      }
    };
    window.addEventListener('fmodel:panel', onPanel);
    return () => window.removeEventListener('fmodel:panel', onPanel);
  }, [panels, collapsed, editor, side]);

  // al abrir el Editor de bloques se muestra la autoría en el lado donde viva
  useEffect(() => {
    if (!editing || !dockPanels(editor, side).includes('authoring')) return;
    setActive('authoring');
    if (editor.prefs.panels.collapsed.includes(side)) editor.setPrefs({ panels: { ...editor.prefs.panels, collapsed: editor.prefs.panels.collapsed.filter((c) => c !== side) } });
  }, [editing, editor, side]);

  const sheetPanel = isMobile && mobileSheet && panels.includes(mobileSheet) ? mobileSheet : null;
  if (isMobile && !sheetPanel) return null;
  if (!panels.length) return null;
  const shown = sheetPanel ?? (panels.includes(active) ? active : panels[0]);

  const toggleCollapse = () => {
    const c = editor.prefs.panels.collapsed;
    editor.setPrefs({ panels: { ...editor.prefs.panels, collapsed: collapsed ? c.filter((x) => x !== side) : [...c, side] } });
  };

  const moveTo = (id: string) => {
    const other = side === 'left' ? 'right' : 'left';
    const p = editor.prefs.panels;
    editor.setPrefs({ panels: { ...p, [side]: p[side].filter((x) => x !== id), [other]: [...p[other], id] } });
  };

  return (
    <aside className={`dock dock--${side}${collapsed && !sheetPanel ? ' dock--collapsed' : ''}${sheetPanel ? ' is-sheet' : ''}`} style={{ width: sheetPanel ? undefined : width }} aria-label={tr(lang, side === 'left' ? 'Panel izquierdo' : 'Panel derecho', side === 'left' ? 'Left dock' : 'Right dock')}>
      {!sheetPanel && (
        <div
          className="dock__resize"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, w: width };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = e.clientX - drag.current.x;
            const w = Math.max(200, Math.min(720, drag.current.w + (side === 'left' ? dx : -dx)));
            setWidth(w);
          }}
          onPointerUp={() => {
            drag.current = null;
            setDockWidth(width);
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
          <button className="icon-btn" onClick={toggleCollapse} aria-label={tr(lang, collapsed ? 'Expandir panel' : 'Contraer panel', collapsed ? 'Expand dock' : 'Collapse dock')}>
            {side === 'left' ? collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} /> : collapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>
        )}
      </div>
      <div className="dock__body" role="tabpanel">
        {PANELS[shown]?.render(editor, onUi)}
      </div>
    </aside>
  );
}
