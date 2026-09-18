import { ArrowRight, Play } from 'lucide-react';
import type { Editor } from '../../editor/editor';
import { TEMPLATES_CATALOG, type TemplateDefinition } from '../../templates';
import { tr } from '../controls';
import { useDocumentPreview, useTemplatePreview } from './templatePreview';

interface ActiveProps {
  editor: Editor;
  dark: boolean;
  title: string;
  onContinue: () => void;
}

/** Lámina con la miniatura real del dibujo activo: pulsarla vuelve al lienzo. */
export function ActiveDrawingStage({ editor, dark, title, onContinue }: ActiveProps) {
  const lang = editor.lang;
  const src = useDocumentPreview(editor.doc, editor.ctx, dark, true);
  return (
    <button type="button" className="hero-stage" onClick={onContinue} aria-label={tr(lang, `Continuar con ${title}`, `Continue with ${title}`)}>
      <span className="hero-stage__sheet">
        {src ? <img src={src} alt="" draggable={false} /> : <span className="template-preview-pending" />}
        <span className="hero-stage__chip">{tr(lang, 'Dibujo activo', 'Active drawing')}</span>
      </span>
      <span className="hero-stage__bar">
        <span className="hero-stage__name" title={title}>
          {title}
        </span>
        <span className="hero-stage__go">
          <Play size={13} fill="currentColor" aria-hidden="true" />
          {tr(lang, 'Continuar', 'Continue')}
        </span>
      </span>
    </button>
  );
}

interface FeaturedProps {
  editor: Editor;
  dark: boolean;
  onOpen: (tpl: TemplateDefinition) => void;
}

/** Sin dibujo en curso: la primera plantilla del catálogo, renderizada con su geometría real. */
export function FeaturedTemplateStage({ editor, dark, onOpen }: FeaturedProps) {
  const lang = editor.lang;
  const tpl = TEMPLATES_CATALOG[0];
  const src = useTemplatePreview(tpl, dark, 960, 600);
  return (
    <button type="button" className="hero-stage" onClick={() => onOpen(tpl)} aria-label={tr(lang, `Abrir la plantilla ${tpl.name.es}`, `Open the ${tpl.name.en} template`)}>
      <span className="hero-stage__sheet">
        {src ? <img src={src} alt="" draggable={false} /> : <span className="template-preview-pending" />}
        <span className="hero-stage__chip">{tr(lang, 'Plantilla destacada', 'Featured template')}</span>
      </span>
      <span className="hero-stage__bar">
        <span className="hero-stage__meta">
          <span className="hero-stage__name">{tpl.name[lang]}</span>
          <small>{tpl.format}</small>
        </span>
        <span className="hero-stage__go">
          {tr(lang, 'Abrir', 'Open')}
          <ArrowRight size={14} aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
