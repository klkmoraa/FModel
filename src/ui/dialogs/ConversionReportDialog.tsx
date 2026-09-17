import { downloadBlob } from '../../storage/fileAccess';
import type { Editor } from '../../editor/editor';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';

export interface ConversionPayload {
  kind: 'import' | 'export';
  name: string;
  report: {
    version?: string;
    imported?: Record<string, number>;
    exported?: Record<string, number>;
    transformed: Record<string, { count: number; reason: string }>;
    ignored: Record<string, { count: number; reason: string }>;
    warnings: string[];
    layers?: number;
    blocks?: number;
    layouts?: number;
    units?: string;
  };
}

/** Informe de compatibilidad DXF: qué se conservó, qué se transformó y qué no se admite. */
export function ConversionReportDialog({ editor, payload, onClose }: { editor: Editor; payload: ConversionPayload | undefined; onClose: () => void }) {
  const lang = editor.lang;
  if (!payload) return null;
  const { kind, name, report } = payload;
  const kept = (kind === 'import' ? report.imported : report.exported) ?? {};
  const keptRows = Object.entries(kept).sort((a, b) => b[1] - a[1]);
  const transformedRows = Object.entries(report.transformed);
  const ignoredRows = Object.entries(report.ignored);
  const total = keptRows.reduce((a, [, n]) => a + n, 0);

  const asText = () =>
    [
      `${kind === 'import' ? 'Importación' : 'Exportación'} DXF — ${name}`,
      report.version ? `Versión: ${report.version}` : '',
      '',
      '[Conservado]',
      ...keptRows.map(([t, n]) => `${t}\t${n}`),
      '',
      '[Transformado]',
      ...transformedRows.map(([t, v]) => `${t}\t${v.count}\t${v.reason}`),
      '',
      '[No admitido]',
      ...ignoredRows.map(([t, v]) => `${t}\t${v.count}\t${v.reason}`),
      '',
      '[Avisos]',
      ...report.warnings,
    ].join('\n');

  return (
    <Dialog
      wide
      lang={lang}
      title={kind === 'import' ? tr(lang, `Informe de importación DXF · ${name}`, `DXF import report · ${name}`) : tr(lang, `Informe de exportación DXF · ${name}`, `DXF export report · ${name}`)}
      onClose={onClose}
      footer={
        <>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-muted)' }}>
            {report.version ? `${report.version} · ` : ''}
            {tr(lang, `${total} objeto(s) nativos`, `${total} native object(s)`)}
            {report.layers !== undefined ? tr(lang, ` · ${report.layers} capa(s)`, ` · ${report.layers} layer(s)`) : ''}
            {report.blocks !== undefined ? tr(lang, ` · ${report.blocks} bloque(s)`, ` · ${report.blocks} block(s)`) : ''}
            {report.layouts !== undefined ? tr(lang, ` · ${report.layouts} presentación(es)`, ` · ${report.layouts} layout(s)`) : ''}
          </span>
          <button className="btn" onClick={() => downloadBlob(new Blob([asText()], { type: 'text/plain' }), `${name.replace(/\.[^.]+$/, '')}-informe-dxf.txt`)}>
            {tr(lang, 'Guardar informe', 'Save report')}
          </button>
          <button className="btn btn--primary" onClick={onClose}>
            {tr(lang, 'Cerrar', 'Close')}
          </button>
        </>
      }
    >
      <div className="report">
        <section>
          <h3 className="eyebrow">{tr(lang, 'Conservado', 'Preserved')}</h3>
          {keptRows.length ? (
            <div className="report__chips">
              {keptRows.map(([t, n]) => (
                <span key={t} className="report__chip">
                  <code>{t}</code> {n}
                </span>
              ))}
            </div>
          ) : (
            <p className="empty">{tr(lang, 'Ningún objeto.', 'No objects.')}</p>
          )}
        </section>
        <section>
          <h3 className="eyebrow">{tr(lang, 'Transformado', 'Transformed')}</h3>
          {transformedRows.length ? (
            <table className="grid">
              <tbody>
                {transformedRows.map(([t, v]) => (
                  <tr key={t}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <code>{t}</code>
                    </td>
                    <td style={{ textAlign: 'right' }}>{v.count}</td>
                    <td>{v.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">{tr(lang, 'Nada tuvo que transformarse.', 'Nothing had to be transformed.')}</p>
          )}
        </section>
        <section>
          <h3 className="eyebrow">{tr(lang, 'No admitido', 'Not supported')}</h3>
          {ignoredRows.length ? (
            <table className="grid">
              <tbody>
                {ignoredRows.map(([t, v]) => (
                  <tr key={t}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <code>{t}</code>
                    </td>
                    <td style={{ textAlign: 'right' }}>{v.count}</td>
                    <td>{v.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">{tr(lang, 'Todo tiene soporte.', 'Everything is supported.')}</p>
          )}
        </section>
        {report.warnings.length > 0 && (
          <section>
            <h3 className="eyebrow">{tr(lang, 'Avisos', 'Warnings')}</h3>
            <ul className="report__warnings">
              {report.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}
