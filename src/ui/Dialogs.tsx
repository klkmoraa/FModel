import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Editor } from '../editor/editor';
import { DraftingSettings } from './dialogs/DraftingSettings';
import { FileMenu } from './dialogs/FileMenu';
import { AttributeExtraction } from './dialogs/AttributeExtraction';
import { ConversionReportDialog, type ConversionPayload } from './dialogs/ConversionReportDialog';
import { LookupTableDialog } from './dialogs/LookupTableDialog';
import { PageSetupDialog } from './dialogs/PageSetupDialog';
import { PublishDialog } from './dialogs/PublishDialog';
import { tr } from './controls';

export interface DialogState {
  id: string;
  cmd?: string;
  /** datos de apertura (p. ej. id de la tabla de consulta) */
  payload?: unknown;
}

export function Dialog({ title, onClose, children, footer, wide, lang }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; lang: 'es' | 'en' }) {
  return (
    <div className="veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
      <div className={`dialog${wide ? ' dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={tr(lang, 'Cerrar', 'Close')} autoFocus>
            <X size={18} />
          </button>
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

type DialogRenderer = (editor: Editor, onClose: () => void, onUi: (ui: string, cmd?: string) => void, state: DialogState) => ReactNode;

export const DIALOGS: Record<string, DialogRenderer> = {
  'drafting-settings': (e, close) => <DraftingSettings editor={e} onClose={close} />,
  'file-menu': (e, close, onUi) => <FileMenu editor={e} onClose={close} onUi={onUi} />,
  'attribute-extraction': (e, close) => <AttributeExtraction editor={e} onClose={close} />,
  'lookup-table': (e, close, _onUi, st) => <LookupTableDialog editor={e} tableId={String(st.payload ?? '')} onClose={close} />,
  'page-setup': (e, close, _onUi, st) => <PageSetupDialog editor={e} plot={!!(st.payload as { plot?: boolean } | undefined)?.plot} onClose={close} />,
  publish: (e, close) => <PublishDialog editor={e} onClose={close} />,
  'conversion-report': (e, close, _onUi, st) => <ConversionReportDialog editor={e} payload={st.payload as ConversionPayload | undefined} onClose={close} />,
};

export function registerDialog(id: string, render: DialogRenderer) {
  DIALOGS[id] = render;
}

export function Dialogs({ editor, state, onClose, onUi }: { editor: Editor; state: DialogState | null; onClose: () => void; onUi: (ui: string, cmd?: string) => void }) {
  if (!state) return null;
  const render = DIALOGS[state.id];
  if (!render) return null;
  return <>{render(editor, onClose, onUi, state)}</>;
}
