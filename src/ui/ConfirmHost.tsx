import { useEffect, useState } from 'react';
import { Dialog } from './Dialogs';
import { tr } from './controls';

interface AskRequest {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  /** Con valor, el diálogo pide un texto (sustituye a `window.prompt`). */
  input?: string;
  resolve: (value: string | null) => void;
}

let show: ((req: AskRequest) => void) | null = null;

function ask(req: Omit<AskRequest, 'resolve'>): Promise<string | null> {
  if (!show) return Promise.resolve(null);
  const open = show;
  return new Promise((resolve) => open({ ...req, resolve }));
}

export interface ConfirmOptions {
  confirmLabel?: string;
  /** Acción destructiva: el botón de confirmar se muestra en rojo. */
  danger?: boolean;
}

/**
 * Confirmación dentro de la aplicación. No usa `window.confirm`: algunos navegadores
 * integrados y vistas web lo bloquean y devuelven `false` sin mostrar nada.
 */
export async function askConfirm(lang: 'es' | 'en', title: string, text: string, opts: ConfirmOptions = {}): Promise<boolean> {
  const r = await ask({ title, text, confirmLabel: opts.confirmLabel ?? tr(lang, 'Aceptar', 'OK'), danger: opts.danger });
  return r !== null;
}

/** Pide un texto dentro de la aplicación (sustituye a `window.prompt`). Resuelve null si se cancela. */
export function askText(lang: 'es' | 'en', title: string, initial = '', opts: { confirmLabel?: string; text?: string } = {}): Promise<string | null> {
  return ask({ title, text: opts.text ?? '', confirmLabel: opts.confirmLabel ?? tr(lang, 'Aceptar', 'OK'), input: initial });
}

/** Monta el diálogo que atiende a `askConfirm` y `askText`. Debe estar montado una sola vez. */
export function ConfirmHost({ lang }: { lang: 'es' | 'en' }) {
  const [req, setReq] = useState<AskRequest | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    show = (next) => {
      setValue(next.input ?? '');
      setReq((prev) => {
        prev?.resolve(null);
        return next;
      });
    };
    return () => {
      show = null;
    };
  }, []);

  if (!req) return null;
  const isInput = req.input !== undefined;
  const done = (ok: boolean) => {
    setReq(null);
    req.resolve(ok ? (isInput ? value : '') : null);
  };

  return (
    <Dialog
      lang={lang}
      title={req.title}
      onClose={() => done(false)}
      footer={
        <>
          <button type="button" className="btn" onClick={() => done(false)}>
            {tr(lang, 'Cancelar', 'Cancel')}
          </button>
          <button type="button" className={`btn ${req.danger ? 'btn--danger' : 'btn--primary'}`} onClick={() => done(true)} disabled={isInput && !value.trim()}>
            {req.confirmLabel}
          </button>
        </>
      }
    >
      {req.text && <p style={{ margin: isInput ? '0 0 10px' : 0 }}>{req.text}</p>}
      {isInput && (
        <input
          className="input"
          value={value}
          autoFocus
          aria-label={req.title}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && value.trim()) done(true);
            if (e.key === 'Escape') done(false);
          }}
        />
      )}
    </Dialog>
  );
}
