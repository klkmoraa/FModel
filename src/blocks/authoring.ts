import type { Vec2 } from '../geometry/vec';
import type { DynActionType, DynamicBlockDefinition, DynParam, DynParamType, GeoConstraintType, DimConstraintType, Id } from '../document/types';

type L10n = { es: string; en: string };

export const PARAM_TYPE_LABEL: Record<DynParamType, L10n> = {
  basepoint: { es: 'Punto base', en: 'Base point' },
  point: { es: 'Punto', en: 'Point' },
  linear: { es: 'Lineal', en: 'Linear' },
  polar: { es: 'Polar', en: 'Polar' },
  xy: { es: 'XY', en: 'XY' },
  rotation: { es: 'Rotación', en: 'Rotation' },
  alignment: { es: 'Alineación', en: 'Alignment' },
  flip: { es: 'Simetría', en: 'Flip' },
  visibility: { es: 'Visibilidad', en: 'Visibility' },
  lookup: { es: 'Consulta', en: 'Lookup' },
};

export const ACTION_TYPE_LABEL: Record<DynActionType, L10n> = {
  move: { es: 'Desplazar', en: 'Move' },
  scale: { es: 'Escala', en: 'Scale' },
  stretch: { es: 'Estirar', en: 'Stretch' },
  polarstretch: { es: 'Estiramiento polar', en: 'Polar stretch' },
  rotate: { es: 'Girar', en: 'Rotate' },
  flip: { es: 'Simetría', en: 'Flip' },
  array: { es: 'Matriz', en: 'Array' },
  lookup: { es: 'Consulta', en: 'Lookup' },
};

export const GEO_CONSTRAINT_LABEL: Record<GeoConstraintType, L10n> = {
  horizontal: { es: 'Horizontal', en: 'Horizontal' },
  vertical: { es: 'Vertical', en: 'Vertical' },
  parallel: { es: 'Paralela', en: 'Parallel' },
  perpendicular: { es: 'Perpendicular', en: 'Perpendicular' },
  coincident: { es: 'Coincidente', en: 'Coincident' },
  tangent: { es: 'Tangente', en: 'Tangent' },
  concentric: { es: 'Concéntrica', en: 'Concentric' },
  equal: { es: 'Igual', en: 'Equal' },
  symmetric: { es: 'Simétrica', en: 'Symmetric' },
  fixed: { es: 'Fija', en: 'Fix' },
  collinear: { es: 'Colineal', en: 'Collinear' },
};

export const DIM_CONSTRAINT_LABEL: Record<DimConstraintType, L10n> = {
  'linear-h': { es: 'Lineal horizontal', en: 'Horizontal' },
  'linear-v': { es: 'Lineal vertical', en: 'Vertical' },
  aligned: { es: 'Alineada', en: 'Aligned' },
  angular: { es: 'Angular', en: 'Angular' },
  radius: { es: 'Radio', en: 'Radius' },
  diameter: { es: 'Diámetro', en: 'Diameter' },
};

/** Tipos de parámetro que admite cada acción. */
export const ACTION_COMPAT: Record<DynActionType, DynParamType[]> = {
  move: ['point', 'linear', 'polar', 'xy'],
  scale: ['linear', 'polar', 'xy'],
  stretch: ['point', 'linear', 'polar', 'xy'],
  polarstretch: ['polar'],
  rotate: ['rotation'],
  flip: ['flip'],
  array: ['linear', 'polar', 'xy', 'rotation'],
  lookup: ['lookup'],
};

/** Parámetros que no necesitan acción para tener efecto. */
export const SELF_ACTING_PARAMS: DynParamType[] = ['visibility', 'lookup', 'basepoint', 'alignment'];

/** Parámetros que pueden ser columna de entrada de una tabla de consulta. */
export const LOOKUP_INPUT_TYPES: DynParamType[] = ['linear', 'rotation', 'visibility'];

export function emptyDynamic(): DynamicBlockDefinition {
  return { parameters: [], actions: [], constraints: [], lookups: [], variables: [], propertyOrder: [] };
}

/**
 * Elimina un parámetro y todo lo que depende de él: sus acciones, su tabla de consulta,
 * las columnas de otras tablas y su posición en el orden de propiedades.
 */
export function removeParameter(def: DynamicBlockDefinition, paramId: Id): DynamicBlockDefinition {
  const p = def.parameters.find((x) => x.id === paramId);
  const tableId = p?.type === 'lookup' ? p.tableId : null;
  return {
    ...def,
    parameters: def.parameters.filter((x) => x.id !== paramId),
    actions: def.actions.filter((a) => a.paramId !== paramId && !(tableId && a.type === 'lookup' && a.tableId === tableId)).map((a) => ({ ...a, selection: a.selection.filter((s) => s !== paramId) })),
    lookups: def.lookups
      .filter((t) => t.id !== tableId)
      .map((t) => {
        const col = t.inputs.indexOf(paramId);
        if (col < 0) return t;
        return { ...t, inputs: t.inputs.filter((_, i) => i !== col), rows: t.rows.map((r) => ({ ...r, inputs: r.inputs.filter((_, i) => i !== col) })) };
      }),
    propertyOrder: def.propertyOrder.filter((x) => x !== paramId),
  };
}

/** Nombres usados en fórmulas (parámetros, restricciones dimensionales y variables). */
export function formulaNames(def: DynamicBlockDefinition): Set<string> {
  const out = new Set<string>();
  for (const p of def.parameters) out.add(p.name);
  for (const c of def.constraints) if (c.kind === 'dimensional') out.add(c.name);
  for (const v of def.variables) out.add(v.name);
  return out;
}

export function isValidFormulaName(name: string): boolean {
  return /^[A-Za-z_À-ɏ][A-Za-z0-9_À-ɏ]*$/.test(name);
}

export function paramsWithoutAction(def: DynamicBlockDefinition): DynParam[] {
  return def.parameters.filter((p) => !SELF_ACTING_PARAMS.includes(p.type) && !def.actions.some((a) => a.paramId === p.id));
}

/** Puntos característicos de un parámetro (para encuadre y designación). */
export function parameterPoints(p: DynParam): Vec2[] {
  switch (p.type) {
    case 'linear':
    case 'polar':
    case 'flip':
      return [p.base, p.end];
    case 'xy':
      return [p.base, p.corner];
    case 'rotation':
      return [
        { x: p.base.x - p.radius, y: p.base.y - p.radius },
        { x: p.base.x + p.radius, y: p.base.y + p.radius },
      ];
    case 'alignment':
      return [p.base];
    case 'point':
    case 'basepoint':
      return [p.point];
    case 'visibility':
    case 'lookup':
      return [p.position];
  }
}
