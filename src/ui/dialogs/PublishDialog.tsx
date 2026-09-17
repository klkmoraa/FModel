import { useState } from 'react';
import { paperExtents } from '../../document/defaults';
import type { Id } from '../../document/types';
import { MODEL_SPACE_ID } from '../../document/types';
import type { Editor } from '../../editor/editor';
import { pageFor } from '../../output/plot';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';

/** Lista de hojas para publicar en un PDF multipágina, en el orden de las pestañas. */
export function PublishDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const lang = editor.lang;
  const doc = editor.doc;
  const layouts = [...doc.data.layouts.values()].sort((a, b) => a.tabOrder - b.tabOrder);
  const sheets: { id: Id; name: string }[] = [{ id: MODEL_SPACE_ID, name: tr(lang, 'Modelo', 'Model') }, ...layouts.map((l) => ({ id: l.id, name: l.name }))];
  const [checked, setChecked] = useState<Set<Id>>(() => new Set(layouts.map((l) => l.id)));
  const toggle = (id: Id, on: boolean) =>
    setChecked((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const selected = sheets.filter((s) => checked.has(s.id)).map((s) => s.id);

  return (
    <Dialog
      lang={lang}
      title={tr(lang, 'Publicar PDF', 'Publish PDF')}
      onClose={onClose}
      footer={
        <>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-muted)' }}>{tr(lang, `${selected.length} hoja(s) · cada una con su configuración de página`, `${selected.length} sheet(s) · each with its own page setup`)}</span>
          <button className="btn" onClick={onClose}>
            {tr(lang, 'Cancelar', 'Cancel')}
          </button>
          <button className="btn btn--primary" disabled={!selected.length} onClick={() => (onClose(), editor.command('PUBLISH', selected))}>
            {tr(lang, 'Publicar', 'Publish')}
          </button>
        </>
      }
    >
      <table className="grid">
        <thead>
          <tr>
            <th style={{ width: 32 }} />
            <th>{tr(lang, 'Hoja', 'Sheet')}</th>
            <th>{tr(lang, 'Papel', 'Paper')}</th>
            <th>{tr(lang, 'Área', 'Area')}</th>
            <th>{tr(lang, 'Estilo', 'Style')}</th>
          </tr>
        </thead>
        <tbody>
          {sheets.map((s) => {
            const page = pageFor(doc, s.id);
            const ext = paperExtents(page);
            return (
              <tr key={s.id}>
                <td>
                  <input type="checkbox" checked={checked.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} aria-label={tr(lang, `Incluir ${s.name}`, `Include ${s.name}`)} />
                </td>
                <td>{s.name}</td>
                <td>
                  {page.paper} · {Math.round(ext.width)} × {Math.round(ext.height)}
                </td>
                <td>{page.plotArea === 'layout' ? tr(lang, 'Presentación', 'Layout') : page.plotArea === 'extents' ? tr(lang, 'Extensión', 'Extents') : tr(lang, 'Ventana', 'Window')}</td>
                <td>{page.plotStyle === 'color' ? tr(lang, 'Color', 'Color') : page.plotStyle === 'monochrome' ? tr(lang, 'Monocromo', 'Monochrome') : tr(lang, 'Grises', 'Grayscale')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Dialog>
  );
}
