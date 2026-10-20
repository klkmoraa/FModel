import type { SnapType } from '../model/registry';
import { SNAP_LABELS } from '../model/snapLabels';

export type PointModifierKind = 'from' | 'midpoint';
export const POINT_SNAP_OPTIONS: { type: SnapType; label: { es: string; en: string }; aliases: string[] }[] = [
  ['endpoint', ['END', 'FIN']], ['midpoint', ['MID', 'MED']], ['center', ['CEN', 'CENTRO']],
  ['intersection', ['INT']], ['perpendicular', ['PER']], ['tangent', ['TAN']], ['nearest', ['NEA', 'CER']],
  ['quadrant', ['QUA', 'CUA']], ['node', ['NOD', 'NODE']], ['insertion', ['INS']],
  ['extension', ['EXT']], ['parallel', ['PAR']], ['geocenter', ['GCE', 'GCEN']], ['appint', ['APP']],
].map(([type, aliases]) => ({ type: type as SnapType, label: SNAP_LABELS[type as SnapType], aliases: aliases as string[] }));

export function isPointRequest(request: { kind: string } | null | undefined): boolean {
  return !!request && ['point', 'distance', 'angle'].includes(request.kind);
}

export function precisionToken(text: string): { snap: SnapType[] } | { modifier: PointModifierKind } | null {
  const token = text.trim().replace(/^_/, '').toUpperCase();
  if (['FROM', 'FRO', 'DESDE'].includes(token)) return { modifier: 'from' };
  if (['M2P', 'MTP', 'MEDIO2P'].includes(token)) return { modifier: 'midpoint' };
  if (['NON', 'NONE', 'SIN'].includes(token)) return { snap: [] };
  const option = POINT_SNAP_OPTIONS.find(option => option.aliases.includes(token));
  return option ? { snap: [option.type] } : null;
}
