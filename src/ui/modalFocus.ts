import { useEffect, useRef, type RefObject } from 'react';

const MODAL_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Contrato de teclado para superficies aria-modal:
 * - mueve el foco dentro al montar,
 * - cicla Tab/Shift+Tab,
 * - cierra con Escape salvo cuando un control declara que lo consume,
 * - devuelve el foco al origen al desmontar.
 */
export function useModalFocusTrap(dialogRef: RefObject<HTMLElement | null>, onClose: () => void, returnFocusRef?: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const activeOnMount = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousFocus = returnFocusRef?.current ?? (activeOnMount && !dialog.contains(activeOnMount) ? activeOnMount : null);
    const focusableElements = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE)).filter(
        (element) => element.getAttribute('aria-hidden') !== 'true' && !element.hasAttribute('disabled'),
      );

    if (!(activeOnMount && dialog.contains(activeOnMount))) {
      const preferred = dialog.querySelector<HTMLElement>('[autofocus]');
      const first = focusableElements()[0];
      (preferred ?? first ?? dialog).focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // con modales apilados (p. ej. una confirmación sobre otro diálogo) solo responde el de
      // encima: si no, Escape cerraría ambos y Tab devolvería el foco al de debajo
      const modals = document.querySelectorAll('[aria-modal="true"]');
      if (modals.length > 1 && modals[modals.length - 1] !== dialog) return;
      if (event.key === 'Escape') {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-modal-escape="consume"]')) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        event.stopPropagation();
        dialog.focus({ preventScroll: true });
        return;
      }

      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const activeIndex = active ? focusable.indexOf(active) : -1;
      const nextIndex = event.shiftKey
        ? activeIndex <= 0 ? focusable.length - 1 : activeIndex - 1
        : activeIndex < 0 || activeIndex === focusable.length - 1 ? 0 : activeIndex + 1;
      event.preventDefault();
      event.stopPropagation();
      focusable[nextIndex]!.focus({ preventScroll: true });
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [dialogRef, returnFocusRef]);
}
