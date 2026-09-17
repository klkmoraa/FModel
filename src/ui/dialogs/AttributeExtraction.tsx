import { useMemo, useState } from 'react';
import { attributesToCsv, extractAttributes } from '../../blocks/blockOps';
import type { Editor } from '../../editor/editor';
import { downloadBlob } from '../../storage/fileAccess';
import { TABLESTYLE_STANDARD_ID } from '../../document/defaults';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';

export function AttributeExtraction({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const lang = editor.lang;
  const doc = editor.doc;
  const blocks = [...doc.data.blocks.values()].filter((b) => doc.entitiesOf(b.id).some((e) => e.type === 'attdef'));
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(blocks.map((b) => b.id)));
  const data = useMemo(() => extractAttributes(doc, (b) => chosen.has(b.id)), [doc, chosen]);

  const insertTable = () => {
    const cols = ['Block', ...data.tags];
    const rowsData = data.rows.map((r) => [r.block, ...data.tags.map((t) => r.values[t] ?? '')]);
    const h = 2.5;
    onClose();
    // la tabla se crea con los datos extraídos en el centro de la vista actual
    const c = editor.view.center;
    doc.transact('DATAEXTRACTION TABLE', (tx) =>
      tx.addEntity({
        type: 'table',
        owner: editor.inputOwner,
        layer: doc.settings.currentLayer,
        color: 'ByLayer',
        linetype: 'ByLayer',
        linetypeScale: 1,
        lineweight: -1,
        transparency: 'ByLayer',
        visible: true,
        position: c,
        rotation: 0,
        style: TABLESTYLE_STANDARD_ID,
        rowHeights: [h * 3, ...Array(rowsData.length + 1).fill(h * 2.2)],
        columnWidths: cols.map(() => h * 12),
        cells: [cols.map((_, i) => (i === 0 ? { text: tr(lang, 'Extracción de atributos', 'Attribute extraction'), colSpan: cols.length } : { text: '', merged: true })), cols.map((t) => ({ text: t })), ...rowsData.map((r) => r.map((t) => ({ text: t })))],
        titleRow: true,
        headerRow: true,
      } as never),
    );
  };

  return (
    <Dialog
      title={tr(lang, 'Extracción de atributos', 'Attribute extraction')}
      onClose={onClose}
      lang={lang}
      wide
      footer={
        <>
          <button className="btn" disabled={!data.rows.length} onClick={() => downloadBlob(new Blob([attributesToCsv(data)], { type: 'text/csv' }), 'atributos.csv')}>
            CSV
          </button>
          <button className="btn" disabled={!data.rows.length} onClick={() => downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'atributos.json')}>
            JSON
          </button>
          <button className="btn btn--accent" disabled={!data.rows.length} onClick={insertTable}>
            {tr(lang, 'Insertar como tabla', 'Insert as table')}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {blocks.map((b) => (
          <label key={b.id} className="btn btn--sm">
            <input type="checkbox" checked={chosen.has(b.id)} onChange={(e) => setChosen((s) => { const n = new Set(s); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n; })} /> {b.name}
          </label>
        ))}
        {!blocks.length && <div className="empty">{tr(lang, 'Ningún bloque del dibujo tiene atributos.', 'No block in the drawing has attributes.')}</div>}
      </div>
      <div style={{ overflow: 'auto', maxHeight: '50dvh' }}>
        <table className="grid">
          <thead>
            <tr>
              <th>{tr(lang, 'Bloque', 'Block')}</th>
              <th>{tr(lang, 'Capa', 'Layer')}</th>
              <th>X</th>
              <th>Y</th>
              {data.tags.map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.handle} onClick={() => (editor.selection.set([r.handle]), editor.zoomSelection([r.handle]))} style={{ cursor: 'pointer' }}>
                <td>{r.block}</td>
                <td>{r.layer}</td>
                <td>{r.x.toFixed(3)}</td>
                <td>{r.y.toFixed(3)}</td>
                {data.tags.map((t) => (
                  <td key={t}>{r.values[t] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
