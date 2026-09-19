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

      const firstFocusable = focusable[0]!;
      const lastFocusable = focusable[focusable.length - 1]!;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const activeIndex = active ? focusable.indexOf(active) : -1;

      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        event.stopPropagation();
        lastFocusable.focus({ preventScroll: true });
      } else if (!event.shiftKey && (activeIndex === -1 || activeIndex === focusable.length - 1)) {
        event.preventDefault();
        event.stopPropagation();
        firstFocusable.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [dialogRef, returnFocusRef]);
}
