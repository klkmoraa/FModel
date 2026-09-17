import { TAU } from '../../geometry/angle';
import { polylineSignedArea } from '../../geometry/polyline';
import { angleOf, dist, len, polar } from '../../geometry/vec';
import type {
  ArcEntity,
  CircleEntity,
  DimensionEntity,
  EllipseEntity,
  Entity,
  EntityType,
  HatchEntity,
  ImageEntity,
  InsertEntity,
  LineEntity,
  LwPolylineEntity,
  MLeaderEntity,
  MTextEntity,
  PdfUnderlayEntity,
  PointEntity,
  SplineEntity,
  TableEntity,
  TextEntity,
  ViewportEntity,
} from '../../document/types';
import type { ModelContext } from '../../model/context';
import { buildDimension } from '../../model/dimension';
import { HATCH_PATTERNS } from '../../model/hatchPatterns';
import { kindOf } from '../../model/registry';
import type { L10n } from '../../commands/types';
import { rectangleVertices } from '../../commands/draw';

export type PropKind = 'number' | 'angle' | 'text' | 'multiline' | 'bool' | 'select' | 'color' | 'layer' | 'linetype' | 'lineweight' | 'transparency' | 'readonly';

export interface PropRow {
  key: string;
  group: 'general' | 'geometry' | 'text' | 'misc' | 'dimension' | 'attributes' | 'custom' | 'view';
  label: L10n;
  kind: PropKind;
  get(e: Entity, ctx: ModelContext): unknown;
  set?(e: Entity, v: unknown, ctx: ModelContext): Entity | null;
  options?: { value: string; label: string }[];
}

const L = (es: string, en: string): L10n => ({ es, en });
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

function vecRows<E extends Entity>(prefix: string, label: L10n, get: (e: E) => { x: number; y: number }, set: (e: E, p: { x: number; y: number }) => E, group: PropRow['group'] = 'geometry'): PropRow[] {
  return [
    { key: `${prefix}.x`, group, label: L(`${label.es} X`, `${label.en} X`), kind: 'number', get: (e) => get(e as E).x, set: (e, v) => set(e as E, { ...get(e as E), x: v as number }) },
    { key: `${prefix}.y`, group, label: L(`${label.es} Y`, `${label.en} Y`), kind: 'number', get: (e) => get(e as E).y, set: (e, v) => set(e as E, { ...get(e as E), y: v as number }) },
  ];
}

export const GENERAL_ROWS: PropRow[] = [
  { key: 'color', group: 'general', label: L('Color', 'Color'), kind: 'color', get: (e) => e.color, set: (e, v) => ({ ...e, color: v as string }) },
  { key: 'layer', group: 'general', label: L('Capa', 'Layer'), kind: 'layer', get: (e) => e.layer, set: (e, v) => ({ ...e, layer: v as string }) },
  { key: 'linetype', group: 'general', label: L('Tipo de línea', 'Linetype'), kind: 'linetype', get: (e) => e.linetype, set: (e, v) => ({ ...e, linetype: v as string }) },
  { key: 'ltscale', group: 'general', label: L('Escala tipo línea', 'Linetype scale'), kind: 'number', get: (e) => e.linetypeScale, set: (e, v) => ((v as number) > 0 ? { ...e, linetypeScale: v as number } : null) },
  { key: 'lineweight', group: 'general', label: L('Grosor de línea', 'Lineweight'), kind: 'lineweight', get: (e) => e.lineweight, set: (e, v) => ({ ...e, lineweight: v as number }) },
  {
    key: 'transparency',
    group: 'general',
    label: L('Transparencia', 'Transparency'),
    kind: 'transparency',
    get: (e) => e.transparency,
    set: (e, v) => ({ ...e, transparency: v === 'ByLayer' || v === 'ByBlock' ? v : Math.max(0, Math.min(90, Number(v))) }),
  },
  { key: 'construction', group: 'general', label: L('Construcción', 'Construction'), kind: 'bool', get: (e) => !!e.construction, set: (e, v) => ({ ...e, construction: (v as boolean) || undefined }) },
  { key: 'locked', group: 'general', label: L('Bloqueado', 'Locked'), kind: 'bool', get: (e) => !!e.locked, set: (e, v) => ({ ...e, locked: (v as boolean) || undefined }) as Entity },
  { key: 'annotative', group: 'general', label: L('Anotativo', 'Annotative'), kind: 'bool', get: (e) => !!e.annotative, set: (e, v) => ({ ...e, annotative: (v as boolean) || undefined }) },
];

function lengthRow(): PropRow {
  return { key: 'length', group: 'geometry', label: L('Longitud', 'Length'), kind: 'readonly', get: (e, ctx) => kindOf(e).length?.(e, ctx) ?? null };
}
function areaRow(): PropRow {
  return { key: 'area', group: 'geometry', label: L('Área', 'Area'), kind: 'readonly', get: (e, ctx) => kindOf(e).area?.(e, ctx) ?? null };
}

const TYPE_ROWS: Partial<Record<EntityType, PropRow[]>> = {
  point: vecRows<PointEntity>('position', L('Posición', 'Position'), (e) => e.position, (e, p) => ({ ...e, position: p })),
  line: [
    ...vecRows<LineEntity>('start', L('Inicio', 'Start'), (e) => e.start, (e, p) => ({ ...e, start: p })),
    ...vecRows<LineEntity>('end', L('Fin', 'End'), (e) => e.end, (e, p) => ({ ...e, end: p })),
    {
      key: 'len',
      group: 'geometry',
      label: L('Longitud', 'Length'),
      kind: 'number',
      get: (e) => dist((e as LineEntity).start, (e as LineEntity).end),
      set: (e, v) => {
        const l = e as LineEntity;
        const a = angleOf({ x: l.end.x - l.start.x, y: l.end.y - l.start.y });
        return (v as number) > 0 ? { ...l, end: polar(l.start, a, v as number) } : null;
      },
    },
    {
      key: 'angle',
      group: 'geometry',
      label: L('Ángulo', 'Angle'),
      kind: 'angle',
      get: (e) => deg((angleOf({ x: (e as LineEntity).end.x - (e as LineEntity).start.x, y: (e as LineEntity).end.y - (e as LineEntity).start.y }) + TAU) % TAU),
      set: (e, v) => {
        const l = e as LineEntity;
        return { ...l, end: polar(l.start, rad(v as number), dist(l.start, l.end)) };
      },
    },
    { key: 'dx', group: 'geometry', label: L('Delta X', 'Delta X'), kind: 'readonly', get: (e) => (e as LineEntity).end.x - (e as LineEntity).start.x },
    { key: 'dy', group: 'geometry', label: L('Delta Y', 'Delta Y'), kind: 'readonly', get: (e) => (e as LineEntity).end.y - (e as LineEntity).start.y },
  ],
  circle: [
    ...vecRows<CircleEntity>('center', L('Centro', 'Center'), (e) => e.center, (e, p) => ({ ...e, center: p })),
    { key: 'radius', group: 'geometry', label: L('Radio', 'Radius'), kind: 'number', get: (e) => (e as CircleEntity).radius, set: (e, v) => ((v as number) > 0 ? { ...(e as CircleEntity), radius: v as number } : null) },
    { key: 'diameter', group: 'geometry', label: L('Diámetro', 'Diameter'), kind: 'number', get: (e) => (e as CircleEntity).radius * 2, set: (e, v) => ((v as number) > 0 ? { ...(e as CircleEntity), radius: (v as number) / 2 } : null) },
    { key: 'circ', group: 'geometry', label: L('Circunferencia', 'Circumference'), kind: 'number', get: (e) => (e as CircleEntity).radius * TAU, set: (e, v) => ((v as number) > 0 ? { ...(e as CircleEntity), radius: (v as number) / TAU } : null) },
    { key: 'carea', group: 'geometry', label: L('Área', 'Area'), kind: 'number', get: (e) => Math.PI * (e as CircleEntity).radius ** 2, set: (e, v) => ((v as number) > 0 ? { ...(e as CircleEntity), radius: Math.sqrt((v as number) / Math.PI) } : null) },
  ],
  arc: [
    ...vecRows<ArcEntity>('center', L('Centro', 'Center'), (e) => e.center, (e, p) => ({ ...e, center: p })),
    { key: 'radius', group: 'geometry', label: L('Radio', 'Radius'), kind: 'number', get: (e) => (e as ArcEntity).radius, set: (e, v) => ((v as number) > 0 ? { ...(e as ArcEntity), radius: v as number } : null) },
    { key: 'startAngle', group: 'geometry', label: L('Ángulo inicial', 'Start angle'), kind: 'angle', get: (e) => deg((e as ArcEntity).startAngle), set: (e, v) => ({ ...(e as ArcEntity), startAngle: rad(v as number) }) },
    { key: 'endAngle', group: 'geometry', label: L('Ángulo final', 'End angle'), kind: 'angle', get: (e) => deg((e as ArcEntity).endAngle), set: (e, v) => ({ ...(e as ArcEntity), endAngle: rad(v as number) }) },
    { key: 'total', group: 'geometry', label: L('Ángulo total', 'Total angle'), kind: 'readonly', get: (e) => deg((((e as ArcEntity).endAngle - (e as ArcEntity).startAngle) % TAU + TAU) % TAU || TAU) },
    lengthRow(),
  ],
  ellipse: [
    ...vecRows<EllipseEntity>('center', L('Centro', 'Center'), (e) => e.center, (e, p) => ({ ...e, center: p })),
    { key: 'major', group: 'geometry', label: L('Radio mayor', 'Major radius'), kind: 'number', get: (e) => len((e as EllipseEntity).majorAxis), set: (e, v) => {
      const el = e as EllipseEntity;
      const l = len(el.majorAxis);
      return (v as number) > 0 ? { ...el, majorAxis: { x: (el.majorAxis.x / l) * (v as number), y: (el.majorAxis.y / l) * (v as number) }, ratio: Math.min(1, (l * el.ratio) / (v as number)) } : null;
    } },
    { key: 'ratio', group: 'geometry', label: L('Relación de radios', 'Radius ratio'), kind: 'number', get: (e) => (e as EllipseEntity).ratio, set: (e, v) => ((v as number) > 0 && (v as number) <= 1 ? { ...(e as EllipseEntity), ratio: v as number } : null) },
    { key: 'startParam', group: 'geometry', label: L('Parámetro inicial', 'Start parameter'), kind: 'angle', get: (e) => deg((e as EllipseEntity).startParam), set: (e, v) => ({ ...(e as EllipseEntity), startParam: rad(v as number) }) },
    { key: 'endParam', group: 'geometry', label: L('Parámetro final', 'End parameter'), kind: 'angle', get: (e) => deg((e as EllipseEntity).endParam), set: (e, v) => ({ ...(e as EllipseEntity), endParam: rad(v as number) }) },
    lengthRow(),
    areaRow(),
  ],
  lwpolyline: [
    { key: 'vertices', group: 'geometry', label: L('Vértices', 'Vertices'), kind: 'readonly', get: (e) => (e as LwPolylineEntity).vertices.length },
    { key: 'closed', group: 'geometry', label: L('Cerrada', 'Closed'), kind: 'bool', get: (e) => (e as LwPolylineEntity).closed, set: (e, v) => ({ ...(e as LwPolylineEntity), closed: v as boolean }) },
    { key: 'constantWidth', group: 'geometry', label: L('Grosor global', 'Global width'), kind: 'number', get: (e) => (e as LwPolylineEntity).constantWidth ?? 0, set: (e, v) => ((v as number) >= 0 ? { ...(e as LwPolylineEntity), constantWidth: (v as number) || undefined, vertices: (e as LwPolylineEntity).vertices.map((x) => ({ ...x, startWidth: undefined, endWidth: undefined })) } : null) },
    {
      key: 'rectW',
      group: 'geometry',
      label: L('Rectángulo: longitud', 'Rectangle: length'),
      kind: 'number',
      get: (e) => ((e as LwPolylineEntity).shape?.kind === 'rectangle' ? ((e as LwPolylineEntity).shape as { width: number }).width : null),
      set: (e, v) => {
        const p = e as LwPolylineEntity;
        if (p.shape?.kind !== 'rectangle' || (v as number) <= 0) return null;
        const s = { ...p.shape, width: v as number };
        const other = { x: s.corner.x + s.width * Math.cos(s.rotation) - s.height * Math.sin(s.rotation), y: s.corner.y + s.width * Math.sin(s.rotation) + s.height * Math.cos(s.rotation) };
        return { ...p, shape: s, vertices: rectangleVertices(s.corner, other, s.rotation, s.fillet ?? 0, s.chamfer ?? [0, 0]) };
      },
    },
    {
      key: 'rectH',
      group: 'geometry',
      label: L('Rectángulo: anchura', 'Rectangle: width'),
      kind: 'number',
      get: (e) => ((e as LwPolylineEntity).shape?.kind === 'rectangle' ? ((e as LwPolylineEntity).shape as { height: number }).height : null),
      set: (e, v) => {
        const p = e as LwPolylineEntity;
        if (p.shape?.kind !== 'rectangle' || (v as number) <= 0) return null;
        const s = { ...p.shape, height: v as number };
        const other = { x: s.corner.x + s.width * Math.cos(s.rotation) - s.height * Math.sin(s.rotation), y: s.corner.y + s.width * Math.sin(s.rotation) + s.height * Math.cos(s.rotation) };
        return { ...p, shape: s, vertices: rectangleVertices(s.corner, other, s.rotation, s.fillet ?? 0, s.chamfer ?? [0, 0]) };
      },
    },
    lengthRow(),
    { key: 'parea', group: 'geometry', label: L('Área', 'Area'), kind: 'readonly', get: (e) => ((e as LwPolylineEntity).closed ? Math.abs(polylineSignedArea((e as LwPolylineEntity).vertices)) : null) },
  ],
  spline: [
    { key: 'degree', group: 'geometry', label: L('Grado', 'Degree'), kind: 'readonly', get: (e) => (e as SplineEntity).spline.degree },
    { key: 'method', group: 'geometry', label: L('Método', 'Method'), kind: 'readonly', get: (e) => ((e as SplineEntity).method === 'fit' ? 'Ajuste / Fit' : 'VC / CV') },
    { key: 'ncv', group: 'geometry', label: L('Vértices de control', 'Control vertices'), kind: 'readonly', get: (e) => (e as SplineEntity).spline.ctrl.length },
    lengthRow(),
  ],
  text: [
    { key: 'text', group: 'text', label: L('Contenido', 'Contents'), kind: 'text', get: (e) => (e as TextEntity).text, set: (e, v) => ({ ...(e as TextEntity), text: v as string }) },
    { key: 'style', group: 'text', label: L('Estilo', 'Style'), kind: 'select', get: (e) => (e as TextEntity).style, set: (e, v) => ({ ...(e as TextEntity), style: v as string }) },
    { key: 'height', group: 'text', label: L('Altura', 'Height'), kind: 'number', get: (e) => (e as TextEntity).height, set: (e, v) => ((v as number) > 0 ? { ...(e as TextEntity), height: v as number } : null) },
    { key: 'rotation', group: 'text', label: L('Rotación', 'Rotation'), kind: 'angle', get: (e) => deg((e as TextEntity).rotation), set: (e, v) => ({ ...(e as TextEntity), rotation: rad(v as number) }) },
    { key: 'widthFactor', group: 'text', label: L('Factor de anchura', 'Width factor'), kind: 'number', get: (e) => (e as TextEntity).widthFactor, set: (e, v) => ((v as number) > 0 ? { ...(e as TextEntity), widthFactor: v as number } : null) },
    { key: 'oblique', group: 'text', label: L('Ángulo oblicuo', 'Obliquing'), kind: 'angle', get: (e) => deg((e as TextEntity).oblique), set: (e, v) => ({ ...(e as TextEntity), oblique: rad(v as number) }) },
    {
      key: 'justify',
      group: 'text',
      label: L('Justificación', 'Justify'),
      kind: 'select',
      get: (e) => `${(e as TextEntity).halign}|${(e as TextEntity).valign}`,
      set: (e, v) => {
        const [h, va] = String(v).split('|');
        return { ...(e as TextEntity), halign: h as TextEntity['halign'], valign: va as TextEntity['valign'] };
      },
      options: ['left|baseline', 'center|baseline', 'right|baseline', 'middle|middle', 'left|top', 'center|top', 'right|top', 'left|middle', 'center|middle', 'right|middle', 'left|bottom', 'center|bottom', 'right|bottom'].map((v) => ({ value: v, label: v.replace('|', ' · ') })),
    },
    ...vecRows<TextEntity>('position', L('Posición', 'Position'), (e) => e.position, (e, p) => ({ ...e, position: p }), 'geometry'),
  ],
  mtext: [
    { key: 'contents', group: 'text', label: L('Contenido', 'Contents'), kind: 'multiline', get: (e) => (e as MTextEntity).contents.replace(/\\P/g, '\n'), set: (e, v) => ({ ...(e as MTextEntity), contents: String(v).replace(/\r?\n/g, '\\P') }) },
    { key: 'style', group: 'text', label: L('Estilo', 'Style'), kind: 'select', get: (e) => (e as MTextEntity).style, set: (e, v) => ({ ...(e as MTextEntity), style: v as string }) },
    { key: 'height', group: 'text', label: L('Altura', 'Height'), kind: 'number', get: (e) => (e as MTextEntity).height, set: (e, v) => ((v as number) > 0 ? { ...(e as MTextEntity), height: v as number } : null) },
    { key: 'width', group: 'text', label: L('Anchura', 'Width'), kind: 'number', get: (e) => (e as MTextEntity).width, set: (e, v) => ((v as number) >= 0 ? { ...(e as MTextEntity), width: v as number } : null) },
    { key: 'rotation', group: 'text', label: L('Rotación', 'Rotation'), kind: 'angle', get: (e) => deg((e as MTextEntity).rotation), set: (e, v) => ({ ...(e as MTextEntity), rotation: rad(v as number) }) },
    { key: 'lineSpacing', group: 'text', label: L('Interlineado', 'Line spacing'), kind: 'number', get: (e) => (e as MTextEntity).lineSpacing, set: (e, v) => ((v as number) > 0 ? { ...(e as MTextEntity), lineSpacing: v as number } : null) },
    {
      key: 'attachment',
      group: 'text',
      label: L('Justificación', 'Attachment'),
      kind: 'select',
      get: (e) => String((e as MTextEntity).attachment),
      set: (e, v) => ({ ...(e as MTextEntity), attachment: Number(v) as MTextEntity['attachment'] }),
      options: ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'].map((l, i) => ({ value: String(i + 1), label: l })),
    },
    { key: 'mask', group: 'text', label: L('Máscara de fondo', 'Background mask'), kind: 'bool', get: (e) => !!(e as MTextEntity).background, set: (e, v) => ({ ...(e as MTextEntity), background: v ? { color: 'Background', offset: 1.5 } : undefined }) },
    ...vecRows<MTextEntity>('position', L('Posición', 'Position'), (e) => e.position, (e, p) => ({ ...e, position: p }), 'geometry'),
  ],
  hatch: [
    {
      key: 'ptype',
      group: 'misc',
      label: L('Tipo', 'Type'),
      kind: 'select',
      get: (e) => (e as HatchEntity).pattern.type,
      set: (e, v) => ({ ...(e as HatchEntity), pattern: { ...(e as HatchEntity).pattern, type: v as HatchEntity['pattern']['type'], name: v === 'solid' ? 'SOLID' : (e as HatchEntity).pattern.name === 'SOLID' ? 'ANSI31' : (e as HatchEntity).pattern.name } }),
      options: [
        { value: 'predefined', label: 'Predefinido / Predefined' },
        { value: 'user', label: 'Usuario / User' },
        { value: 'solid', label: 'Sólido / Solid' },
      ],
    },
    {
      key: 'pname',
      group: 'misc',
      label: L('Patrón', 'Pattern'),
      kind: 'select',
      get: (e) => (e as HatchEntity).pattern.name,
      set: (e, v) => ({ ...(e as HatchEntity), pattern: { ...(e as HatchEntity).pattern, name: v as string, type: v === 'SOLID' ? 'solid' : 'predefined' } }),
      options: [{ value: 'SOLID', label: 'SOLID' }, ...HATCH_PATTERNS.map((p) => ({ value: p.name, label: `${p.name} · ${p.description}` }))],
    },
    { key: 'pscale', group: 'misc', label: L('Escala', 'Scale'), kind: 'number', get: (e) => (e as HatchEntity).pattern.scale, set: (e, v) => ((v as number) > 0 ? { ...(e as HatchEntity), pattern: { ...(e as HatchEntity).pattern, scale: v as number } } : null) },
    { key: 'pangle', group: 'misc', label: L('Ángulo', 'Angle'), kind: 'angle', get: (e) => deg((e as HatchEntity).pattern.angle), set: (e, v) => ({ ...(e as HatchEntity), pattern: { ...(e as HatchEntity).pattern, angle: rad(v as number) } }) },
    { key: 'pspacing', group: 'misc', label: L('Espaciado (usuario)', 'Spacing (user)'), kind: 'number', get: (e) => (e as HatchEntity).pattern.spacing, set: (e, v) => ((v as number) > 0 ? { ...(e as HatchEntity), pattern: { ...(e as HatchEntity).pattern, spacing: v as number } } : null) },
    { key: 'pdouble', group: 'misc', label: L('Doble', 'Double'), kind: 'bool', get: (e) => (e as HatchEntity).pattern.double, set: (e, v) => ({ ...(e as HatchEntity), pattern: { ...(e as HatchEntity).pattern, double: v as boolean } }) },
    {
      key: 'island',
      group: 'misc',
      label: L('Islas', 'Islands'),
      kind: 'select',
      get: (e) => (e as HatchEntity).islandStyle,
      set: (e, v) => ({ ...(e as HatchEntity), islandStyle: v as HatchEntity['islandStyle'] }),
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'outer', label: 'Exterior / Outer' },
        { value: 'ignore', label: 'Ignorar / Ignore' },
      ],
    },
    { key: 'background', group: 'misc', label: L('Color de fondo', 'Background color'), kind: 'color', get: (e) => (e as HatchEntity).background ?? 'ByLayer', set: (e, v) => ({ ...(e as HatchEntity), background: v === 'ByLayer' ? undefined : (v as string) }) },
    areaRow(),
  ],
  dimension: [
    { key: 'dstyle', group: 'dimension', label: L('Estilo de cota', 'Dim style'), kind: 'select', get: (e) => (e as DimensionEntity).style, set: (e, v) => ({ ...(e as DimensionEntity), style: v as string }) },
    { key: 'measure', group: 'dimension', label: L('Medida', 'Measurement'), kind: 'readonly', get: (e, ctx) => {
      const d = e as DimensionEntity;
      const m = buildDimension(d, ctx).measurement;
      return d.dimType === 'angular' || d.dimType === 'angular3p' ? `${deg(m).toFixed(4)}°` : m;
    } },
    { key: 'textOverride', group: 'dimension', label: L('Sustituir texto (<> = medida)', 'Text override (<> = measured)'), kind: 'text', get: (e) => (e as DimensionEntity).textOverride ?? '', set: (e, v) => ({ ...(e as DimensionEntity), textOverride: (v as string) || undefined }) },
    { key: 'o.textHeight', group: 'dimension', label: L('Altura de texto', 'Text height'), kind: 'number', get: (e, ctx) => (e as DimensionEntity).overrides.textHeight ?? ctx.doc.data.dimStyles.get((e as DimensionEntity).style)?.textHeight, set: (e, v) => ((v as number) > 0 ? { ...(e as DimensionEntity), overrides: { ...(e as DimensionEntity).overrides, textHeight: v as number } } : null) },
    { key: 'o.arrowSize', group: 'dimension', label: L('Tamaño de flecha', 'Arrow size'), kind: 'number', get: (e, ctx) => (e as DimensionEntity).overrides.arrowSize ?? ctx.doc.data.dimStyles.get((e as DimensionEntity).style)?.arrowSize, set: (e, v) => ((v as number) >= 0 ? { ...(e as DimensionEntity), overrides: { ...(e as DimensionEntity).overrides, arrowSize: v as number } } : null) },
    { key: 'o.precision', group: 'dimension', label: L('Precisión', 'Precision'), kind: 'number', get: (e, ctx) => (e as DimensionEntity).overrides.precision ?? ctx.doc.data.dimStyles.get((e as DimensionEntity).style)?.precision, set: (e, v) => ({ ...(e as DimensionEntity), overrides: { ...(e as DimensionEntity).overrides, precision: Math.max(0, Math.min(8, Math.round(v as number))) } }) },
    { key: 'o.prefix', group: 'dimension', label: L('Prefijo', 'Prefix'), kind: 'text', get: (e, ctx) => (e as DimensionEntity).overrides.prefix ?? ctx.doc.data.dimStyles.get((e as DimensionEntity).style)?.prefix ?? '', set: (e, v) => ({ ...(e as DimensionEntity), overrides: { ...(e as DimensionEntity).overrides, prefix: v as string } }) },
    { key: 'o.suffix', group: 'dimension', label: L('Sufijo', 'Suffix'), kind: 'text', get: (e, ctx) => (e as DimensionEntity).overrides.suffix ?? ctx.doc.data.dimStyles.get((e as DimensionEntity).style)?.suffix ?? '', set: (e, v) => ({ ...(e as DimensionEntity), overrides: { ...(e as DimensionEntity).overrides, suffix: v as string } }) },
    {
      key: 'o.tolerance',
      group: 'dimension',
      label: L('Tolerancia', 'Tolerance'),
      kind: 'select',
      get: (e, ctx) => (e as DimensionEntity).overrides.tolerance ?? ctx.doc.data.dimStyles.get((e as DimensionEntity).style)?.tolerance ?? 'none',
      set: (e, v) => ({ ...(e as DimensionEntity), overrides: { ...(e as DimensionEntity).overrides, tolerance: v as 'none' } }),
      options: ['none', 'symmetrical', 'deviation', 'limits', 'basic'].map((v) => ({ value: v, label: v })),
    },
    { key: 'o.tolUpper', group: 'dimension', label: L('Tolerancia superior', 'Upper tolerance'), kind: 'number', get: (e, ctx) => (e as DimensionEntity).overrides.tolUpper ?? ctx.doc.data.dimStyles.get((e as DimensionEntity).style)?.tolUpper, set: (e, v) => ({ ...(e as DimensionEntity), overrides: { ...(e as DimensionEntity).overrides, tolUpper: v as number } }) },
    { key: 'o.tolLower', group: 'dimension', label: L('Tolerancia inferior', 'Lower tolerance'), kind: 'number', get: (e, ctx) => (e as DimensionEntity).overrides.tolLower ?? ctx.doc.data.dimStyles.get((e as DimensionEntity).style)?.tolLower, set: (e, v) => ({ ...(e as DimensionEntity), overrides: { ...(e as DimensionEntity).overrides, tolLower: v as number } }) },
    { key: 'o.altUnits', group: 'dimension', label: L('Unidades alternativas', 'Alternate units'), kind: 'bool', get: (e, ctx) => (e as DimensionEntity).overrides.altUnits ?? ctx.doc.data.dimStyles.get((e as DimensionEntity).style)?.altUnits ?? false, set: (e, v) => ({ ...(e as DimensionEntity), overrides: { ...(e as DimensionEntity).overrides, altUnits: v as boolean } }) },
    { key: 'assoc', group: 'dimension', label: L('Asociativa', 'Associative'), kind: 'readonly', get: (e) => ((e as DimensionEntity).assoc?.length ? `✓ (${(e as DimensionEntity).assoc!.length})` : '—') },
  ],
  insert: [
    { key: 'blockName', group: 'misc', label: L('Nombre', 'Name'), kind: 'readonly', get: (e, ctx) => ctx.doc.data.blocks.get((e as InsertEntity).blockId)?.name ?? '?' },
    ...vecRows<InsertEntity>('position', L('Posición', 'Position'), (e) => e.position, (e, p) => ({ ...e, position: p })),
    { key: 'scaleX', group: 'geometry', label: L('Escala X', 'Scale X'), kind: 'number', get: (e) => (e as InsertEntity).scale.x, set: (e, v) => ((v as number) !== 0 ? { ...(e as InsertEntity), scale: { ...(e as InsertEntity).scale, x: v as number } } : null) },
    { key: 'scaleY', group: 'geometry', label: L('Escala Y', 'Scale Y'), kind: 'number', get: (e) => (e as InsertEntity).scale.y, set: (e, v) => ((v as number) !== 0 ? { ...(e as InsertEntity), scale: { ...(e as InsertEntity).scale, y: v as number } } : null) },
    { key: 'rotation', group: 'geometry', label: L('Rotación', 'Rotation'), kind: 'angle', get: (e) => deg((e as InsertEntity).rotation), set: (e, v) => ({ ...(e as InsertEntity), rotation: rad(v as number) }) },
  ],
  table: [
    { key: 'rows', group: 'misc', label: L('Filas', 'Rows'), kind: 'readonly', get: (e) => (e as TableEntity).rowHeights.length },
    { key: 'cols', group: 'misc', label: L('Columnas', 'Columns'), kind: 'readonly', get: (e) => (e as TableEntity).columnWidths.length },
    { key: 'twidth', group: 'misc', label: L('Anchura total', 'Table width'), kind: 'readonly', get: (e) => (e as TableEntity).columnWidths.reduce((a, b) => a + b, 0) },
    { key: 'theight', group: 'misc', label: L('Altura total', 'Table height'), kind: 'readonly', get: (e) => (e as TableEntity).rowHeights.reduce((a, b) => a + b, 0) },
  ],
  mleader: [
    { key: 'mlstyle', group: 'misc', label: L('Estilo', 'Style'), kind: 'select', get: (e) => (e as MLeaderEntity).style, set: (e, v) => ({ ...(e as MLeaderEntity), style: v as string }) },
    {
      key: 'mltext',
      group: 'text',
      label: L('Contenido', 'Contents'),
      kind: 'multiline',
      get: (e) => ((e as MLeaderEntity).content.type === 'mtext' ? ((e as MLeaderEntity).content as { text: string }).text.replace(/\\P/g, '\n') : ''),
      set: (e, v) => {
        const m = e as MLeaderEntity;
        if (m.content.type !== 'mtext') return { ...m, content: { type: 'mtext', text: String(v).replace(/\r?\n/g, '\\P'), height: 2.5, attachment: 4, width: 0, frame: false } };
        return { ...m, content: { ...m.content, text: String(v).replace(/\r?\n/g, '\\P') } };
      },
    },
    { key: 'dogleg', group: 'misc', label: L('Longitud de rellano', 'Landing length'), kind: 'number', get: (e) => (e as MLeaderEntity).doglegLength, set: (e, v) => ((v as number) >= 0 ? { ...(e as MLeaderEntity), doglegLength: v as number } : null) },
  ],
  image: [
    { key: 'opacity', group: 'misc', label: L('Opacidad (0–1)', 'Opacity (0–1)'), kind: 'number', get: (e) => (e as ImageEntity).opacity, set: (e, v) => ({ ...(e as ImageEntity), opacity: Math.max(0, Math.min(1, v as number)) }) },
    { key: 'fade', group: 'misc', label: L('Atenuación %', 'Fade %'), kind: 'number', get: (e) => (e as ImageEntity).fade, set: (e, v) => ({ ...(e as ImageEntity), fade: Math.max(0, Math.min(100, v as number)) }) },
    { key: 'brightness', group: 'misc', label: L('Brillo', 'Brightness'), kind: 'number', get: (e) => (e as ImageEntity).brightness, set: (e, v) => ({ ...(e as ImageEntity), brightness: Math.max(0, Math.min(100, v as number)) }) },
    { key: 'contrast', group: 'misc', label: L('Contraste', 'Contrast'), kind: 'number', get: (e) => (e as ImageEntity).contrast, set: (e, v) => ({ ...(e as ImageEntity), contrast: Math.max(0, Math.min(100, v as number)) }) },
    { key: 'clipEnabled', group: 'misc', label: L('Mostrar recortada', 'Show clipped'), kind: 'bool', get: (e) => (e as ImageEntity).clipEnabled, set: (e, v) => ({ ...(e as ImageEntity), clipEnabled: v as boolean }) },
    { key: 'iwidth', group: 'geometry', label: L('Anchura', 'Width'), kind: 'readonly', get: (e) => len((e as ImageEntity).u) },
    { key: 'iheight', group: 'geometry', label: L('Altura', 'Height'), kind: 'readonly', get: (e) => len((e as ImageEntity).v) },
  ],
  pdfunderlay: [
    { key: 'page', group: 'misc', label: L('Página', 'Page'), kind: 'number', get: (e) => (e as PdfUnderlayEntity).page, set: (e, v) => ({ ...(e as PdfUnderlayEntity), page: Math.max(1, Math.round(v as number)) }) },
    { key: 'uscale', group: 'geometry', label: L('Escala', 'Scale'), kind: 'number', get: (e) => (e as PdfUnderlayEntity).scale, set: (e, v) => ((v as number) > 0 ? { ...(e as PdfUnderlayEntity), scale: v as number } : null) },
    { key: 'urot', group: 'geometry', label: L('Rotación', 'Rotation'), kind: 'angle', get: (e) => deg((e as PdfUnderlayEntity).rotation), set: (e, v) => ({ ...(e as PdfUnderlayEntity), rotation: rad(v as number) }) },
    { key: 'uopacity', group: 'misc', label: L('Opacidad (0–1)', 'Opacity (0–1)'), kind: 'number', get: (e) => (e as PdfUnderlayEntity).opacity, set: (e, v) => ({ ...(e as PdfUnderlayEntity), opacity: Math.max(0, Math.min(1, v as number)) }) },
    { key: 'ufade', group: 'misc', label: L('Atenuación %', 'Fade %'), kind: 'number', get: (e) => (e as PdfUnderlayEntity).fade, set: (e, v) => ({ ...(e as PdfUnderlayEntity), fade: Math.max(0, Math.min(100, v as number)) }) },
    { key: 'umono', group: 'misc', label: L('Monocromo', 'Monochrome'), kind: 'bool', get: (e) => (e as PdfUnderlayEntity).monochrome, set: (e, v) => ({ ...(e as PdfUnderlayEntity), monochrome: v as boolean }) },
    { key: 'uclip', group: 'misc', label: L('Mostrar recortado', 'Show clipped'), kind: 'bool', get: (e) => (e as PdfUnderlayEntity).clipEnabled, set: (e, v) => ({ ...(e as PdfUnderlayEntity), clipEnabled: v as boolean }) },
  ],
  viewport: [
    { key: 'vpscale', group: 'view', label: L('Escala personalizada', 'Custom scale'), kind: 'number', get: (e) => (e as ViewportEntity).scale, set: (e, v) => ((v as number) > 0 && !(e as ViewportEntity).displayLocked ? { ...(e as ViewportEntity), scale: v as number, scaleName: undefined } : null) },
    { key: 'vplocked', group: 'view', label: L('Visualización bloqueada', 'Display locked'), kind: 'bool', get: (e) => (e as ViewportEntity).displayLocked, set: (e, v) => ({ ...(e as ViewportEntity), displayLocked: v as boolean }) },
    { key: 'vpon', group: 'view', label: L('Activado', 'On'), kind: 'bool', get: (e) => (e as ViewportEntity).on, set: (e, v) => ({ ...(e as ViewportEntity), on: v as boolean }) },
    { key: 'vpw', group: 'geometry', label: L('Anchura', 'Width'), kind: 'number', get: (e) => (e as ViewportEntity).width, set: (e, v) => ((v as number) > 0 ? { ...(e as ViewportEntity), width: v as number } : null) },
    { key: 'vph', group: 'geometry', label: L('Altura', 'Height'), kind: 'number', get: (e) => (e as ViewportEntity).height, set: (e, v) => ((v as number) > 0 ? { ...(e as ViewportEntity), height: v as number } : null) },
    { key: 'vptwist', group: 'view', label: L('Giro de vista', 'View twist'), kind: 'angle', get: (e) => deg((e as ViewportEntity).viewTwist), set: (e, v) => ({ ...(e as ViewportEntity), viewTwist: rad(v as number) }) },
  ],
};

export function rowsForType(type: EntityType): PropRow[] {
  return TYPE_ROWS[type] ?? [];
}

