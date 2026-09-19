import { useState } from 'react';
import { FileCode, FileUp, FolderArchive, HardDriveUpload, Layers, ShieldCheck } from 'lucide-react';
import type { Editor } from '../../editor/editor';
import { FEATURES, STATUS_LABEL, type FeatureStatus } from '../../app/features';
import { requestUi } from '../../app/services';
import { queueLaunchedFile } from '../../commands/file';
import { buildImportSession } from '../../commands/library';
import { loadCategories } from '../../blocks/libraryStore';
import { INPUT_LIMITS } from '../../io/limits';
import { tr } from '../controls';
import { InlineAlert } from './InlineAlert';
import { formatBytes } from './relativeTime';

const OPENABLE = ['.fmodel', '.json', '.dxf', '.dwg'];
const LIBRARY = ['.fmodellib'];

/** Estado declarado en el registro de funciones (nunca escrito a mano aquí). */
function statusOf(prefix: string, fallback: FeatureStatus): FeatureStatus {
  return FEATURES.find((f) => f.name.es.startsWith(prefix))?.status ?? fallback;
}

interface ImportCenterViewProps {
  editor: Editor;
  onOpenWorkspace: () => void;
}

export function ImportCenterView({ editor, onOpenWorkspace }: ImportCenterViewProps) {
  const lang = editor.lang;
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  // En táctil no se arrastran archivos: la zona se toca para elegir
  const [touch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setAlert(null);
    const lower = file.name.toLowerCase();
    const ext = lower.slice(lower.lastIndexOf('.'));
    if (![...OPENABLE, ...LIBRARY].includes(ext)) {
      setAlert(tr(lang, `«${file.name}» no es un formato que FModel lea. Usa .fmodel, .dxf, .dwg o .fmodellib.`, `“${file.name}” is not a format FModel reads. Use .fmodel, .dxf, .dwg or .fmodellib.`));
      return;
    }
    if (file.size > INPUT_LIMITS.maxCompressedBytes) {
      setAlert(tr(lang, `«${file.name}» ocupa ${formatBytes(file.size)}; el máximo es ${formatBytes(INPUT_LIMITS.maxCompressedBytes)}.`, `“${file.name}” is ${formatBytes(file.size)}; the limit is ${formatBytes(INPUT_LIMITS.maxCompressedBytes)}.`));
      return;
    }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (LIBRARY.includes(ext)) {
        const session = await buildImportSession({ name: file.name, bytes }, await loadCategories());
        if (!session.candidates.length) {
          setAlert(tr(lang, `«${file.name}» no contiene bloques que guardar.`, `“${file.name}” contains no blocks to save.`));
          return;
        }
        onOpenWorkspace();
        requestUi('library-import', session);
        return;
      }
      // Mismo camino que «Abrir con FModel» del sistema: confirma cambios, lee en segundo plano e informa
      queueLaunchedFile({ name: file.name, bytes });
      onOpenWorkspace();
      editor.command('_OPENLAUNCHED');
    } catch {
      setAlert(tr(lang, `No se pudo leer «${file.name}».`, `Could not read “${file.name}”.`));
    } finally {
      setBusy(false);
    }
  };

  const run = (cmd: string) => {
    editor.command(cmd);
    onOpenWorkspace();
  };

  const formats: Array<{ cmd: string; icon: typeof FileCode; tone: string; ext: string; title: string; body: string; status: FeatureStatus }> = [
    {
      cmd: 'OPEN',
      icon: FileCode,
      tone: 'var(--fm-accent)',
      ext: '.fmodel',
      title: tr(lang, 'Dibujo FModel', 'FModel drawing'),
      body: tr(lang, 'Formato nativo: capas, bloques dinámicos, cotas asociativas y presentaciones, sin pérdidas.', 'Native format: layers, dynamic blocks, associative dimensions and layouts, lossless.'),
      status: 'available',
    },
    {
      cmd: 'OPEN',
      icon: FileUp,
      tone: 'var(--fs-family-interop)',
      ext: '.dxf',
      title: tr(lang, 'AutoCAD DXF', 'AutoCAD DXF'),
      body: tr(lang, 'R12 a R2018, con informe de conversión. Para insertarlo en el dibujo actual usa IMPORTDXF desde el lienzo.', 'R12 to R2018, with a conversion report. To insert it into the current drawing use IMPORTDXF from the canvas.'),
      status: statusOf('Lectura y exportación DXF', 'available'),
    },
    {
      cmd: 'OPEN',
      icon: Layers,
      tone: 'var(--fs-family-proyecto)',
      ext: '.dwg',
      title: tr(lang, 'AutoCAD DWG', 'AutoCAD DWG'),
      body: tr(lang, 'Lectura local experimental. FModel no escribe DWG: exporta DXF.', 'Experimental local reading. FModel does not write DWG: it exports DXF.'),
      status: statusOf('Lectura DWG', 'experimental'),
    },
    {
      cmd: 'LIBRARYIMPORT',
      icon: FolderArchive,
      tone: 'var(--fs-family-nucleo)',
      ext: '.fmodellib',
      title: tr(lang, 'Bloques a la biblioteca', 'Blocks to the library'),
      body: tr(lang, 'Guarda los bloques de un .fmodellib, DXF o DWG en tu biblioteca, con categoría y etiquetas.', 'Saves the blocks of a .fmodellib, DXF or DWG to your library, with category and tags.'),
      status: 'available',
    },
  ];

  return (
    <section className="welcome-view welcome-import" aria-label={tr(lang, 'Importar', 'Import')}>
      <header className="welcome-view__head">
        <div>
          <h2>{tr(lang, 'Abrir e importar', 'Open and import')}</h2>
          <p>{tr(lang, 'Arrastra un archivo o elige el formato. Todo se procesa en este navegador.', 'Drop a file or pick the format. Everything is processed in this browser.')}</p>
        </div>
      </header>

      {alert && (
        <InlineAlert lang={lang} onClose={() => setAlert(null)}>
          {alert}
        </InlineAlert>
      )}

      <label
        className={`welcome-drop${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files[0]);
        }}
      >
        <input
          type="file"
          accept={[...OPENABLE, ...LIBRARY].join(',')}
          onChange={(e) => {
            void handleFile(e.currentTarget.files?.[0]);
            e.currentTarget.value = '';
          }}
        />
        <span className="welcome-drop__icon" aria-hidden="true">
          <HardDriveUpload size={26} />
        </span>
        <strong>
          {busy
            ? tr(lang, 'Leyendo archivo…', 'Reading file…')
            : dragging
              ? tr(lang, 'Suelta para abrir', 'Drop to open')
              : touch
                ? tr(lang, 'Toca para elegir un archivo', 'Tap to choose a file')
                : tr(lang, 'Arrastra aquí un dibujo', 'Drop a drawing here')}
        </strong>
        <span>
          {!touch && (
            <>
              {tr(lang, 'o', 'or')} <u>{tr(lang, 'elige un archivo', 'choose a file')}</u> ·{' '}
            </>
          )}
          .fmodel · .dxf · .dwg · .fmodellib · {tr(lang, `hasta ${formatBytes(INPUT_LIMITS.maxCompressedBytes)}`, `up to ${formatBytes(INPUT_LIMITS.maxCompressedBytes)}`)}
        </span>
      </label>

      <div className="welcome-import__cards">
        {formats.map(({ cmd, icon: Icon, tone, ext, title, body, status }) => (
          <button key={ext} type="button" className="welcome-import-card" style={{ '--tone': tone } as React.CSSProperties} onClick={() => run(cmd)}>
            <span className="welcome-import-card__top">
              <span className="welcome-import-card__icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <span className="fmodel-state" data-state={status}>
                <span className="fmodel-state__dot" aria-hidden="true" />
                {STATUS_LABEL[status][lang]}
              </span>
            </span>
            <span className="welcome-import-card__content">
              <span className="welcome-import-card__badge">{ext}</span>
              <strong>{title}</strong>
              <span className="welcome-import-card__body">{body}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="welcome-import__note">
        <ShieldCheck size={18} className="welcome-import__note-icon" aria-hidden="true" />
        <div className="welcome-import__note-text">
          <strong>{tr(lang, 'Tus archivos no salen de tu equipo', 'Your files never leave your device')}</strong>
          <p>
            {tr(
              lang,
              'La lectura de DXF y DWG se hace en un Web Worker dentro del navegador; si el navegador no lo permite, en el hilo principal con el mismo resultado. No hay servidor que reciba tus planos.',
              'DXF and DWG reading runs in a Web Worker inside the browser; if the browser disallows it, on the main thread with the same result. There is no server receiving your drawings.',
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
