import { useEffect, useRef, useState } from 'react';
import { MATCH_PROPERTY_FIELDS, parseMatchSettings, type MatchSettingsSession } from '../../commands/matchPropertiesSettings';
import type { Editor } from '../../editor/editor';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';
import { useEditorEvents } from '../hooks';

export function MatchSettingsDialog({ editor, payload, onClose }: { editor: Editor; payload: unknown; onClose: () => void }) {
  useEditorEvents(editor, ['command', 'doc']);
  const [session] = useState(() => payload as MatchSettingsSession);
  const [settings, setSettings] = useState(() => ({ ...session?.settings }));
  const current = !!session?.pending && session.doc === editor.doc && session.version === editor.doc.version && session.pending === editor.runner.pending;
  const lang = editor.lang;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; queueMicrotask(() => { if (!mounted.current && session?.pending === editor.runner.pending) editor.runner.submitText(''); }); };
  }, [editor, session]);
  const cancel = () => { if (session?.pending === editor.runner.pending) editor.runner.submitText(''); onClose(); };
  const apply = () => {
    if (!current) return;
    const text = JSON.stringify({ version: 1, properties: settings });
    try { parseMatchSettings(text); } catch { return; }
    editor.runner.submitText(text); onClose();
  };
  const preset = (value: boolean) => setSettings(parseMatchSettings(JSON.stringify({ version: 1, properties: Object.fromEntries(MATCH_PROPERTY_FIELDS.map(field => [field.key, value])) })));
  return <Dialog lang={lang} title={tr(lang, 'Propiedades que se copiarán', 'Properties to copy')} onClose={cancel} footer={<>
    <button type="button" className="btn" onClick={cancel}>{tr(lang, 'Cancelar', 'Cancel')}</button>
    <button type="button" className="btn btn--primary" disabled={!current} onClick={apply}>{tr(lang, 'Aceptar y elegir destinos', 'Apply and select targets')}</button>
  </>}>
    <p className="panel__hint">{tr(lang, 'El origen se conserva. Sólo se copiarán las propiedades marcadas; los ajustes específicos se aplican entre objetos del mismo tipo.', 'The source is retained. Only checked properties will be copied; type-specific settings apply between matching object types.')}</p>
    <div className="btn-row"><button type="button" className="btn" onClick={() => preset(true)}>{tr(lang, 'Todas', 'All')}</button><button type="button" className="btn" onClick={() => preset(false)}>{tr(lang, 'Ninguna', 'None')}</button></div>
    <div className="match-settings-fields">{MATCH_PROPERTY_FIELDS.map(field => <label key={field.key}>
      <input type="checkbox" checked={!!settings[field.key]} disabled={!current} onChange={event => setSettings({ ...settings, [field.key]: event.target.checked })} />{field[lang]}
    </label>)}</div>
    {!current && <p role="alert">{tr(lang, 'La solicitud o el dibujo cambiaron. Cierra y vuelve a abrir Parámetros.', 'The request or drawing changed. Close and reopen Settings.')}</p>}
  </Dialog>;
}
