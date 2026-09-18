const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * «hace un momento», «hace 5 min», «hace 3 h», «ayer», «hace 4 días»; a partir de una semana,
 * la fecha corta. Los días se cuentan por fecha de calendario, no por bloques de 24 h.
 */
export function relativeTime(ts: number, now: number, lang: 'es' | 'en'): string {
  const locale = lang === 'es' ? 'es-ES' : 'en-US';
  const diff = now - ts;
  if (diff < MIN) return lang === 'es' ? 'hace un momento' : 'just now';
  if (diff < HOUR) return lang === 'es' ? `hace ${Math.floor(diff / MIN)} min` : `${Math.floor(diff / MIN)} min ago`;
  const startOf = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((startOf(now) - startOf(ts)) / DAY);
  if (days === 0) return lang === 'es' ? `hace ${Math.floor(diff / HOUR)} h` : `${Math.floor(diff / HOUR)} h ago`;
  if (days === 1) return lang === 'es' ? 'ayer' : 'yesterday';
  if (days < 7) return lang === 'es' ? `hace ${days} días` : `${days} days ago`;
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

/** Nombre visible de un dibujo guardado: sin la extensión .fmodel. */
export function drawingLabel(name: string): string {
  return name.replace(/\.fmodel$/i, '') || name;
}
