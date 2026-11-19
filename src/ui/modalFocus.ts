import { useEffect, useRef, type RefObject } from 'react';

const MODAL_FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]';

function availableForFocus(element: HTMLElement): boolean {
  // :disabled también cubre los controles dentro de un fieldset deshabilitado.
  if (element.matches(':disabled, input[type="hidden"]') || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const visibility = getComputedStyle(element).visibility;
  if (visibility === 'hidden' || visibility === 'collapse') return false;
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (getComputedStyle(ancestor).display === 'none') return false;
  }
  return true;
}

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
      Array.from(dialog.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE))
        .filter((element) => element.tabIndex >= 0 && availableForFocus(element))
        .sort((a, b) => {
          if (a.tabIndex === b.tabIndex) return 0;
          if (a.tabIndex === 0) return 1;
          if (b.tabIndex === 0) return -1;
          return a.tabIndex - b.tabIndex;
        });

    if (!(activeOnMount && dialog.contains(activeOnMount))) {
      const preferred = Array.from(dialog.querySelectorAll<HTMLElement>('[autofocus]'))
        .find((element) => element.matches(MODAL_FOCUSABLE) && availableForFocus(element));
      const focusable = focusableElements();
      // el foco inicial va al contenido (primer campo, opción o botón de acción), no al «Cerrar» de la cabecera
      const first = focusable.find((element) => !element.closest('.dialog__head')) ?? focusable[0];
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
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      let wrap = !active || active === dialog || !dialog.contains(active) || active === (event.shiftKey ? first : last);
      if (!wrap && active && !focusable.includes(active)) {
        // Las flechas pueden enfocar un color con tabindex=-1. Tab sale del grupo
        // de forma nativa, salvo si ya no queda ningún control en esa dirección.
        const direction = event.shiftKey ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
        wrap = !focusable.some((element) => Boolean(active.compareDocumentPosition(element) & direction));
      }
      // El navegador conserva el recorrido de radios, pestañas y grupos con foco
      // móvil. Sólo intervenimos para impedir que el foco salga del diálogo.
      if (!wrap) return;
      event.preventDefault();
      event.stopPropagation();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [dialogRef, returnFocusRef]);
}
