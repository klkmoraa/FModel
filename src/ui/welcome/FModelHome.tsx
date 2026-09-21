import {
  ArrowUpRight,
  FolderOpen,
  FilePlus2,
  LayoutTemplate,
  Play,
} from 'lucide-react';
import type { Editor } from '../../editor/editor';
import { ActiveDrawingStage, FeaturedTemplateStage } from './HeroStage';
import { QuickStart } from './QuickStart';
import { RecentDrawings } from './RecentDrawings';
import { Capabilities } from './Capabilities';
import { BrandMark } from '../icons';
import { confirmDiscard, openTemplate } from './actions';
import type { TemplateDefinition } from '../../templates';
import { MODEL_SPACE_ID } from '../../document/types';
import { tr } from '../controls';

export interface FModelHomeProps {
  editor: Editor;
  dark: boolean;
  onContinue: () => void;
  onCreateBlank: () => void;
  onOpenTemplates: () => void;
  onOpenDrawings: () => void;
  onOpenLibrary: () => void;
  onOpenImport: () => void;
}

const GitHubIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

export function FModelHome({
  editor,
  dark,
  onContinue,
  onCreateBlank,
  onOpenTemplates,
  onOpenDrawings,
  onOpenLibrary,
  onOpenImport,
}: FModelHomeProps) {
  const lang = editor.lang;
  // Solo cuenta lo dibujado en el modelo: las definiciones de bloque y el papel no son «contenido»
  const entityCount = editor.doc.entitiesOf(MODEL_SPACE_ID).length;
  const layerCount = editor.doc.data.layers.size;
  const blockCount = [...editor.doc.data.blocks.values()].filter((b) => b.kind === 'normal').length;
  const hasContent = entityCount > 0;

  const openFeatured = async (tpl: TemplateDefinition) => {
    if (!(await confirmDiscard(editor))) return;
    openTemplate(editor, tpl);
    onContinue();
  };
  const openFile = () => {
    editor.command('OPEN');
    onContinue();
  };
  const activeTitle = editor.fileName || editor.doc.settings.title || tr(lang, 'Sin título', 'Untitled');

  return (
    <div className="fmodel-home">
      {/* Hero técnico principal */}
      <section className="fmodel-hero" aria-labelledby="fmodel-hero-title">
        <div className="fmodel-hero__copy">
          <span className="fmodel-hero__eyebrow">
            FS-M01 <b>·</b> {tr(lang, 'DIBUJO CAD', 'CAD DRAFTING')}
          </span>
          <h1 id="fmodel-hero-title" className="fmodel-hero__name">
            {tr(lang, 'Del trazo al plano.', 'From line to blueprint.')}
          </h1>
          <p className="fmodel-hero__lead">
            {tr(
              lang,
              'CAD 2D profesional, local-first y en el navegador. Dibuja, acota y documenta sin intermediarios.',
              'Professional, local-first 2D CAD in your browser. Draft, dimension, and document without middle steps.',
            )}
          </p>

          {hasContent ? (
            <div className="fmodel-open">
              <div className="fmodel-open__head">
                <span className="fmodel-open__label">{tr(lang, 'Dibujo activo', 'Active drawing')}</span>
                <h2 className="fmodel-open__name" title={activeTitle}>
                  {activeTitle}
                  {editor.doc.dirty && <span className="fmodel-open__dirty">{tr(lang, 'sin guardar', 'unsaved')}</span>}
                </h2>
                <p className="fmodel-open__counts">
                  <span>
                    <b>{entityCount}</b> {tr(lang, 'entidades', 'entities')}
                  </span>
                  <span>
                    <b>{layerCount}</b> {tr(lang, 'capas', 'layers')}
                  </span>
                  <span>
                    <b>{blockCount}</b> {tr(lang, 'bloques', 'blocks')}
                  </span>
                </p>
              </div>
              <div className="fmodel-open__actions">
                <button type="button" className="fmodel-action fmodel-action--primary" onClick={onContinue}>
                  <Play size={16} fill="currentColor" aria-hidden="true" />
                  <span>{tr(lang, 'Continuar', 'Continue')}</span>
                </button>
                <button type="button" className="fmodel-action" onClick={onCreateBlank}>
                  <FilePlus2 size={16} aria-hidden="true" />
                  <span>{tr(lang, 'Nuevo dibujo', 'New drawing')}</span>
                </button>
                <button type="button" className="fmodel-action" onClick={openFile}>
                  <FolderOpen size={16} aria-hidden="true" />
                  <span>{tr(lang, 'Abrir archivo', 'Open file')}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="fmodel-start">
              <button type="button" className="fmodel-action fmodel-action--primary" onClick={onCreateBlank}>
                <FilePlus2 size={16} aria-hidden="true" />
                <span>{tr(lang, 'Nuevo dibujo', 'New drawing')}</span>
              </button>
              <button type="button" className="fmodel-action" onClick={onOpenTemplates}>
                <LayoutTemplate size={16} aria-hidden="true" />
                <span>{tr(lang, 'Desde plantilla', 'From template')}</span>
              </button>
              <button type="button" className="fmodel-action" onClick={openFile}>
                <FolderOpen size={16} aria-hidden="true" />
                <span>{tr(lang, 'Abrir archivo', 'Open file')}</span>
              </button>
            </div>
          )}
        </div>

        <div className="fmodel-hero__stage">
          {hasContent ? (
            <ActiveDrawingStage editor={editor} dark={dark} title={activeTitle} onContinue={onContinue} />
          ) : (
            <FeaturedTemplateStage editor={editor} dark={dark} onOpen={openFeatured} />
          )}
        </div>
      </section>

      <RecentDrawings editor={editor} dark={dark} onOpened={onContinue} onSeeAll={onOpenDrawings} />

      <QuickStart
        editor={editor}
        dark={dark}
        featuredShown={!hasContent}
        onOpenTemplate={openFeatured}
        onSeeTemplates={onOpenTemplates}
        onOpenImport={onOpenImport}
        onOpenLibrary={onOpenLibrary}
        onInstallLibrary={() => {
          // El progreso se informa en la línea de comandos: se instala desde el lienzo
          editor.command('LIBRARYSTARTER');
          onContinue();
        }}
      />

      <Capabilities lang={lang} />

      {/* Pie: marca, versión, datos verificables y autoría */}
      <footer className="fmodel-footer" aria-label={tr(lang, 'Acerca de FModel', 'About FModel')}>
        <div className="fmodel-footer__brand">
          <BrandMark size={24} />
          <span>
            <strong>FModel 2D CAD</strong>
            <small>FS-M01 · v{__APP_VERSION__}</small>
          </span>
        </div>
        <ul className="fmodel-footer__facts">
          <li>{tr(lang, 'Local-first · sin cuenta', 'Local-first · no account')}</li>
          <li>{tr(lang, 'Español · English', 'English · Español')}</li>
        </ul>
        <p className="fmodel-footer__credit">
          {tr(lang, 'Creado por', 'Created by')} <strong>Cristian Mora</strong> · FusionStructure
        </p>
        <a href="https://github.com/klkmoraa/FModel" target="_blank" rel="noopener noreferrer" className="fmodel-footer__github">
          <GitHubIcon size={14} />
          <span>klkmoraa/FModel</span>
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
