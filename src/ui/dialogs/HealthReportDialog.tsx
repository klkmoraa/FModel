import { AlertTriangle, CircleX, Info } from 'lucide-react';
import { useState } from 'react';
import type { HealthCategory, HealthIssue, HealthReport } from '../../audit/health';
import type { Editor } from '../../editor/editor';
import { downloadBlob } from '../../storage/fileAccess';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';

const CATEGORY: Record<HealthCategory, { es: string; en: string }> = {
  geometry: { es: 'Geometría', en: 'Geometry' },
  duplicates: { es: 'Duplicados', en: 'Duplicates' },
  references: { es: 'Referencias', en: 'References' },
  blocks: { es: 'Bloques', en: 'Blocks' },
  standards: { es: 'Estándares', en: 'Standards' },
  unused: { es: 'Sin uso', en: 'Unused' },
};

function SeverityIcon({ s }: { s: HealthIssue['severity'] }) {
  if (s === 'error') return <CircleX size={14} color="var(--fm-danger)" aria-label="error" />;
  if (s === 'warning') return <AlertTriangle size={14} color="var(--fs-signal-attention)" aria-label="aviso" />;
  return <Info size={14} color="var(--ink-muted)" aria-label="info" />;
}

/** Informe de salud: puntuación, problemas por categoría y acceso a los objetos afectados. */
export function HealthReportDialog({ editor, payload, onClose }: { editor: Editor; payload: { report: HealthReport; fixed: number } | undefined; onClose: () => void }) {
  const lang = editor.lang;
  const [filter, setFilter] = useState<HealthCategory | 'all'>('all');
  if (!payload) return null;
  const { report, fixed } = payload;
  const fixable = report.issues.filter((i) => i.fixable).length;
  const shown = report.issues.filter((i) => filter === 'all' || i.category === filter);
  const tone = report.score >= 90 ? 'var(--fs-status-disponible)' : report.score >= 60 ? 'var(--fs-signal-attention)' : 'var(--fm-danger)';

  const show = (issue: HealthIssue) => {
    const ids = (issue.entityIds ?? []).filter((id) => editor.doc.entity(id));
    if (!ids.length) {
      if (issue.record?.coll === 'layers') {
        onClose();
        editor.command('LAYER');
      }
      return;
    }
    const owner = editor.doc.entity(ids[0])!.owner;
    if (editor.inputOwner !== owner && (editor.doc.data.layouts.has(owner) || owner === '*model')) editor.setSpace(owner);
    editor.selection.set(ids.filter((id) => editor.doc.entity(id)?.owner === owner));
    editor.zoomSelection();
    onClose();
  };

  const markdown = () =>
    [
      `# Informe de salud — ${editor.doc.settings.title}`,
      '',
      `Puntuación: **${report.score}/100** · ${report.entities} objetos · ${new Date(report.at).toLocaleString()}`,
      '',
      ...(Object.keys(CATEGORY) as HealthCategory[]).map((c) => `- ${CATEGORY[c].es}: ${report.counts[c]}`),
      '',
      '| Gravedad | Categoría | Problema | Objetos | Corregible |',
      '|---|---|---|---|---|',
      ...report.issues.map((i) => `| ${i.severity} | ${CATEGORY[i.category].es} | ${i.message.es.replace(/\|/g, '\\|')} | ${i.entityIds?.length ?? 0} | ${i.fixable ? 'sí' : 'no'} |`),
    ].join('\n');

  return (
    <Dialog
      wide
      lang={lang}
      title={tr(lang, 'Informe de salud del dibujo', 'Drawing health report')}
      onClose={onClose}
      footer={
        <>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-muted)' }}>
            {fixed ? tr(lang, `${fixed} corrección(es) aplicadas (se pueden deshacer). `, `${fixed} fix(es) applied (undoable). `) : ''}
            {tr(lang, `${report.issues.length} problema(s) · ${fixable} corregible(s)`, `${report.issues.length} issue(s) · ${fixable} fixable`)}
          </span>
          <button className="btn" onClick={() => downloadBlob(new Blob([markdown()], { type: 'text/markdown' }), `${editor.doc.settings.title || 'dibujo'}-salud.md`)}>
            {tr(lang, 'Descargar informe', 'Download report')}
          </button>
          <button className="btn btn--primary" disabled={!fixable} onClick={() => (onClose(), editor.command('AUDIT', ['Yes']))}>
            {tr(lang, `Corregir automáticamente (${fixable})`, `Fix automatically (${fixable})`)}
          </button>
        </>
      }
    >
      <div className="health">
        <div className="health__score" style={{ ['--score-tone' as string]: tone, ['--score' as string]: `${report.score}` }}>
          <div className="health__ring" role="img" aria-label={tr(lang, `Puntuación ${report.score} de 100`, `Score ${report.score} out of 100`)}>
            <span>{report.score}</span>
          </div>
          <div>
            <div className="eyebrow">{tr(lang, 'Puntuación', 'Score')}</div>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink-secondary)' }}>
              {report.score >= 90 ? tr(lang, 'Dibujo en buen estado.', 'Drawing in good shape.') : report.score >= 60 ? tr(lang, 'Hay problemas que conviene revisar.', 'Some issues worth reviewing.') : tr(lang, 'Problemas importantes: revísalos antes de compartir.', 'Significant issues: review before sharing.')}
            </p>
          </div>
        </div>
        <div className="report__chips" role="tablist" aria-label={tr(lang, 'Categorías', 'Categories')}>
          <button role="tab" aria-selected={filter === 'all'} className={`btn btn--sm${filter === 'all' ? ' btn--accent' : ''}`} onClick={() => setFilter('all')}>
            {tr(lang, 'Todo', 'All')} {report.issues.length}
          </button>
          {(Object.keys(CATEGORY) as HealthCategory[]).map((c) => (
            <button key={c} role="tab" aria-selected={filter === c} disabled={!report.counts[c]} className={`btn btn--sm${filter === c ? ' btn--accent' : ''}`} onClick={() => setFilter(c)}>
              {CATEGORY[c][lang]} {report.counts[c]}
            </button>
          ))}
        </div>
        {shown.length ? (
          <table className="grid">
            <tbody>
              {shown.map((i, n) => (
                <tr key={n}>
                  <td style={{ width: 22 }}>
                    <SeverityIcon s={i.severity} />
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--ink-muted)' }}>{CATEGORY[i.category][lang]}</td>
                  <td>{i.message[lang]}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{i.fixable ? <span className="status-pill status-pill--disponible">{tr(lang, 'corregible', 'fixable')}</span> : null}</td>
                  <td style={{ width: 80, textAlign: 'right' }}>
                    {(i.entityIds?.length || i.record?.coll === 'layers') && (
                      <button className="btn btn--sm" onClick={() => show(i)}>
                        {tr(lang, 'Mostrar', 'Show')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">{tr(lang, 'Sin problemas en esta categoría.', 'No issues in this category.')}</p>
        )}
      </div>
    </Dialog>
  );
}
