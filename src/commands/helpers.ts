import type { Curve } from '../geometry/curves';
import type { Vec2 } from '../geometry/vec';
import { entityDefaults } from '../document/defaults';
import { newId } from '../document/ids';
import type { Entity, EntityBase, Id } from '../document/types';
import { kindOf } from '../model/registry';
import type { CommandApi, Keyword, L10n } from './types';
import { CommandError } from './types';

export const L = (es: string, en: string): L10n => ({ es, en });
export const K = (key: string, es: string, en: string, aliases: string[] = []): Keyword => ({ key, label: { es, en }, aliases });

type NewEntityProps<E extends Entity> = Omit<E, keyof EntityBase> & { type: E['type'] } & Partial<EntityBase>;

/** Entidad completa con las propiedades actuales, lista para vista previa o inserción. */
export function make<E extends Entity>(api: CommandApi, props: NewEntityProps<E>): E {
  const owner = props.owner ?? api.editor.inputOwner;
  return { ...entityDefaults(api.editor.doc, owner), id: props.id ?? `preview-${newId()}`, order: props.order ?? Number.MAX_SAFE_INTEGER, ...props } as E;
}

/** Inserta una entidad (asigna ID y orden definitivos). */
export function add<E extends Entity>(api: CommandApi, label: string, props: NewEntityProps<E>): E {
  const e = make<E>(api, props);
  const { id: _pid, order: _o, ...rest } = e;
  return api.apply(label, (tx) => tx.addEntity<E>(rest as never));
}

export function addMany(api: CommandApi, label: string, entities: Entity[]): Id[] {
  return api.apply(label, (tx) =>
    entities.map((e) => {
      const { id: _i, order: _o, ...rest } = e;
      return tx.addEntity(rest as never).id;
    }),
  );
}

export function curvesOf(api: CommandApi, id: Id): Curve[] {
  const e = api.editor.doc.entity(id);
  return e ? kindOf(e).curves(e, api.editor.ctx) : [];
}

export function fail(es: string, en: string): never {
  throw new CommandError({ es, en });
}

export const UNDO_KW = K('Undo', 'desHacer', 'Undo', ['h', 'u', 'deshacer']);
export const CLOSE_KW = K('Close', 'Cerrar', 'Close', ['c', 'cerrar']);

export function mustPoint(r: { kind: string; p?: Vec2 }): Vec2 {
  if (r.kind !== 'point' || !r.p) fail('Se esperaba un punto.', 'A point was expected.');
  return r.p!;
}

/** Longitud actual en unidades con precisión del documento. */
export function fmtLen(api: CommandApi, v: number): string {
  return v.toFixed(api.editor.doc.settings.linearPrecision);
}
