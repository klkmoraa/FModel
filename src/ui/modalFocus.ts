import { useEffect, useRef, type RefObject } from 'react';

const MODAL_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Contrato de teclado para superficies aria-modal:
 * - mueve el foco dentro al montar,
 * - cicla Tab/Shift+Tab,
 * - cierra con Escape incluso si un control hijo detiene bubbling,
 * - devuelve el foco al origen al desmontar.
 */
export function useModalFocusTrap(dialogRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableElements = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE)).filter(
        (element) => element.getAttribute('aria-hidden') !== 'true' && !element.hasAttribute('disabled'),
      );

    const first = focusableElements()[0];
    (first ?? dialog).focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
      const active = document.activeElement;

      if (event.shiftKey && (active === firstFocusable || !dialog.contains(active))) {
        event.preventDefault();
        event.stopPropagation();
        lastFocusable.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === lastFocusable || !dialog.contains(active))) {
        event.preventDefault();
        event.stopPropagation();
        firstFocusable.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [dialogRef]);
}
