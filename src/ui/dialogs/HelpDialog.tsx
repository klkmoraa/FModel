import { Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FEATURES, STATUS_LABEL } from '../../app/features';
import type { FeatureStatus } from '../../app/features';
import { aliasesFor, allCommands, findCommand, searchCommands } from '../../commands/registry';
import type { Editor } from '../../editor/editor';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';

export type HelpTab = 'commands' | 'features' | 'keys' | 'about';

const CATEGORY: Record<string, { es: string; en: string }> = {
  draw: { es: 'Dibujo', en: 'Draw' },
  modify: { es: 'Modificar', en: 'Modify' },
  annotate: { es: 'Anotar', en: 'Annotate' },
  block: { es: 'Bloques', en: 'Blocks' },
  layer: { es: 'Capas', en: 'Layers' },
  view: { es: 'Vista', en: 'View' },
  layout: { es: 'Presentación', en: 'Layout' },
  insert: { es: 'Insertar', en: 'Insert' },
  inquiry: { es: 'Consulta', en: 'Inquiry' },
  manage: { es: 'Gestionar', en: 'Manage' },
  file: { es: 'Archivo', en: 'File' },
  utility: { es: 'Utilidades', en: 'Utilities' },
  constraint: { es: 'Restricciones', en: 'Constraints' },
  output: { es: 'Salida', en: 'Output' },
};

/** Ayuda: comandos buscables (con el comando activo preseleccionado), estado de funciones, teclas y acerca de. */
export function HelpDialog({ editor, onClose, initialTab }: { editor: Editor; onClose: () => void; initialTab?: HelpTab }) {
  const lang = editor.lang;
  const active = editor.runner.active?.def.name;
  const [tab, setTab] = useState<HelpTab>(initialTab ?? 'commands');
  const [q, setQ] = useState(active && active !== 'HELP' ? active : '');
  const [status, setStatus] = useState<FeatureStatus | 'all'>('all');
  const commands = useMemo(() => (q.trim() ? searchCommands(q, lang, 80) : allCommands().filter((c) => !c.name.startsWith('_'))), [q, lang]);
  const tabs: [HelpTab, string][] = [
    ['commands', tr(lang, 'Comandos', 'Commands')],
    ['features', tr(lang, 'Estado de funciones', 'Feature status')],
    ['keys', tr(lang, 'Teclado y ratón', 'Keyboard and mouse')],
    ['about', tr(lang, 'Acerca de', 'About')],
  ];
  const counts = FEATURES.reduce<Record<string, number>>((m, f) => ((m[f.status] = (m[f.status] ?? 0) + 1), m), {});

  return (
    <Dialog wide lang={lang} title={tr(lang, 'Ayuda de FModel 2D CAD', 'FModel 2D CAD help')} onClose={onClose}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }} role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`btn btn--sm${tab === id ? ' btn--accent' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'commands' && (
        <div className="report">
          <input className="input" autoFocus value={q} placeholder={tr(lang, 'Busca por nombre, alias o tarea (p. ej. «paralela», «cota», «PDF»)', 'Search by name, alias or task (e.g. "parallel", "dimension", "PDF")')} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={tr(lang, 'Buscar comandos', 'Search commands')} />
          <table className="grid">
            <tbody>
              {commands.map((c) => (
                <tr key={c.name}>
                  <td style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    <code>{c.name}</code>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{aliasesFor(c.name).slice(0, 4).join(' · ')}</div>
                  </td>
                  <td style={{ verticalAlign: 'top' }}>
                    <strong>{c.label[lang]}</strong>
                    <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>{c.description[lang]}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', verticalAlign: 'top', color: 'var(--ink-muted)' }}>{CATEGORY[c.category]?.[lang] ?? c.category}</td>
                  <td style={{ verticalAlign: 'top', textAlign: 'right' }}>
                    <button className="btn btn--sm" onClick={() => (onClose(), editor.command(c.name))} aria-label={tr(lang, `Ejecutar ${c.name}`, `Run ${c.name}`)}>
                      <Play size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!commands.length && <p className="empty">{tr(lang, 'Ningún comando coincide.', 'No command matches.')}</p>}
        </div>
      )}

      {tab === 'features' && (
        <div className="report">
          <div className="report__chips">
            <button className={`btn btn--sm${status === 'all' ? ' btn--accent' : ''}`} onClick={() => setStatus('all')}>
              {tr(lang, 'Todas', 'All')} {FEATURES.length}
            </button>
            {(Object.keys(STATUS_LABEL) as FeatureStatus[]).map((s) => (
              <button key={s} className={`btn btn--sm${status === s ? ' btn--accent' : ''}`} onClick={() => setStatus(s)} disabled={!counts[s]}>
                {STATUS_LABEL[s][lang]} {counts[s] ?? 0}
              </button>
            ))}
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th>{tr(lang, 'Área', 'Area')}</th>
                <th>{tr(lang, 'Función', 'Feature')}</th>
                <th>{tr(lang, 'Estado', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.filter((f) => status === 'all' || f.status === status).map((f, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--ink-muted)', verticalAlign: 'top' }}>{f.area[lang]}</td>
                  <td>
                    {f.name[lang]}
                    {f.note && <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{f.note[lang]}</div>}
                    {f.commands && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                        {f.commands.map((c) => (
                          <button key={c} className="report__chip" style={{ border: 0, cursor: 'pointer' }} onClick={() => findCommand(c) && (onClose(), editor.command(c))} title={findCommand(c)?.label[lang]}>
                            <code>{c}</code>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ verticalAlign: 'top' }}>
                    <span className={`status-pill status-pill--${STATUS_LABEL[f.status].tone}`}>{STATUS_LABEL[f.status][lang]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'keys' && (
        <div className="report">
          <table className="grid">
            <tbody>
              {[
                [tr(lang, 'Escribir en cualquier momento', 'Type anytime'), tr(lang, 'Nombre o alias de comando (L, C, TR, O…); Intro o Espacio ejecuta; Intro vacío repite el último', 'Command name or alias (L, C, TR, O…); Enter or Space runs; empty Enter repeats the last one')],
                ['Ctrl+K', tr(lang, 'Paleta de comandos', 'Command palette')],
                ['Esc', tr(lang, 'Cancela el comando o limpia la selección', 'Cancels the command or clears the selection')],
                ['Tab', tr(lang, 'Alterna entre candidatos de referencia a objetos', 'Cycles object snap candidates')],
                ['Mayús + clic', tr(lang, 'Quita de la selección', 'Removes from selection')],
                [tr(lang, 'Arrastre hacia la derecha / izquierda', 'Drag right / left'), tr(lang, 'Ventana (objetos completos) / captura (objetos tocados)', 'Window (whole objects) / crossing (touched objects)')],
                [tr(lang, 'Rueda / botón central', 'Wheel / middle button'), tr(lang, 'Zoom en el cursor / encuadre; doble clic central = extensión', 'Zoom at cursor / pan; middle double-click = extents')],
                [tr(lang, 'Dos dedos en el panel táctil', 'Two fingers on a trackpad'), tr(lang, 'Encuadre; el pellizco hace zoom. Se puede fijar en Opciones › Visualización', 'Pan; pinch zooms. It can be fixed in Options › Display')],
                [tr(lang, 'Un dedo / dos dedos (pantalla táctil)', 'One finger / two fingers (touchscreen)'), tr(lang, 'Sitúa el punto con lupa o encuadra; pulsación larga = clic derecho; doble pulsación = doble clic', 'Places the point with a magnifier or pans; long press = right-click; double tap = double-click')],
                [tr(lang, 'Clic derecho', 'Right-click'), tr(lang, 'Intro (termina la designación o repite)', 'Enter (ends selection or repeats)')],
                [tr(lang, 'Doble clic en presentación', 'Double-click in layout'), tr(lang, 'Entra o sale de un viewport', 'Enters or leaves a viewport')],
                ['@x,y · @d<a · x,y', tr(lang, 'Coordenadas relativas, polares y absolutas', 'Relative, polar and absolute coordinates')],
                ['END, MID, CEN, INT, PER, TAN, NEA…', tr(lang, 'Referencia a objeto temporal durante un comando', 'Temporary object snap inside a command')],
                ...Object.entries(editor.prefs.shortcuts).map(([k, v]) => [k, `${v} — ${findCommand(v)?.label[lang] ?? ''}`]),
              ].map(([k, v], i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'about' && (
        <div className="report" style={{ fontSize: 13, lineHeight: 1.55 }}>
          <p style={{ margin: 0 }}>
            <strong>FModel 2D CAD</strong> — {tr(lang, 'CAD 2D profesional en el navegador, parte de FusionStructure.', 'Professional 2D CAD in the browser, part of FusionStructure.')}
          </p>
          <p style={{ margin: 0 }}>{tr(lang, 'Local-first: los dibujos, versiones y autoguardados se quedan en este navegador; nada se envía a servidores.', 'Local-first: drawings, versions and autosaves stay in this browser; nothing is sent to servers.')}</p>
          <p style={{ margin: 0 }}>{tr(lang, 'Formatos: .fmodel nativo (sin pérdidas), DXF R12–R2018 de entrada y R2010 de salida con informe de conversión, PDF vectorial, SVG y lectura experimental de DWG.', 'Formats: native .fmodel (lossless), DXF R12–R2018 input and R2010 output with conversion report, vector PDF, SVG and experimental DWG reading.')}</p>
          <p style={{ margin: 0 }}>{tr(lang, 'Alcance estrictamente 2D: sin BIM, IFC, sólidos, mallas ni render 3D.', 'Strictly 2D scope: no BIM, IFC, solids, meshes or 3D rendering.')}</p>
        </div>
      )}
    </Dialog>
  );
}
