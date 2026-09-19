import { Check, ChevronDown, ChevronUp, Keyboard, Maximize, Minus, Plus, Search, Settings2, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getServices, hasServices } from '../app/services';
import { findCommand } from '../commands/registry';
import type { Editor } from '../editor/editor';
import { formatCoord } from '../snap/coords';
import type { PersistenceHealth } from '../storage/persistence';
import { tr } from './controls';
import { useEditorEvents, useThrottledEditorEvents } from './hooks';
import { CadIcon } from './icons';
import { RIBBON } from './ribbonConfig';

/**
 * Barra inferior del móvil. Sustituye a la barra de estado y a la cinta: reúne lo que en
 * escritorio se hace con el teclado —Intro, Esc, las opciones del comando y los modos de
 * precisión— en objetivos que se pueden pulsar con el dedo.
 */
export function MobileBar({ editor, onUi, onKeyboard }: { editor: Editor; onUi: (ui: string, cmd?: string) => void; onKeyboard: () => void }) {
  useEditorEvents(editor, ['command', 'prefs', 'selection', 'space']);
  const [open, setOpen] = useState(true);
  const [sheet, setSheet] = useState(false);
  const lang = editor.lang;
  const persistence = hasServices() ? getServices().persistence : null;
  const [health, setHealth] = useState<PersistenceHealth | null>(() => persistence?.health ?? null);

  useEffect(() => {
    if (!persistence) return;
    return persistence.onHealthChange(setHealth);
  }, [persistence]);

  const pending = editor.runner.pending;
  const busy = editor.runner.busy;
  const active = editor.runner.active?.def.name ?? '';
  const snap = editor.prefs.snap;

  const toggles: { label: string; on: boolean; act: () => void; title: string }[] = [
    { label: tr(lang, 'ORTO', 'ORTHO'), on: snap.ortho, act: () => editor.toggleSnapSetting('ortho'), title: tr(lang, 'Ortogonal', 'Ortho') },
    { label: 'POLAR', on: snap.polar, act: () => editor.toggleSnapSetting('polar'), title: tr(lang, 'Rastreo polar', 'Polar tracking') },
    { label: tr(lang, 'REFENT', 'OSNAP'), on: snap.osnap, act: () => editor.toggleSnapSetting('osnap'), title: tr(lang, 'Referencia a objetos', 'Object snap') },
    { label: tr(lang, 'REJILLA', 'GRID'), on: editor.prefs.grid.on, act: () => editor.command('GRIDTOGGLE'), title: tr(lang, 'Rejilla', 'Grid') },
    { label: tr(lang, 'FORZC', 'SNAP'), on: snap.gridSnap, act: () => editor.toggleSnapSetting('gridSnap'), title: tr(lang, 'Forzar cursor', 'Grid snap') },
    { label: 'DYN', on: editor.prefs.dynamicInput.on, act: () => editor.command('DYNTOGGLE'), title: tr(lang, 'Entrada dinámica', 'Dynamic input') },
  ];

  const favorites = editor.prefs.favorites.length ? editor.prefs.favorites : ['LINE', 'PLINE', 'CIRCLE', 'TRIM', 'ERASE'];

  return (
    <>
      {sheet && <ToolSheet editor={editor} onClose={() => setSheet(false)} />}
      <nav className={`mbar${open ? '' : ' mbar--collapsed'}`} aria-label={tr(lang, 'Barra de herramientas táctil', 'Touch toolbar')}>
        <div className="mbar__ctx">
          <button className="mbar__handle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={tr(lang, open ? 'Ocultar herramientas' : 'Mostrar herramientas', open ? 'Hide tools' : 'Show tools')}>
            {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          {busy && pending ? (
            <span className="mbar__prompt" title={editor.runner.promptText(pending.req)}>
              <b>{active}</b> {editor.runner.promptText(pending.req).replace(/\s*\[[^\]]*\]/, '')}
            </span>
          ) : (
            <MobileCoords editor={editor} />
          )}
          {busy ? (
            <>
              <button className="mbar__act mbar__act--go" onClick={() => editor.key('Enter')} aria-label={tr(lang, 'Aceptar (Intro)', 'Accept (Enter)')} title={tr(lang, 'Aceptar', 'Accept')}>
                <Check size={18} />
              </button>
              <button className="mbar__act mbar__act--stop" onClick={() => editor.key('Escape')} aria-label={tr(lang, 'Cancelar (Esc)', 'Cancel (Esc)')} title={tr(lang, 'Cancelar', 'Cancel')}>
                <X size={18} />
              </button>
            </>
          ) : (
            <>
              <button className="mbar__act" onClick={() => onUi('panel:layers')} aria-label={tr(lang, 'Capas', 'Layers')} title={tr(lang, 'Capas', 'Layers')}>
                <CadIcon name="layers" size={18} />
              </button>
              <button className="mbar__act" onClick={() => onUi('panel:properties')} aria-label={tr(lang, 'Propiedades', 'Properties')} title={tr(lang, 'Propiedades', 'Properties')}>
                <CadIcon name="properties" size={18} />
              </button>
            </>
          )}
          {health && health.status !== 'protected' && (
            <button
              className="mbar__act is-warn"
              onClick={() => onUi('versions')}
              aria-label={health.status === 'unavailable' ? tr(lang, 'Sin persistencia', 'No persistence') : tr(lang, 'Almacenamiento degradado', 'Storage degraded')}
              title={
                health.status === 'unavailable'
                  ? tr(lang, 'IndexedDB no disponible: los cambios no se guardan automáticamente.', 'IndexedDB unavailable: changes are not autosaved.')
                  : tr(lang, `Almacenamiento degradado (${health.lastError?.message ?? 'error'}). Haz clic para ver versiones o liberar espacio.`, `Storage degraded (${health.lastError?.message ?? 'error'}). Click to view versions or free space.`)
              }
            >
              ⚠️
            </button>
          )}
          <button className="mbar__act" onClick={onKeyboard} aria-label={tr(lang, 'Escribir valor o comando', 'Type value or command')}>
            <Keyboard size={17} />
          </button>
        </div>

        <div className="mbar__chips" role="toolbar" aria-label={tr(lang, 'Opciones y modos', 'Options and modes')}>
          {pending?.req.keywords?.map((k) => (
            <button key={k.key} className="chip chip--kw" onClick={() => editor.runner.submitKeyword(k.key)}>
              {k.label[lang]}
            </button>
          ))}
          {pending?.req.keywords?.length ? <span className="chip__sep" /> : null}
          {toggles.map((t) => (
            <button key={t.label} className={`chip${t.on ? ' is-on' : ''}`} aria-pressed={t.on} title={t.title} onClick={t.act}>
              {t.label}
            </button>
          ))}
          <button className="chip chip--icon" onClick={() => onUi('drafting-settings')} aria-label={tr(lang, 'Ajustes de dibujo', 'Drafting settings')}>
            <Settings2 size={14} />
          </button>
        </div>

        <div className="mbar__tools">
          <div className="mbar__tools-scroll">
            {favorites.map((cmd) => {
              const def = findCommand(cmd);
              if (!def) return null;
              return (
                <button key={cmd} className={`tool-lg${active === def.name ? ' is-active' : ''}`} onClick={() => editor.command(def.name)}>
                  <CadIcon name={def.icon ?? 'properties'} size={21} />
                  <span>{def.label[lang]}</span>
                </button>
              );
            })}
          </div>
          <button className="tool-lg tool-lg--more" onClick={() => setSheet(true)}>
            <Search size={21} />
            <span>{tr(lang, 'Todo', 'All')}</span>
          </button>
        </div>
      </nav>
    </>
  );
}

/** Coordenadas del cursor o resumen de la selección; se refresca como mucho una vez por fotograma. */
function MobileCoords({ editor }: { editor: Editor }) {
  useThrottledEditorEvents(editor, ['overlay', 'selection', 'view']);
  const lang = editor.lang;
  const n = editor.selection.size;
  if (n) return <span className="mbar__prompt">{n === 1 ? tr(lang, '1 objeto seleccionado', '1 object selected') : tr(lang, `${n} objetos seleccionados`, `${n} objects selected`)}</span>;
  const p = editor.hover.resolved?.p ?? editor.hover.world;
  return (
    <span className="mbar__prompt mbar__prompt--coords">
      {formatCoord(p.x, 3)}, {formatCoord(p.y, 3)}
    </span>
  );
}

/** Hoja a pantalla completa con todas las herramientas de la cinta, agrupadas y con favoritos. */
function ToolSheet({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  useEditorEvents(editor, ['prefs']);
  const lang = editor.lang;
  const [tab, setTab] = useState(RIBBON[0].id);
  const [q, setQ] = useState('');
  const groups = RIBBON.find((t) => t.id === tab)?.groups ?? [];
  const query = q.trim().toLowerCase();
  const shown = query ? RIBBON.flatMap((t) => t.groups).map((g) => ({ ...g, tools: g.tools.filter((x) => x.label[lang].toLowerCase().includes(query) || x.cmd.toLowerCase().includes(query)) })).filter((g) => g.tools.length) : groups;
  const favorites = editor.prefs.favorites;

  const toggleFav = (cmd: string) => {
    const f = favorites.includes(cmd) ? favorites.filter((x) => x !== cmd) : [...favorites, cmd];
    editor.setPrefs({ favorites: f });
  };

  return (
    <div className="tool-sheet" role="dialog" aria-modal="true" aria-label={tr(lang, 'Todas las herramientas', 'All tools')}>
      <div className="tool-sheet__head">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(lang, 'Buscar herramienta…', 'Search tool…')} aria-label={tr(lang, 'Buscar herramienta', 'Search tool')} autoComplete="off" />
        <button className="mbar__act" onClick={onClose} aria-label={tr(lang, 'Cerrar', 'Close')}>
          <X size={18} />
        </button>
      </div>
      {!query && (
        <div className="tool-sheet__tabs" role="tablist">
          {RIBBON.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`chip${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label[lang]}
            </button>
          ))}
        </div>
      )}
      <div className="tool-sheet__body">
        {shown.map((g, i) => (
          <section key={`${g.label.en}-${i}`}>
            <h3 className="eyebrow">{g.label[lang]}</h3>
            <div className="tool-sheet__grid">
              {g.tools.map((t) => (
                <div key={`${g.label.en}-${t.cmd}`} className="tool-sheet__item">
                  <button
                    className="tool-lg"
                    onClick={() => {
                      onClose();
                      editor.command(t.cmd, t.args);
                    }}
                  >
                    <CadIcon name={t.icon} size={22} />
                    <span>{t.label[lang]}</span>
                  </button>
                  <button className={`tool-sheet__fav${favorites.includes(t.cmd) ? ' is-on' : ''}`} onClick={() => toggleFav(t.cmd)} aria-pressed={favorites.includes(t.cmd)} aria-label={tr(lang, `Favorito: ${t.label.es}`, `Favourite: ${t.label.en}`)}>
                    <Star size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
        {!shown.length && <p className="tool-sheet__empty">{tr(lang, 'Ninguna herramienta coincide.', 'No tool matches.')}</p>}
      </div>
    </div>
  );
}

/** Botones de zoom flotantes sobre el lienzo: el pellizco es cómodo, pero no preciso. */
export function TouchHud({ editor }: { editor: Editor }) {
  const lang = editor.lang;
  const center = () => ({ x: editor.view.width / 2, y: editor.view.height / 2 });
  return (
    <div className="touch-hud" role="toolbar" aria-label={tr(lang, 'Zoom', 'Zoom')}>
      <button className="hud-btn" onClick={() => editor.wheel(center(), -220)} aria-label={tr(lang, 'Acercar', 'Zoom in')}>
        <Plus size={18} />
      </button>
      <button className="hud-btn" onClick={() => editor.wheel(center(), 220)} aria-label={tr(lang, 'Alejar', 'Zoom out')}>
        <Minus size={18} />
      </button>
      <button className="hud-btn" onClick={() => editor.zoomExtents()} aria-label={tr(lang, 'Zoom a extensión', 'Zoom extents')}>
        <Maximize size={17} />
      </button>
    </div>
  );
}
