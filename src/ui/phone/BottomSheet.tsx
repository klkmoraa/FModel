import { X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useModalFocusTrap } from '../modalFocus';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  icon?: ReactNode;
  /** controles extra en la cabecera, junto al título */
  head?: ReactNode;
  /** modal: velo, foco atrapado y devolución del foco; sin modal el lienzo sigue usable encima */
  modal?: boolean;
  closeLabel: string;
  className?: string;
}

const DISMISS_PX = 84;

/**
 * Hoja inferior de la mesa en el teléfono: asidero que se arrastra hacia abajo para cerrar,
 * cabecera con nombre y botón Cerrar, y Escape. Misma materia que los paneles flotantes.
 */
export function BottomSheet(props: Props) {
  return props.modal ? <ModalSheet {...props} /> : <SheetBody {...props} />;
}

function ModalSheet(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocusTrap(ref, props.onClose);
  const pressed = useRef(false);
  return (
    <div
      className="sheet-veil"
      onMouseDown={(event) => (pressed.current = event.target === event.currentTarget)}
      onClick={(event) => {
        if (pressed.current && event.target === event.currentTarget) props.onClose();
        pressed.current = false;
      }}
    >
      <SheetBody {...props} sheetRef={ref} />
    </div>
  );
}

function SheetBody({ title, onClose, children, icon, head, modal, closeLabel, className, sheetRef }: Props & { sheetRef?: React.RefObject<HTMLDivElement | null> }) {
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  return (
    <div
      ref={sheetRef}
      className={`sheet${className ? ` ${className}` : ''}${drag ? ' is-dragging' : ''}`}
      role="dialog"
      aria-modal={modal ? 'true' : undefined}
      aria-label={title}
      tabIndex={-1}
      style={drag ? { transform: `translateY(${drag}px)` } : undefined}
      onKeyDown={(event) => {
        if (modal || event.key !== 'Escape') return;
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className="sheet__grip"
        aria-hidden="true"
        onPointerDown={(event) => {
          start.current = event.clientY;
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (start.current === null) return;
          setDrag(Math.max(0, event.clientY - start.current));
        }}
        onPointerUp={(event) => {
          const moved = start.current === null ? 0 : event.clientY - start.current;
          start.current = null;
          setDrag(0);
          if (moved > DISMISS_PX) onClose();
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag(0);
        }}
      >
        <span />
      </div>
      <div className="sheet__head">
        {icon}
        <strong>{title}</strong>
        <span className="sheet__spacer">{head}</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={closeLabel}>
          <X size={18} />
        </button>
      </div>
      <div className="sheet__body">{children}</div>
    </div>
  );
}
