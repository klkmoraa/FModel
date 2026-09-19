import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Editor } from '../../editor/editor';
import { TEMPLATES_CATALOG, type TemplateDefinition } from '../../templates';
import { tr } from '../controls';
import { confirmDiscard, openTemplate } from './actions';
import { templateStats, useTemplatePreview, type TemplateStats } from './templatePreview';
import { matchesQuery } from './welcomeSearch';

interface TemplatesViewProps {
  editor: Editor;
  dark: boolean;
  onOpenWorkspace: () => void;
  searchFilter?: string;
}

export function TemplatesView({ editor, dark, onOpenWorkspace, searchFilter = '' }: TemplatesViewProps) {
  const lang = editor.lang;
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filtered = TEMPLATES_CATALOG.filter((tpl) => {
    const matchesSearch = matchesQuery(searchFilter, [tpl.name[lang], tpl.description[lang], tpl.badge[lang], tpl.format]);
    const matchesCat = selectedCategory === 'all' || tpl.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleOpenTemplate = async (tpl: TemplateDefinition) => {
    if (!(await confirmDiscard(editor))) return;
    openTemplate(editor, tpl);
    onOpenWorkspace();
  };

  const categories = [
    { id: 'all', label: tr(lang, 'Todas', 'All') },
    { id: 'architectural', label: tr(lang, 'Arquitectura', 'Architecture') },
    { id: 'structural', label: tr(lang, 'Estructura', 'Structure') },
    { id: 'sheet', label: tr(lang, 'Formatos de lámina', 'Sheet formats') },
  ].map((c) => ({ ...c, count: c.id === 'all' ? TEMPLATES_CATALOG.length : TEMPLATES_CATALOG.filter((t) => t.category === c.id).length }));

  return (
    <section className="welcome-view welcome-templates" aria-label={tr(lang, 'Plantillas', 'Templates')}>
      <header className="welcome-view__head">
        <div>
          <h2>{tr(lang, 'Plantillas', 'Templates')}</h2>
          <p>
            {tr(
              lang,
              'Dibujos de partida completos: capas normalizadas, estilos de cota a escala, bloques y presentación lista para imprimir. La vista previa es la geometría real.',
              'Complete starting drawings: standard layers, scaled dimension styles, blocks and a print-ready layout. The preview is the real geometry.',
            )}
          </p>
        </div>
      </header>

      <div className="welcome-categories" role="tablist" aria-label={tr(lang, 'Categorías', 'Categories')}>
        {categories.map((cat) => (
          <button key={cat.id} type="button" role="tab" aria-selected={selectedCategory === cat.id} className={`welcome-cat-btn${selectedCategory === cat.id ? ' is-active' : ''}`} onClick={() => setSelectedCategory(cat.id)}>
            {cat.label} <span className="fmodel-count">{cat.count}</span>
          </button>
        ))}
      </div>

      <div className="welcome-templates__grid">
        {filtered.map((tpl, i) => (
          <article key={tpl.id} className="welcome-template-card" style={{ '--reveal-step': i } as React.CSSProperties}>
            <button type="button" className="welcome-template-card__preview" onClick={() => handleOpenTemplate(tpl)} aria-label={tr(lang, `Abrir ${tpl.name.es}`, `Open ${tpl.name.en}`)}>
              <TemplatePreview tpl={tpl} dark={dark} lang={lang} />
              <span className="welcome-template-card__badge">{tpl.badge[lang]}</span>
            </button>
            <div className="welcome-template-card__body">
              <span className="welcome-template-card__format">{tpl.format}</span>
              <h3 className="welcome-template-card__title">{tpl.name[lang]}</h3>
              <p className="welcome-template-card__desc">{tpl.description[lang]}</p>
              <TemplateFacts tpl={tpl} lang={lang} />
              <button type="button" className="welcome-action-btn welcome-action-btn--primary" onClick={() => handleOpenTemplate(tpl)}>
                <span>{tr(lang, 'Abrir plantilla', 'Open template')}</span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </div>

      {!filtered.length && (
        <div className="welcome-empty">
          <p>{tr(lang, 'No se encontraron plantillas con el filtro indicado.', 'No templates found matching current filter.')}</p>
        </div>
      )}
    </section>
  );
}

function TemplatePreview({ tpl, dark, lang }: { tpl: TemplateDefinition; dark: boolean; lang: 'es' | 'en' }) {
  const src = useTemplatePreview(tpl, dark);
  if (!src) return <span className="template-preview-pending" aria-hidden="true" />;
  return <img src={src} alt={tr(lang, `Vista previa: ${tpl.name.es}`, `Preview: ${tpl.name.en}`)} className="template-preview-img" draggable={false} />;
}

function TemplateFacts({ tpl, lang }: { tpl: TemplateDefinition; lang: 'es' | 'en' }) {
  const [stats, setStats] = useState<TemplateStats | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setStats(templateStats(tpl)), 0);
    return () => window.clearTimeout(id);
  }, [tpl]);
  if (!stats) return <ul className="welcome-template-card__facts" aria-hidden="true" />;
  const facts = [
    tr(lang, `${stats.layers} capas`, `${stats.layers} layers`),
    stats.dimensions ? tr(lang, `${stats.dimensions} cotas`, `${stats.dimensions} dimensions`) : null,
    stats.blocks ? tr(lang, `${stats.blocks} bloques`, `${stats.blocks} blocks`) : null,
    stats.layouts.length ? tr(lang, 'Presentación A3', 'A3 layout') : null,
  ].filter(Boolean);
  return (
    <ul className="welcome-template-card__facts">
      {facts.map((f) => (
        <li key={f}>{f}</li>
      ))}
    </ul>
  );
}
