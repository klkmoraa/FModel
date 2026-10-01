import { useEffect, type RefObject } from 'react';

const CONTROL = 'input:not([type="hidden"]):not([type="color"]), select, textarea';
let counter = 0;

/**
 * Vincula la etiqueta de cada `.field` con su control cuando éste aún no tiene nombre accesible.
 * Los formularios heredados escriben `<label>` y el control como hermanos sin `for`; así lectores de
 * pantalla y autocompletado reciben el nombre sin tocar cada campo. Nunca pisa un nombre ya definido.
 */
export function associateFieldLabels(root: ParentNode): void {
  for (const field of root.querySelectorAll<HTMLElement>('.field')) {
    const label = field.querySelector<HTMLLabelElement>(':scope > label');
    const control = field.querySelector<HTMLElement>(CONTROL);
    if (!label || !control || label.htmlFor) continue;
    if (control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) continue;
    if (control.id && field.ownerDocument.querySelector(`label[for="${CSS.escape(control.id)}"]`)) continue;
    if (!label.id) label.id = `field-label-${++counter}`;
    control.setAttribute('aria-labelledby', label.id);
  }
}

/** Mantiene vinculadas las etiquetas de un contenedor aunque sus campos cambien (pestañas, filas nuevas). */
export function useFieldLabels(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    associateFieldLabels(root);
    const observer = new MutationObserver(() => associateFieldLabels(root));
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ref]);
}

/** Variante para `ref` de un contenedor que se monta y desmonta (paneles): React 19 llama a la limpieza devuelta. */
export function fieldLabelsRef(node: HTMLElement | null): (() => void) | void {
  if (!node) return;
  associateFieldLabels(node);
  const observer = new MutationObserver(() => associateFieldLabels(node));
  observer.observe(node, { childList: true, subtree: true });
  return () => observer.disconnect();
}

