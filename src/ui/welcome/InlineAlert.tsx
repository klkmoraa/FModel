import { AlertTriangle, X } from 'lucide-react';
import { tr } from '../controls';

/** Aviso en línea que se descarta a mano (nunca un alert() nativo). */
export function InlineAlert({ lang, children, onClose }: { lang: 'es' | 'en'; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fmodel-alert" role="alert">
      <AlertTriangle size={18} aria-hidden="true" />
      <p>{children}</p>
      <button type="button" aria-label={tr(lang, 'Cerrar aviso', 'Dismiss')} onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
