import { useMemo, useState } from 'react';
import { ChevronDown, CircleHelp } from 'lucide-react';
import { FEATURES, STATUS_LABEL, type FeatureStatus } from '../../app/features';
import { tr } from '../controls';

const COLLAPSED = 8;
const ORDER: FeatureStatus[] = ['available', 'experimental', 'planned', 'not-committed'];

interface CapabilitiesProps {
  lang: 'es' | 'en';
  onOpenStatusHelp: () => void;
}

/**
 * «Qué hace FModel» sale del registro de funciones (el mismo de la Ayuda y de docs/FEATURES.md):
 * nada se afirma aquí que no esté declarado y probado allí.
 */
export function Capabilities({ lang, onOpenStatusHelp }: CapabilitiesProps) {
  const [filter, setFilter] = useState<FeatureStatus | 'all'>('all');
  const [expanded, setExpanded] = useState(false);

  const counts = useMemo(() => FEATURES.reduce<Partial<Record<FeatureStatus, number>>>((m, f) => ((m[f.status] = (m[f.status] ?? 0) + 1), m), {}), []);
  const areas = new Set(FEATURES.map((f) => f.area.es)).size;
  const list = filter === 'all' ? FEATURES : FEATURES.filter((f) => f.status === filter);
  const visible = expanded ? list : list.slice(0, COLLAPSED);

  return (
    <section className="fmodel-section" aria-labelledby="fmodel-cap-title">
      <header className="fmodel-section__head">
        <div>
          <h2 id="fmodel-cap-title">{tr(lang, 'Qué hace FModel', 'What FModel does')}</h2>
          <p>
            {tr(
              lang,
              `${FEATURES.length} funciones en ${areas} áreas, cada una con su estado declarado. Solo es «Disponible» lo que funciona de extremo a extremo y está probado.`,
              `${FEATURES.length} features across ${areas} areas, each with its declared status. Only what works end to end and is tested is “Available”.`,
            )}
          </p>
        </div>
        <button type="button" className="fmodel-section__link" onClick={onOpenStatusHelp}>
          <CircleHelp size={15} aria-hidden="true" />
          <span>{tr(lang, 'Estado completo', 'Full status')}</span>
        </button>
      </header>

      <div className="welcome-categories" role="tablist" aria-label={tr(lang, 'Filtrar por estado', 'Filter by status')}>
        <button type="button" role="tab" aria-selected={filter === 'all'} className={`welcome-cat-btn${filter === 'all' ? ' is-active' : ''}`} onClick={() => setFilter('all')}>
          {tr(lang, 'Todas', 'All')} <span className="fmodel-count">{FEATURES.length}</span>
        </button>
        {ORDER.filter((s) => counts[s]).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={filter === s} className={`welcome-cat-btn${filter === s ? ' is-active' : ''}`} onClick={() => setFilter(s)}>
            <span className="fmodel-state__dot" data-state={s} aria-hidden="true" />
            {STATUS_LABEL[s][lang]} <span className="fmodel-count">{counts[s]}</span>
          </button>
        ))}
      </div>

      <ul className="fmodel-capabilities">
        {visible.map((f) => (
          <li key={f.name.es} className="fmodel-capability">
            <span className="fmodel-capability__area">{f.area[lang]}</span>
            <strong>{f.name[lang]}</strong>
            {f.status !== 'available' && f.note && <p>{f.note[lang]}</p>}
            <span className="fmodel-capability__foot">
              <span className="fmodel-state" data-state={f.status}>
                <span className="fmodel-state__dot" aria-hidden="true" />
                {STATUS_LABEL[f.status][lang]}
              </span>
              {f.commands?.slice(0, 3).map((c) => (
                <code key={c} className="fmodel-cmd">
                  {c}
                </code>
              ))}
            </span>
          </li>
        ))}
      </ul>

      {list.length > COLLAPSED && (
        <button type="button" className="fmodel-more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          <span>{expanded ? tr(lang, 'Mostrar menos', 'Show less') : tr(lang, `Mostrar las ${list.length}`, `Show all ${list.length}`)}</span>
          <ChevronDown size={15} aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
        </button>
      )}

      <p className="fmodel-note">
        {tr(
          lang,
          'FModel es una herramienta de dibujo técnico. Planos, cotas y anotaciones deben revisarlos una persona técnica responsable antes de usarlos en obra.',
          'FModel is a technical drafting tool. Drawings, dimensions and annotations must be checked by a responsible professional before construction use.',
        )}
      </p>
    </section>
  );
}
