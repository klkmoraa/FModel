import type {
  DynamicBlockDefinition,
  DynamicInstanceState,
  Id,
  InsertEntity,
  PolarStretchAction,
} from '../document/types';

/**
 * Resolutor de identificadores: puede ser un Map<Id, Id>, un Record<Id, Id> o una función (id: Id) => Id | undefined.
 */
export type IdResolver =
  | Map<Id, Id>
  | Record<Id, Id>
  | ((id: Id) => Id | undefined);

export type MissingRefKind = 'visibility' | 'selection' | 'rotateOnly' | 'constraint' | 'param';

export interface RemapContext {
  kind: MissingRefKind;
  containerId?: Id;
}

export interface RemapWarning {
  code: 'missing-reference';
  ref: Id;
  context: RemapContext;
  message: { es: string; en: string };
}

export interface RemapDynamicBlockOptions {
  /**
   * Política para referencias que no se encuentran en el mapa/resolver:
   * - 'keep': conserva el ID original (por defecto, previene pérdida accidental de datos).
   * - 'omit': descarta la referencia de selecciones, estados de visibilidad y rotateOnly;
   *           en restricciones geométricas/dimensionales, elimina la referencia y la
   *           restricción si ya no conserva referencias válidas.
   * - 'error': lanza un error si alguna referencia de entidad no se resuelve.
   */
  missingPolicy?: 'keep' | 'omit' | 'error';

  /**
   * Callback invocado para cada referencia de entidad no encontrada en el resolutor.
   */
  onMissing?: (ref: Id, context: RemapContext) => void;

  /**
   * Arreglo opcional para acumular mensajes bilingües o advertencias sobre referencias no resueltas.
   */
  warnings?: RemapWarning[];

  /**
   * Mapa o función resolutora para identificadores de parámetros (opcional).
   */
  paramMap?: IdResolver;

  /**
   * Mapa o función resolutora para identificadores de tablas de consulta (opcional).
   */
  tableMap?: IdResolver;
}

function resolveId(id: Id, resolver: IdResolver): Id | undefined {
  if (typeof resolver === 'function') {
    return resolver(id);
  }
  if (resolver instanceof Map) {
    return resolver.get(id);
  }
  if (resolver && typeof resolver === 'object') {
    const candidate = resolver as unknown as Record<string, unknown>;
    if (typeof candidate.get === 'function') {
      return (candidate.get as (k: Id) => Id | undefined)(id);
    }
    return (resolver as Record<Id, Id>)[id];
  }
  return undefined;
}

function remapEntityRef(
  id: Id,
  resolver: IdResolver,
  options: RemapDynamicBlockOptions,
  context: RemapContext,
  allParamIds?: Set<Id>,
): Id | undefined {
  const target = resolveId(id, resolver);
  if (target !== undefined) {
    return target;
  }

  // Si context.kind === 'selection', puede contener una referencia a un parámetro (acciones encadenadas)
  if (context.kind === 'selection') {
    if (options.paramMap) {
      const paramTarget = resolveId(id, options.paramMap);
      if (paramTarget !== undefined) {
        return paramTarget;
      }
    }
    if (allParamIds?.has(id)) {
      return id;
    }
  }

  options.onMissing?.(id, context);
  if (options.warnings) {
    const location = `${context.kind}${context.containerId ? ` (${context.containerId})` : ''}`;
    options.warnings.push({
      code: 'missing-reference',
      ref: id,
      context,
      message: {
        es: `Referencia no encontrada: «${id}» en ${location}`,
        en: `Missing reference: "${id}" in ${location}`,
      },
    });
  }

  if (options.missingPolicy === 'error') {
    throw new Error(
      `Referencia no encontrada: «${id}» en ${context.kind}${context.containerId ? ` (${context.containerId})` : ''}`,
    );
  }

  if (options.missingPolicy === 'omit') {
    return undefined;
  }

  // 'keep' por defecto
  return id;
}

/**
 * Remapea de forma tipada las referencias internas a entidades (y opcionalmente parámetros/tablas)
 * en una definición de bloque dinámico (DynamicBlockDefinition).
 *
 * Solo modifica:
 * - `states[].visible` en parámetros de visibilidad
 * - `selection` en acciones
 * - `rotateOnly` en acciones de estiramiento polar (PolarStretchAction)
 * - `refs[].entityId` en restricciones geométricas y dimensionales
 * (y opcionalmente `paramId`, `inputs`, `propertyOrder` si se provee `paramMap`, o `tableId` si se provee `tableMap`).
 *
 * NUNCA toca cadenas arbitrarias como `name`, `label`, `description`, `expression`, o filas de lookup.
 */
export function remapDynamicBlockDef(
  dynamic: DynamicBlockDefinition,
  entityResolver: IdResolver,
  options: RemapDynamicBlockOptions = {},
): DynamicBlockDefinition {
  if (!dynamic || typeof dynamic !== 'object') {
    return dynamic;
  }

  const cloned: DynamicBlockDefinition = structuredClone(dynamic);

  // Recolectar parámetros de la definición para distinguir parámetros encadenados en selecciones de acciones
  const allParamIds = new Set<Id>();
  if (cloned.parameters) {
    for (const p of cloned.parameters) {
      allParamIds.add(p.id);
      if (options.paramMap) {
        const mapped = resolveId(p.id, options.paramMap);
        if (mapped !== undefined) {
          allParamIds.add(mapped);
        }
      }
    }
  }

  // 1. Parámetros
  if (cloned.parameters) {
    for (const param of cloned.parameters) {
      if (options.paramMap) {
        const newParamId = resolveId(param.id, options.paramMap);
        if (newParamId !== undefined) {
          param.id = newParamId;
        }
      }

      if (param.type === 'visibility' && param.states) {
        for (const state of param.states) {
          if (state.visible) {
            state.visible = state.visible
              .map((id) => remapEntityRef(id, entityResolver, options, { kind: 'visibility', containerId: param.id }))
              .filter((id): id is Id => id !== undefined);
          }
        }
      }

      if (param.type === 'lookup' && options.tableMap) {
        const newTableId = resolveId(param.tableId, options.tableMap);
        if (newTableId !== undefined) {
          param.tableId = newTableId;
        }
      }
    }
  }

  // 2. Acciones
  if (cloned.actions) {
    for (const act of cloned.actions) {
      if (options.paramMap) {
        const newParamId = resolveId(act.paramId, options.paramMap);
        if (newParamId !== undefined) {
          act.paramId = newParamId;
        }
      }

      if (act.type === 'lookup' && options.tableMap) {
        const newTableId = resolveId(act.tableId, options.tableMap);
        if (newTableId !== undefined) {
          act.tableId = newTableId;
        }
      }

      if (act.selection) {
        act.selection = act.selection
          .map((id) => remapEntityRef(id, entityResolver, options, { kind: 'selection', containerId: act.id }, allParamIds))
          .filter((id): id is Id => id !== undefined);
      }

      if (act.type === 'polarstretch') {
        const polarAct = act as PolarStretchAction;
        if (polarAct.rotateOnly) {
          polarAct.rotateOnly = polarAct.rotateOnly
            .map((id) => remapEntityRef(id, entityResolver, options, { kind: 'rotateOnly', containerId: act.id }))
            .filter((id): id is Id => id !== undefined);
        }
      }
    }
  }

  // 3. Restricciones
  if (cloned.constraints) {
    cloned.constraints = cloned.constraints.flatMap((constraint) => {
      if (!constraint.refs) return [constraint];
      const refs = constraint.refs
        .map((ref) => {
          if (!ref.entityId) return ref;
          const remapped = remapEntityRef(ref.entityId, entityResolver, options, { kind: 'constraint', containerId: constraint.id });
          return remapped === undefined ? null : { ...ref, entityId: remapped };
        })
        .filter((ref): ref is NonNullable<typeof ref> => ref !== null && !!ref.entityId);
      return refs.length > 0 ? [{ ...constraint, refs }] : [];
    });
  }

  // 4. Tablas de consulta (lookups)
  if (cloned.lookups) {
    for (const table of cloned.lookups) {
      if (options.tableMap) {
        const newTableId = resolveId(table.id, options.tableMap);
        if (newTableId !== undefined) {
          table.id = newTableId;
        }
      }
      if (options.paramMap && table.inputs) {
        table.inputs = table.inputs.map((inputId) => {
          const newParamId = resolveId(inputId, options.paramMap!);
          return newParamId ?? inputId;
        });
      }
      // NOTA: rows contiene labels y valores de entrada de usuario; nunca se tocan como IDs.
    }
  }

  // 5. Variables: name, expression, description se preservan intactos sin tocar.

  // 6. Orden de propiedades
  if (cloned.propertyOrder && options.paramMap) {
    cloned.propertyOrder = cloned.propertyOrder.map((propId) => {
      const newPropId = resolveId(propId, options.paramMap!);
      return newPropId ?? propId;
    });
  }

  return cloned;
}

/**
 * Remapea de forma pura un objeto DynamicInstanceState cambiando las claves de parámetros.
 */
export function remapDynamicState(
  state: DynamicInstanceState,
  paramResolver: IdResolver,
): DynamicInstanceState {
  if (!state || typeof state !== 'object') {
    return state;
  }
  const cloned: DynamicInstanceState = structuredClone(state);
  if (cloned.values) {
    cloned.values = Object.fromEntries(
      Object.entries(cloned.values).map(([id, value]) => {
        const remapped = resolveId(id, paramResolver) ?? id;
        return [remapped, value];
      }),
    );
  }
  return cloned;
}

/**
 * Remapea las claves de parámetros en el estado de una instancia de bloque dinámico (InsertEntity.dynamic).
 */
export function remapDynamicInstanceState(
  insert: InsertEntity,
  paramResolver: IdResolver | undefined,
): void {
  if (!insert || !insert.dynamic || !paramResolver) return;
  insert.dynamic = remapDynamicState(insert.dynamic, paramResolver);
}
