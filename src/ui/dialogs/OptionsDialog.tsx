import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { allCommands, findCommand } from '../../commands/registry';
import type { Editor } from '../../editor/editor';
import type { CanvasBg, ThemePref, WheelMode } from '../../editor/preferences';
import { DEFAULT_PREFERENCES, DEFAULT_SHORTCUTS } from '../../editor/preferences';
import { Dialog } from '../Dialogs';
import { NumberField, Toggle, tr } from '../controls';
import { useEditorEvents } from '../hooks';
import { comboOf } from '../keys';

type Tab = 'general' | 'display' | 'aliases' | 'shortcuts';

/** Combinación a partir del evento; null mientras solo se pulsan modificadores. */
function comboFromEvent(e: React.KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  return comboOf(e);
}

export function OptionsDialog({ editor, onClose, initialTab }: { editor: Editor; onClose: () => void; initialTab?: Tab }) {
  useEditorEvents(editor, ['prefs']);
  const lang = editor.lang;
  const p = editor.prefs;
  const [tab, setTab] = useState<Tab>(initialTab ?? 'general');
  const [aliasKey, setAliasKey] = useState('');
  const [aliasCmd, setAliasCmd] = useState('');
  const [capture, setCapture] = useState<string | null>(null);
  const [error, setError] = useState('');
  const tabs: [Tab, string][] = [
    ['general', tr(lang, 'General', 'General')],
    ['display', tr(lang, 'Visualización', 'Display')],
    ['aliases', tr(lang, 'Alias', 'Aliases')],
    ['shortcuts', tr(lang, 'Atajos', 'Shortcuts')],
  ];

  const addAlias = () => {
    const key = aliasKey.trim().toUpperCase();
    const def = findCommand(aliasCmd);
    if (!/^[A-Z0-9_]{1,16}$/.test(key)) return setError(tr(lang, 'El alias solo admite letras, dígitos y _ (máx. 16).', 'Aliases accept letters, digits and _ only (max 16).'));
    if (!def) return setError(tr(lang, `No existe el comando «${aliasCmd}».`, `Command "${aliasCmd}" does not exist.`));
    const clash = findCommand(key);
    if (clash && clash.name === key) return setError(tr(lang, `«${key}» ya es el nombre de un comando.`, `"${key}" is already a command name.`));
    setError('');
    editor.setPrefs({ aliases: { ...p.aliases, [key]: def.name } });
    setAliasKey('');
    setAliasCmd('');
  };

  return (
    <Dialog
      wide
      lang={lang}
      title={tr(lang, 'Opciones', 'Options')}
      onClose={onClose}
      footer={
        <>
          {error && (
            <span role="alert" style={{ flex: 1, color: 'var(--fm-danger)', fontSize: 12 }}>
              {error}
            </span>
          )}
          <button className="btn btn--primary" onClick={onClose}>
            {tr(lang, 'Listo', 'Done')}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }} role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`btn btn--sm${tab === id ? ' btn--accent' : ''}`} onClick={() => (setTab(id), setError(''))}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="options-grid">
          <div className="field">
            <label>{tr(lang, 'Idioma', 'Language')}</label>
            <select className="select" value={p.lang} onChange={(e) => editor.setPrefs({ lang: e.target.value as 'es' | 'en' })}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="field">
            <label>{tr(lang, 'Tema', 'Theme')}</label>
            <select className="select" value={p.theme} onChange={(e) => editor.setPrefs({ theme: e.target.value as ThemePref })}>
              <option value="system">{tr(lang, 'Según el sistema', 'System')}</option>
              <option value="dia">{tr(lang, 'Día', 'Day')}</option>
              <option value="noche">{tr(lang, 'Noche', 'Night')}</option>
            </select>
          </div>
          <div className="field">
            <label>{tr(lang, 'Autoguardado (min, 0 = no)', 'Autosave (min, 0 = off)')}</label>
            <NumberField lang={lang} value={p.autosaveMinutes} onCommit={(v) => editor.setPrefs({ autosaveMinutes: Math.max(0, Math.min(60, Math.round(v))) })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Ciclo de selección (objetos superpuestos)', 'Selection cycling (overlapping objects)')}</label>
            <Toggle checked={p.selectionCycling} onChange={(v) => editor.setPrefs({ selectionCycling: v })} label="" />
          </div>
          <div className="field">
            <label>{tr(lang, 'Resaltado al pasar el cursor', 'Rollover highlight')}</label>
            <Toggle checked={p.rolloverHighlight} onChange={(v) => editor.setPrefs({ rolloverHighlight: v })} label="" />
          </div>
          <div className="field">
            <label>{tr(lang, 'Guía de bienvenida', 'Welcome guide')}</label>
            <button className="btn btn--sm" onClick={() => editor.setPrefs({ onboardingDone: false })}>
              {tr(lang, 'Mostrar de nuevo', 'Show again')}
            </button>
          </div>
          <div className="field">
            <label>{tr(lang, 'Paneles', 'Panels')}</label>
            <button className="btn btn--sm" onClick={() => editor.setPrefs({ panels: structuredClone(DEFAULT_PREFERENCES.panels) })}>
              <RotateCcw size={12} /> {tr(lang, 'Restablecer disposición', 'Reset layout')}
            </button>
          </div>
        </div>
      )}

      {tab === 'display' && (
        <div className="options-grid">
          <div className="field">
            <label>{tr(lang, 'Fondo del lienzo', 'Canvas background')}</label>
            <select className="select" value={p.canvasBackground} onChange={(e) => editor.setPrefs({ canvasBackground: e.target.value as CanvasBg })}>
              <option value="auto">{tr(lang, 'Según el tema', 'Follow theme')}</option>
              <option value="paper">{tr(lang, 'Papel', 'Paper')}</option>
              <option value="charcoal">{tr(lang, 'Carbón', 'Charcoal')}</option>
              <option value="black">{tr(lang, 'Negro', 'Black')}</option>
            </select>
          </div>
          <div className="field">
            <label>{tr(lang, 'Rueda del ratón / dos dedos', 'Mouse wheel / two fingers')}</label>
            <select className="select" value={p.wheelMode} onChange={(e) => editor.setPrefs({ wheelMode: e.target.value as WheelMode })}>
              <option value="auto">{tr(lang, 'Automático (rueda = zoom, panel táctil = encuadre)', 'Automatic (wheel = zoom, trackpad = pan)')}</option>
              <option value="zoom">{tr(lang, 'Siempre zoom', 'Always zoom')}</option>
              <option value="pan">{tr(lang, 'Siempre encuadre (Ctrl para el zoom)', 'Always pan (Ctrl to zoom)')}</option>
            </select>
          </div>
          <div className="field">
            <label>{tr(lang, 'Mostrar grosores de línea', 'Show lineweights')}</label>
            <Toggle checked={p.lineweightDisplay} onChange={(v) => editor.setPrefs({ lineweightDisplay: v })} label="" />
          </div>
          <div className="field">
            <label>{tr(lang, 'Mostrar transparencia', 'Show transparency')}</label>
            <Toggle checked={p.transparencyDisplay} onChange={(v) => editor.setPrefs({ transparencyDisplay: v })} label="" />
          </div>
          <div className="field">
            <label>{tr(lang, 'Tamaño de la cruz (% de pantalla)', 'Crosshair size (% of screen)')}</label>
            <NumberField lang={lang} value={p.crosshairSize} onCommit={(v) => editor.setPrefs({ crosshairSize: Math.max(1, Math.min(100, Math.round(v))) })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Caja de designación (px)', 'Pickbox (px)')}</label>
            <NumberField lang={lang} value={p.pickboxPx} onCommit={(v) => editor.setPrefs({ pickboxPx: Math.max(2, Math.min(20, Math.round(v))) })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Tamaño de pinzamientos (px)', 'Grip size (px)')}</label>
            <NumberField lang={lang} value={p.gripSizePx} onCommit={(v) => editor.setPrefs({ gripSizePx: Math.max(4, Math.min(20, Math.round(v))) })} />
          </div>
          <p className="eyebrow" style={{ gridColumn: '1 / -1' }}>
            {tr(lang, 'Rejilla, referencias a objetos, rastreo y entrada dinámica: DSETTINGS (clic derecho en la barra de estado).', 'Grid, object snaps, tracking and dynamic input: DSETTINGS (right-click the status bar).')}
          </p>
        </div>
      )}

      {tab === 'aliases' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 6 }}>
            <input className="input input--mono" placeholder={tr(lang, 'Alias', 'Alias')} value={aliasKey} onChange={(e) => setAliasKey(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={tr(lang, 'Alias nuevo', 'New alias')} />
            <input className="input input--mono" placeholder={tr(lang, 'Comando (p. ej. OFFSET)', 'Command (e.g. OFFSET)')} list="fm-commands" value={aliasCmd} onChange={(e) => setAliasCmd(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && addAlias())} aria-label={tr(lang, 'Comando', 'Command')} />
            <button className="btn btn--sm" onClick={addAlias}>
              <Plus size={12} /> {tr(lang, 'Añadir', 'Add')}
            </button>
            <datalist id="fm-commands">
              {allCommands()
                .filter((c) => !c.name.startsWith('_'))
                .map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.label[lang]}
                  </option>
                ))}
            </datalist>
          </div>
          {Object.keys(p.aliases).length ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>{tr(lang, 'Alias', 'Alias')}</th>
                  <th>{tr(lang, 'Comando', 'Command')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {Object.entries(p.aliases)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td>
                        <code>{k}</code>
                      </td>
                      <td>
                        <code>{v}</code> <span style={{ color: 'var(--ink-muted)' }}>{findCommand(v)?.label[lang]}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="icon-btn"
                          aria-label={tr(lang, 'Eliminar alias', 'Delete alias')}
                          onClick={() => {
                            const next = { ...p.aliases };
                            delete next[k];
                            editor.setPrefs({ aliases: next });
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">{tr(lang, 'Sin alias personalizados. Los alias de fábrica (L, C, TR, O…) siguen disponibles.', 'No custom aliases. Built-in aliases (L, C, TR, O…) remain available.')}</p>
          )}
        </div>
      )}

      {tab === 'shortcuts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn btn--sm" onClick={() => setCapture('')}>
              <Plus size={12} /> {tr(lang, 'Nuevo atajo', 'New shortcut')}
            </button>
            <button className="btn btn--sm" onClick={() => editor.setPrefs({ shortcuts: { ...DEFAULT_SHORTCUTS } })}>
              <RotateCcw size={12} /> {tr(lang, 'Restablecer', 'Reset')}
            </button>
            {capture !== null && (
              <span className="status-pill status-pill--experimental" style={{ marginLeft: 'auto' }}>
                {tr(lang, 'Pulsa la combinación…', 'Press the combination…')}
              </span>
            )}
          </div>
          {capture !== null && (
            <input
              autoFocus
              className="input input--mono"
              data-modal-escape="consume"
              readOnly
              value={capture}
              placeholder={tr(lang, 'Pulsa Ctrl/Alt/Mayús + tecla o una tecla de función', 'Press Ctrl/Alt/Shift + key or a function key')}
              onKeyDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const combo = comboFromEvent(e);
                if (!combo) return;
                if (combo === 'Escape') return setCapture(null);
                if (!/^(Ctrl|Alt)\+/.test(combo) && !/^F\d{1,2}$/.test(combo) && combo !== 'Delete') {
                  setError(tr(lang, 'Usa Ctrl o Alt con una tecla, o una tecla de función: las letras solas escriben en la línea de comandos.', 'Use Ctrl or Alt with a key, or a function key: plain letters type into the command line.'));
                  return;
                }
                setError('');
                setCapture(combo);
              }}
              aria-label={tr(lang, 'Combinación', 'Combination')}
            />
          )}
          {capture && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
              <input className="input input--mono" list="fm-commands-sc" placeholder={tr(lang, 'Comando', 'Command')} value={aliasCmd} onChange={(e) => setAliasCmd(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={tr(lang, 'Comando del atajo', 'Shortcut command')} />
              <button
                className="btn btn--sm btn--primary"
                onClick={() => {
                  const def = findCommand(aliasCmd);
                  if (!def) return setError(tr(lang, `No existe el comando «${aliasCmd}».`, `Command "${aliasCmd}" does not exist.`));
                  editor.setPrefs({ shortcuts: { ...p.shortcuts, [capture]: def.name } });
                  setCapture(null);
                  setAliasCmd('');
                  setError('');
                }}
              >
                {tr(lang, 'Asignar', 'Assign')} {capture}
              </button>
              <datalist id="fm-commands-sc">
                {allCommands().map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.label[lang]}
                  </option>
                ))}
              </datalist>
            </div>
          )}
          <table className="grid">
            <thead>
              <tr>
                <th>{tr(lang, 'Combinación', 'Combination')}</th>
                <th>{tr(lang, 'Comando', 'Command')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {Object.entries(p.shortcuts)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <kbd>{k}</kbd>
                    </td>
                    <td>
                      <code>{v}</code> <span style={{ color: 'var(--ink-muted)' }}>{findCommand(v)?.label[lang] ?? tr(lang, '(comando no disponible)', '(command not available)')}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="icon-btn"
                        aria-label={tr(lang, 'Quitar atajo', 'Remove shortcut')}
                        onClick={() => {
                          const next = { ...p.shortcuts };
                          delete next[k];
                          editor.setPrefs({ shortcuts: next });
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
