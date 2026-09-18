import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Download, FileUp } from 'lucide-react';
import type { Editor } from '../../editor/editor';
import { TEMPLATES_CATALOG, type TemplateDefinition } from '../../templates';
import { loadLibrary } from '../../blocks/libraryStore';
import { tr } from '../controls';
import { useTemplatePreview } from './templatePreview';

interface QuickStartProps {
  editor: Editor;
  dark: boolean;
  /** true si el hero ya muestra la plantilla destacada (dibujo vacío): no la repetimos */
  featuredShown: boolean;
  onOpenTemplate: (tpl: TemplateDefinition) => void;
  onSeeTemplates: () => void;
  onOpenImport: () => void;
  onOpenLibrary: () => void;
  onInstallLibrary: () => void;
}

export function QuickStart({ editor, dark, featuredShown, onOpenTemplate, onSeeTemplates, onOpenImport, onOpenLibrary, onInstallLibrary }: QuickStartProps) {
  const lang = editor.lang;
  const templates = TEMPLATES_CATALOG.slice(featuredShown ? 1 : 0).slice(0, 4);
  const [libraryCount, setLibraryCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    loadLibrary()
      .then((items) => alive && setLibraryCount(items.length))
      .catch(() => alive && setLibraryCount(0));
    return () => {
      alive = false;
    };
  }, []);

  const libraryEmpty = libraryCount === 0;

  return (
    <section className="fmodel-section" aria-labelledby="fmodel-quick-title">
      <header className="fmodel-section__head">
        <div>
          <h2 id="fmodel-quick-title">{tr(lang, 'Empieza desde una plantilla', 'Start from a template')}</h2>
          <p>
            {tr(
              lang,
              'Dibujos completos con capas, cotas, bloques y presentación A3. La vista previa es la geometría real que se abre.',
              'Complete drawings with layers, dimensions, blocks and an A3 layout. The preview is the real geometry that opens.',
            )}
          </p>
        </div>
        <button type="button" className="fmodel-section__link" onClick={onSeeTemplates}>
          <span>{tr(lang, `Ver las ${TEMPLATES_CATALOG.length}`, `See all ${TEMPLATES_CATALOG.length}`)}</span>
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </header>

      <div className="fmodel-quick">
        {templates.map((tpl, i) => (
          <QuickTemplate key={tpl.id} tpl={tpl} dark={dark} lang={lang} step={i} onOpen={() => onOpenTemplate(tpl)} />
        ))}
      </div>

      <div className="fmodel-quick-more">
        <button type="button" className="fmodel-path" style={{ '--path-tone': 'var(--fs-family-interop)' } as React.CSSProperties} onClick={onOpenImport}>
          <span className="fmodel-path__icon" aria-hidden="true">
            <FileUp size={18} />
          </span>
          <strong>{tr(lang, 'Importar un DXF', 'Import a DXF')}</strong>
          <span className="fmodel-path__body">
            {tr(lang, 'AutoCAD R12–R2018 con informe de conversión. Se procesa en tu navegador.', 'AutoCAD R12–R2018 with a conversion report. Processed in your browser.')}
          </span>
          <ArrowUpRight className="fmodel-path__go" size={15} aria-hidden="true" />
        </button>

        {libraryEmpty ? (
          <button type="button" className="fmodel-path" style={{ '--path-tone': 'var(--fs-family-nucleo)' } as React.CSSProperties} onClick={onInstallLibrary}>
            <span className="fmodel-path__icon" aria-hidden="true">
              <Download size={18} />
            </span>
            <strong>{tr(lang, 'Instalar la biblioteca inicial', 'Install the starter library')}</strong>
            <span className="fmodel-path__body">
              {tr(
                lang,
                'Tu biblioteca está vacía. Añade 100 bloques de LibreCAD (GPL-2.0) y 12 muebles paramétricos de FModel.',
                'Your library is empty. Add 100 LibreCAD blocks (GPL-2.0) and 12 FModel parametric furniture pieces.',
              )}
            </span>
            <ArrowUpRight className="fmodel-path__go" size={15} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="fmodel-path" style={{ '--path-tone': 'var(--fs-family-nucleo)' } as React.CSSProperties} onClick={onOpenLibrary}>
            <span className="fmodel-path__icon" aria-hidden="true">
              <BookOpen size={18} />
            </span>
            <strong>{tr(lang, 'Tu biblioteca de bloques', 'Your block library')}</strong>
            <span className="fmodel-path__body">
              {libraryCount === null
                ? tr(lang, 'Consultando la biblioteca…', 'Checking the library…')
                : tr(lang, `${libraryCount} bloques listos para insertar en el lienzo.`, `${libraryCount} blocks ready to insert on the canvas.`)}
            </span>
            <ArrowUpRight className="fmodel-path__go" size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}

function QuickTemplate({ tpl, dark, lang, step, onOpen }: { tpl: TemplateDefinition; dark: boolean; lang: 'es' | 'en'; step: number; onOpen: () => void }) {
  const src = useTemplatePreview(tpl, dark);
  return (
    <button type="button" className="fmodel-quick-card" style={{ '--reveal-step': step } as React.CSSProperties} onClick={onOpen}>
      <span className="fmodel-quick-card__preview">
        {src ? <img src={src} alt="" draggable={false} /> : <span className="template-preview-pending" />}
        <span className="welcome-template-card__badge">{tpl.badge[lang]}</span>
      </span>
      <span className="fmodel-quick-card__body">
        <strong>{tpl.name[lang]}</strong>
        <small>{tpl.format}</small>
      </span>
    </button>
  );
}
