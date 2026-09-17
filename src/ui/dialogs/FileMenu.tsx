import { useEffect, useState } from 'react';
import { getServices } from '../../app/services';
import type { Editor } from '../../editor/editor';
import type { StoredDrawing } from '../../storage/persistence';
import { readPackage } from '../../io/native';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';

export function FileMenu({ editor, onClose, onUi }: { editor: Editor; onClose: () => void; onUi: (ui: string, cmd?: string) => void }) {
  const lang = editor.lang;
  const [drawings, setDrawings] = useState<StoredDrawing[]>([]);
  useEffect(() => {
    void getServices().persistence.drawings().then(setDrawings);
  }, []);
  const run = (cmd: string) => {
    onClose();
    editor.command(cmd);
  };
  const groups: { title: string; items: [string, string, string][] }[] = [
    {
      title: tr(lang, 'Dibujo', 'Drawing'),
      items: [
        ['NEW', tr(lang, 'Nuevo', 'New'), 'Ctrl+N'],
        ['OPEN', tr(lang, 'Abrir .fmodel / DXF…', 'Open .fmodel / DXF…'), 'Ctrl+O'],
        ['QSAVE', tr(lang, 'Guardar', 'Save'), 'Ctrl+S'],
        ['SAVEAS', tr(lang, 'Guardar como…', 'Save as…'), 'Ctrl+Shift+S'],
        ['VERSIONS', tr(lang, 'Historial de versiones', 'Version history'), ''],
        ['RECOVER', tr(lang, 'Recuperar autoguardado', 'Recover autosave'), ''],
      ],
    },
    {
      title: tr(lang, 'Intercambio', 'Exchange'),
      items: [
        ['IMPORTDXF', tr(lang, 'Importar DXF en el dibujo…', 'Import DXF into drawing…'), ''],
        ['EXPORTDXF', tr(lang, 'Exportar DXF', 'Export DXF'), ''],
        ['EXPORTSVG', tr(lang, 'Exportar SVG', 'Export SVG'), ''],
        ['PLOT', tr(lang, 'Trazar a PDF vectorial…', 'Plot to vector PDF…'), 'Ctrl+P'],
        ['PUBLISH', tr(lang, 'Publicar presentaciones (PDF)…', 'Publish layouts (PDF)…'), ''],
        ['EXPORTJSON', tr(lang, 'JSON de depuración', 'Debug JSON'), ''],
      ],
    },
    {
      title: tr(lang, 'Calidad y ajustes', 'Quality & settings'),
      items: [
        ['AUDIT', tr(lang, 'Auditar dibujo', 'Audit drawing'), ''],
        ['HEALTHREPORT', tr(lang, 'Informe de salud', 'Health report'), ''],
        ['PURGE', tr(lang, 'Limpiar elementos sin uso', 'Purge unused'), ''],
        ['OPTIONS', tr(lang, 'Opciones, alias y atajos', 'Options, aliases & shortcuts'), ''],
        ['HELP', tr(lang, 'Ayuda y estado de funciones', 'Help & feature status'), 'F1'],
      ],
    },
  ];
  return (
    <Dialog title={tr(lang, 'Archivo', 'File')} onClose={onClose} lang={lang} wide>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {groups.map((g) => (
          <div key={g.title}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {g.title}
            </div>
            {g.items.map(([cmd, label, kbd]) => (
              <button key={cmd} className="menu-item" onClick={() => (cmd === 'OPTIONS' ? (onClose(), onUi('options')) : run(cmd))}>
                <span>{label}</span>
                {kbd && <kbd>{kbd}</kbd>}
              </button>
            ))}
          </div>
        ))}
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {tr(lang, 'Guardados en este navegador', 'Stored in this browser')}
          </div>
          {drawings.slice(0, 12).map((d) => (
            <div key={d.id} className="list-row">
              <button
                className="menu-item"
                style={{ flex: 1 }}
                onClick={() => {
                  if (editor.doc.dirty && !window.confirm(tr(lang, 'Hay cambios sin guardar. ¿Descartarlos?', 'Unsaved changes. Discard them?'))) return;
                  const res = readPackage(d.bytes);
                  editor.doc.replaceData(res.data);
                  editor.fileName = d.name.replace(/\.fmodel$/, '');
                  editor.zoomExtents();
                  onClose();
                }}
              >
                <span>{d.name}</span>
                <small style={{ marginLeft: 'auto', color: 'var(--ink-muted)' }}>{new Date(d.savedAt).toLocaleString()}</small>
              </button>
              <button className="btn btn--sm btn--danger" onClick={() => void getServices().persistence.deleteDrawing(d.id).then(() => getServices().persistence.drawings().then(setDrawings))}>
                ×
              </button>
            </div>
          ))}
          {!drawings.length && <div className="empty">{tr(lang, 'Aún no hay dibujos guardados localmente.', 'No locally stored drawings yet.')}</div>}
        </div>
      </div>
    </Dialog>
  );
}
