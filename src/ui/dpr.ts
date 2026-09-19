/** DPR única para el backing store, los renderizadores y la lupa. */
export function effectiveDpr(value?: number): number {
  const dpr = value ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1);
  return Number.isFinite(dpr) && dpr > 0 ? Math.min(3, dpr) : 1;
}
