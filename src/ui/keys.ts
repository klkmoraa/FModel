/** Combinación de teclas normalizada para atajos («Ctrl+Shift+S», «F3», «Alt+X»). */
export function comboOf(e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'key'>): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && e.key.length > 1) parts.push('Shift');
  if (e.shiftKey && (e.ctrlKey || e.metaKey) && e.key.length === 1) parts.push('Shift');
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(k);
  return parts.join('+');
}
