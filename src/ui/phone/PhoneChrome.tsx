import { Check, ChevronRight, Command as CommandIcon, FolderOpen, HelpCircle, Home, Keyboard, LayoutGrid, Magnet, MousePointer2, PanelsTopLeft, Search, Settings, Settings2, X } from 'lucide-react';
import { findCommand } from '../../commands/registry';
import type { Editor } from '../../editor/editor';
import { isWorkspacePanelId, uniqueFavoriteCommands, type WorkspacePanelId } from '../../editor/workspaceChrome';
import { formatCoord } from '../../snap/coords';
import { Segmented, tr } from '../controls';
import { PANELS } from '../Docks';
import { fieldLabelsRef } from '../fieldLabels';
import { useEditorEvents, useThrottledEditorEvents } from '../hooks';
import { CadIcon, hasCadIcon } from '../icons';
import { precisionModes } from '../precisionModes';
import { ribbonTool } from '../PrecisionDeck';
import { BottomSheet } from './BottomSheet';

export type PhoneSheet = 'precision' | 'panels' | 'menu';

/**
 * Dock flotante del teléfono: la misma barra de arcilla que en escritorio, con objetivos de 44 px.
 * Herramientas · favoritos (desplazables) · precisión · paneles.
 */
export function PhoneDock({ editor, deckOpen, onToggleDeck, sheet, onSheet }: { editor: Editor; deckOpen: boolean; onToggleDeck: () => void; sheet: PhoneSheet | null; onSheet: (sheet: PhoneSheet | null) => void }) {
  useEditorEvents(editor, ['command', 'prefs']);
  const lang = editor.lang;
  const active = editor.runner.active?.def.name;
  const favorites = uniqueFavoriteCommands(editor.prefs.favorites).map((name) => ({ name, tool: ribbonTool(name), command: findCommand(name) }));
  const modesOn = precisionModes(editor).filter((m) => ['osnap', 'ortho', 'polar', 'otrack', 'gridSnap'].includes(m.id) && m.on).length;
  const toggleSheet = (next: PhoneSheet) => onSheet(sheet === next ? null : next);
  return (
    <nav className="precision-dock precision-dock--phone" aria-label={tr(lang, 'Herramientas', 'Tools')}>
      <button type="button" data-deck-launcher="" className={`precision-dock__launcher${deckOpen ? ' is-active' : ''}`} onClick={onToggleDeck} aria-expanded={deckOpen} aria-label={tr(lang, 'Todas las herramientas', 'All tools')}>
        <LayoutGrid size={20} />
      </button>
      <span className="precision-dock__separator" aria-hidden="true" />
      <div className="precision-dock__favorites" aria-label={tr(lang, 'Herramientas favoritas', 'Favorite tools')}>
        {favorites.map(({ name, tool, command }) => (
          <button type="button" key={name} className={`precision-dock__tool${active && active === command?.name ? ' is-active' : ''}`} onClick={() => editor.command(name)} aria-label={command?.label[lang] ?? tool?.label[lang] ?? name}>
            <CadIcon name={tool?.icon ?? command?.icon ?? 'properties'} size={20} />
          </button>
        ))}
      </div>
      <span className="precision-dock__separator" aria-hidden="true" />
      <button type="button" className={`precision-dock__tool${sheet === 'precision' ? ' is-active' : ''}`} onClick={() => toggleSheet('precision')} aria-pressed={sheet === 'precision'} aria-label={tr(lang, `Precisión: ${modesOn} modos activos`, `Precision: ${modesOn} modes on`)}>
        <Magnet size={19} />
        {modesOn > 0 && <span className="precision-dock__badge" aria-hidden="true">{modesOn}</span>}
      </button>
      <button type="button" className={`precision-dock__tool${sheet === 'panels' ? ' is-active' : ''}`} onClick={() => toggleSheet('panels')} aria-pressed={sheet === 'panels'} aria-label={tr(lang, 'Paneles: capas, propiedades, bloques', 'Panels: layers, properties, blocks')}>
        <PanelsTopLeft size={19} />
      </button>
    </nav>
  );
}

/** Coordenadas del cursor en unidades de dibujo; se refresca como mucho una vez por fotograma. */
function Coords({ editor }: { editor: Editor }) {
  useThrottledEditorEvents(editor, ['overlay', 'view']);
  const p = editor.hover.resolved?.p ?? editor.hover.world;
  return (
    <span className="phone-card__coords" aria-label={tr(editor.lang, 'Coordenadas', 'Coordinates')}>
      {formatCoord(p.x, 3)}, {formatCoord(p.y, 3)}
    </span>
  );
}

const SELECTION_ACTIONS: { cmd: string; icon: string; es: string; en: string }[] = [
  { cmd: 'MOVE', icon: 'move', es: 'Mover', en: 'Move' },
  { cmd: 'COPY', icon: 'copy', es: 'Copiar', en: 'Copy' },
  { cmd: 'ROTATE', icon: 'rotate', es: 'Girar', en: 'Rotate' },
  { cmd: 'SCALE', icon: 'scale', es: 'Escala', en: 'Scale' },
  { cmd: 'MIRROR', icon: 'mirror', es: 'Simetría', en: 'Mirror' },
  { cmd: 'OFFSET', icon: 'offset', es: 'Desfase', en: 'Offset' },
];

/**
 * Tarjeta sobre el dock: con un comando activo muestra orden, solicitud, opciones, coordenadas y
 * Aceptar/Cancelar (lo que en escritorio hacen la línea de comando, Intro y Esc); con selección,
 * acciones rápidas de edición. Sin ninguna de las dos no ocupa lienzo.
 */
export function PhoneContext({ editor, onKeyboard, onUi }: { editor: Editor; onKeyboard: () => void; onUi: (ui: string) => void }) {
  useEditorEvents(editor, ['command', 'selection']);
  const lang = editor.lang;
  const pending = editor.runner.pending;
  const def = editor.runner.active?.def;
  if (editor.runner.busy && def) {
    const prompt = pending ? editor.runner.promptText(pending.req).replace(/\s*\[[^\]]*\]/, '') : '';
    const keywords = pending?.req.keywords ?? [];
    return (
      <section className="phone-card" aria-label={tr(lang, 'Comando activo', 'Active command')}>
        <div className="phone-card__head">
          <span className="phone-card__icon">{def.icon && hasCadIcon(def.icon) ? <CadIcon name={def.icon} size={17} /> : <CommandIcon size={16} />}</span>
          <strong>{def.label[lang]}</strong>
          <code>{def.name}</code>
          <Coords editor={editor} />
        </div>
        {prompt && (
          <p className="phone-card__prompt" role="status" aria-live="polite">
            {prompt}
          </p>
        )}
        {keywords.length > 0 && (
          <div className="phone-card__chips" role="toolbar" aria-label={tr(lang, 'Opciones del comando', 'Command options')}>
            {keywords.map((k) => (
              <button key={k.key} type="button" className="kw-chip" onClick={() => editor.runner.submitKeyword(k.key)}>
                {k.label[lang]}
              </button>
            ))}
          </div>
        )}
        <div className="phone-card__actions">
          <button type="button" className="btn btn--ghost" onClick={onKeyboard} aria-label={tr(lang, 'Escribir un valor o una opción', 'Type a value or option')}>
            <Keyboard size={17} />
            {tr(lang, 'Escribir', 'Type')}
          </button>
          <span className="phone-card__spacer" />
          <button type="button" className="btn" onClick={() => editor.key('Escape')}>
            <X size={16} />
            {tr(lang, 'Cancelar', 'Cancel')}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => editor.key('Enter')}>
            <Check size={16} />
            {tr(lang, 'Aceptar', 'Accept')}
          </button>
        </div>
      </section>
    );
  }
  const n = editor.selection.size;
  if (!n) return null;
  return (
    <section className="phone-card phone-card--selection" aria-label={tr(lang, 'Selección', 'Selection')}>
      <div className="phone-card__head">
        <span className="phone-card__icon">
          <MousePointer2 size={16} />
        </span>
        <strong>{n === 1 ? tr(lang, '1 objeto seleccionado', '1 object selected') : tr(lang, `${n} objetos seleccionados`, `${n} objects selected`)}</strong>
        <span className="phone-card__spacer" />
        <button type="button" className="icon-btn" onClick={() => editor.key('Escape')} aria-label={tr(lang, 'Quitar la selección', 'Clear selection')}>
          <X size={17} />
        </button>
      </div>
      <div className="phone-card__chips" role="toolbar" aria-label={tr(lang, 'Editar la selección', 'Edit selection')}>
        {SELECTION_ACTIONS.map((a) => (
          <button key={a.cmd} type="button" className="btn btn--sm" onClick={() => editor.command(a.cmd)}>
            <CadIcon name={a.icon} size={15} />
            {tr(lang, a.es, a.en)}
          </button>
        ))}
        <button type="button" className="btn btn--sm" onClick={() => onUi('panel:properties')}>
          <CadIcon name="properties" size={15} />
          {tr(lang, 'Propiedades', 'Properties')}
        </button>
        <button type="button" className="btn btn--sm btn--danger" onClick={() => editor.command('ERASE')}>
          {tr(lang, 'Borrar', 'Erase')}
        </button>
      </div>
    </section>
  );
}

/** Hoja de precisión: los interruptores de la barra de estado como baldosas táctiles. */
export function PrecisionSheet({ editor, onClose, onUi }: { editor: Editor; onClose: () => void; onUi: (ui: string) => void }) {
  useEditorEvents(editor, ['prefs']);
  const lang = editor.lang;
  // las propiedades rápidas no existen en el teléfono: allí la tarjeta de selección ya lleva «Propiedades»
  const modes = precisionModes(editor).filter((m) => m.id !== 'qp');
  return (
    <BottomSheet title={tr(lang, 'Precisión y vista', 'Precision & view')} icon={<Magnet size={17} />} onClose={onClose} closeLabel={tr(lang, 'Cerrar', 'Close')} className="sheet--compact" head={<Coords editor={editor} />}>
      <div className="phone-modes" role="group" aria-label={tr(lang, 'Modos de precisión', 'Precision modes')}>
        {modes.map((m) => (
          <button key={m.id} type="button" className="phone-mode" aria-pressed={m.on} onClick={m.toggle} title={m.key ? `${m.label} · ${m.key}` : m.label}>
            <span className="phone-mode__state" aria-hidden="true" />
            <strong>{m.short}</strong>
            <small>{m.label}</small>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--block"
        onClick={() => {
          onClose();
          onUi('drafting-settings');
        }}
      >
        <Settings2 size={16} />
        {tr(lang, 'Parámetros de dibujo…', 'Drafting settings…')}
      </button>
    </BottomSheet>
  );
}

/** Paneles en una sola hoja con selector: el mismo contenido que los paneles flotantes de escritorio. */
export function PanelSheet({ editor, panel, onPanel, onClose, onUi }: { editor: Editor; panel: WorkspacePanelId; onPanel: (id: WorkspacePanelId) => void; onClose: () => void; onUi: (ui: string, cmd?: string) => void }) {
  useEditorEvents(editor, ['prefs', 'space']);
  const lang = editor.lang;
  const ids: WorkspacePanelId[] = ['properties', 'layers', 'blocks', 'palettes', 'parameters', 'architecture'];
  if (editor.blockEdit) ids.unshift('authoring');
  const shown = ids.includes(panel) ? panel : 'properties';
  const meta = PANELS[shown];
  return (
    <BottomSheet title={meta.label[lang]} icon={<CadIcon name={meta.icon} size={17} />} onClose={onClose} closeLabel={tr(lang, 'Cerrar panel', 'Close panel')} className="sheet--panel">
      <div className="sheet__tabs">
        <Segmented size="sm" label={tr(lang, 'Paneles', 'Panels')} value={shown} onChange={(id) => isWorkspacePanelId(id) && onPanel(id)} options={ids.map((id) => ({ id, label: PANELS[id].label[lang] }))} controls="phone-panel-body" />
      </div>
      <div id="phone-panel-body" ref={fieldLabelsRef} className="sheet__panel" role="tabpanel">
        {meta.render(editor, onUi, onClose)}
      </div>
    </BottomSheet>
  );
}

/** Menú de la app en el teléfono: lo que en escritorio está en la barra superior y en Archivo. */
export function AppMenuSheet({ editor, onClose, onUi, onPalette, onHome, onKeyboard }: { editor: Editor; onClose: () => void; onUi: (ui: string) => void; onPalette: () => void; onHome: () => void; onKeyboard: () => void }) {
  useEditorEvents(editor, ['prefs']);
  const lang = editor.lang;
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const items: { icon: React.ReactNode; label: string; hint?: string; run: () => void }[] = [
    { icon: <FolderOpen size={18} />, label: tr(lang, 'Archivo', 'File'), hint: tr(lang, 'Abrir, guardar, importar, exportar', 'Open, save, import, export'), run: () => onUi('file-menu') },
    { icon: <Search size={18} />, label: tr(lang, 'Buscar comando', 'Search command'), hint: tr(lang, 'Por nombre, alias o tarea', 'By name, alias or task'), run: onPalette },
    { icon: <Keyboard size={18} />, label: tr(lang, 'Escribir comando', 'Type a command'), hint: tr(lang, 'Línea de comandos con teclado', 'Command line with keyboard'), run: onKeyboard },
    { icon: <Settings size={18} />, label: tr(lang, 'Opciones', 'Options'), run: () => onUi('options') },
    { icon: <HelpCircle size={18} />, label: tr(lang, 'Ayuda', 'Help'), run: () => onUi('help') },
    { icon: <Home size={18} />, label: tr(lang, 'Ir al Inicio', 'Go to Home'), run: onHome },
  ];
  return (
    <BottomSheet modal title={tr(lang, 'Menú', 'Menu')} onClose={onClose} closeLabel={tr(lang, 'Cerrar menú', 'Close menu')} className="sheet--compact">
      <nav className="phone-menu" aria-label={tr(lang, 'Menú', 'Menu')}>
        {items.map((item) => (
          <button key={item.label} type="button" className="phone-menu__item" onClick={go(item.run)}>
            <span className="phone-menu__icon">{item.icon}</span>
            <span className="phone-menu__text">
              <strong>{item.label}</strong>
              {item.hint && <small>{item.hint}</small>}
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ))}
      </nav>
      <div className="phone-menu__prefs">
        <span className="eyebrow">{tr(lang, 'Tema', 'Theme')}</span>
        <Segmented
          kind="radio"
          size="sm"
          label={tr(lang, 'Tema', 'Theme')}
          value={editor.prefs.theme}
          onChange={(theme) => editor.setPrefs({ theme })}
          options={[
            { id: 'system' as const, label: tr(lang, 'Sistema', 'System') },
            { id: 'dia' as const, label: tr(lang, 'Día', 'Day') },
            { id: 'noche' as const, label: tr(lang, 'Noche', 'Night') },
          ]}
        />
        <span className="eyebrow">{tr(lang, 'Idioma', 'Language')}</span>
        <Segmented
          kind="radio"
          size="sm"
          label={tr(lang, 'Idioma', 'Language')}
          value={lang}
          onChange={(next) => editor.setPrefs({ lang: next })}
          options={[
            { id: 'es' as const, label: 'Español' },
            { id: 'en' as const, label: 'English' },
          ]}
        />
      </div>
    </BottomSheet>
  );
}
