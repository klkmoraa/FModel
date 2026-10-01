import { RotateCcw, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from './hooks';
import { PHONE_LANDSCAPE_QUERY } from './layoutMode';
import { useModalFocusTrap } from './modalFocus';

const KEY = 'fmodel.rotatePrompt.dismissed';

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * En el teléfono FModel se usa en vertical: más lienzo, el dock bajo el pulgar y el teclado sin tapar
 * el dibujo. Con el teléfono girado propone volver a vertical, pero no lo impone (WCAG 1.3.4): quien
 * siga en horizontal conserva la mesa adaptada durante la sesión.
 */
export function RotatePrompt({ lang }: { lang: 'es' | 'en' }) {
  const landscape = useMediaQuery(PHONE_LANDSCAPE_QUERY);
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!landscape || dismissed) return null;
  const dismiss = () => {
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* sin almacenamiento: vale para esta vista */
    }
    setDismissed(true);
  };
  return <RotateDialog lang={lang} onContinue={dismiss} />;
}

function RotateDialog({ lang, onContinue }: { lang: 'es' | 'en'; onContinue: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocusTrap(ref, onContinue);
  // mientras el aviso está abierto, las teclas no llegan a la mesa de debajo (no abren comandos ni repiten el último)
  useEffect(() => {
    const isolate = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' && event.key !== 'Escape') event.stopPropagation();
    };
    window.addEventListener('keydown', isolate, true);
    return () => window.removeEventListener('keydown', isolate, true);
  }, []);
  const t = (es: string, en: string) => (lang === 'es' ? es : en);
  return (
    <div className="rotate-veil">
      <div ref={ref} className="rotate-card" role="dialog" aria-modal="true" aria-labelledby="rotate-title" aria-describedby="rotate-text" tabIndex={-1}>
        <span className="rotate-card__icon" aria-hidden="true">
          <Smartphone size={30} />
          <RotateCcw size={18} />
        </span>
        <h2 id="rotate-title">{t('Gira el teléfono a vertical', 'Turn your phone upright')}</h2>
        <p id="rotate-text">{t('En el teléfono FModel se usa en vertical: más lienzo, el dock bajo el pulgar y el teclado sin tapar el dibujo.', 'On phones FModel is used upright: more canvas, the dock under your thumb and the keyboard clear of the drawing.')}</p>
        <button type="button" className="btn btn--ghost" onClick={onContinue}>
          {t('Seguir en horizontal', 'Continue in landscape')}
        </button>
      </div>
    </div>
  );
}
