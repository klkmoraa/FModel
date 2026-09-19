import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import type { Editor } from '../editor/editor';
import { DraftingSettings } from './dialogs/DraftingSettings';
import { FileMenu } from './dialogs/FileMenu';
import { AttributeExtraction } from './dialogs/AttributeExtraction';
import { CompareDialog } from './dialogs/CompareDialog';
import { ConversionReportDialog, type ConversionPayload } from './dialogs/ConversionReportDialog';
import { HealthReportDialog } from './dialogs/HealthReportDialog';
import { HelpDialog, type HelpTab } from './dialogs/HelpDialog';
import { OptionsDialog } from './dialogs/OptionsDialog';
import { StylesDialog } from './dialogs/StylesDialog';
import { VersionsDialog } from './dialogs/VersionsDialog';
import { LookupTableDialog } from './dialogs/LookupTableDialog';
import { PageSetupDialog } from './dialogs/PageSetupDialog';
import { PublishDialog } from './dialogs/PublishDialog';
import { ReferencesDialog } from './dialogs/ReferencesDialog';
import { LibraryImportDialog } from './dialogs/LibraryImportDialog';
import type { LibraryImportSession } from '../blocks/libraryImport';
import { tr } from './controls';
import { useModalFocusTrap } from './modalFocus';

export interface DialogState {
  id: string;
  cmd?: string;
  /** datos de apertura (p. ej. id de la tabla de consulta) */
  payload?: unknown;
}

export function Dialog({ title, onClose, children, footer, wide, lang }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; lang: 'es' | 'en' }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(dialogRef, onClose);

  return (
    <div className="veil" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className={`dialog${wide ? ' dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="dialog__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={tr(lang, 'Cerrar', 'Close')}>
            <X size={18} />
          </button>
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

type DialogRenderer = (editor: Editor, onClose: () => void, onUi: (ui: string, cmd?: string, payload?: unknown) => void, state: DialogState) => ReactNode;

export const DIALOGS: Record<string, DialogRenderer> = {
  'drafting-settings': (e, close) => <DraftingSettings editor={e} onClose={close} />,
  'file-menu': (e, close, onUi) => <FileMenu editor={e} onClose={close} onUi={onUi} />,
  'attribute-extraction': (e, close) => <AttributeExtraction editor={e} onClose={close} />,
  'lookup-table': (e, close, _onUi, st) => <LookupTableDialog editor={e} tableId={String(st.payload ?? '')} onClose={close} />,
  'page-setup': (e, close, _onUi, st) => <PageSetupDialog editor={e} plot={!!(st.payload as { plot?: boolean } | undefined)?.plot} onClose={close} />,
  publish: (e, close) => <PublishDialog editor={e} onClose={close} />,
  references: (e, close) => <ReferencesDialog editor={e} onClose={close} />,
  'health-report': (e, close, _onUi, st) => <HealthReportDialog editor={e} payload={st.payload as Parameters<typeof HealthReportDialog>[0]['payload']} onClose={close} />,
  compare: (e, close) => <CompareDialog editor={e} onClose={close} />,
  help: (e, close, _onUi, st) => <HelpDialog editor={e} onClose={close} initialTab={(st.payload as { tab?: HelpTab } | undefined)?.tab} />,
  options: (e, close, _onUi, st) => <OptionsDialog editor={e} onClose={close} initialTab={st.cmd === 'ALIASEDIT' ? 'aliases' : st.cmd === 'SHORTCUTS' ? 'shortcuts' : undefined} />,
  styles: (e, close, _onUi, st) => <StylesDialog editor={e} onClose={close} initialTab={styleTabFor(st.cmd)} />,
  versions: (e, close, onUi) => <VersionsDialog editor={e} onClose={close} onUi={onUi} />,
  'library-import': (e, close, onUi, st) => <LibraryImportDialog editor={e} session={st.payload as LibraryImportSession | undefined} onClose={close} onUi={onUi} />,
  'conversion-report': (e, close, _onUi, st) => <ConversionReportDialog editor={e} payload={st.payload as ConversionPayload | undefined} onClose={close} />,
};

/** Pestaña inicial del administrador de estilos según el alias usado (DIMSTYLE, TABLESTYLE…). */
function styleTabFor(cmd?: string) {
  const c = (cmd ?? '').toUpperCase();
  if (c === 'DIMSTYLE' || c === 'D') return 'dimStyles' as const;
  if (c === 'MLEADERSTYLE' || c === 'MLS') return 'mleaderStyles' as const;
  if (c === 'TABLESTYLE' || c === 'TS') return 'tableStyles' as const;
  if (c === 'MLSTYLE') return 'mlineStyles' as const;
  if (c === 'SCALELISTEDIT' || c === 'ESCALAS') return 'scales' as const;
  return undefined;
}

export function registerDialog(id: string, render: DialogRenderer) {
  DIALOGS[id] = render;
}

export function Dialogs({ editor, state, onClose, onUi }: { editor: Editor; state: DialogState | null; onClose: () => void; onUi: (ui: string, cmd?: string, payload?: unknown) => void }) {
  if (!state) return null;
  const render = DIALOGS[state.id];
  if (!render) return null;
  return <>{render(editor, onClose, onUi, state)}</>;
}
