import type { Mat2D } from '../geometry/matrix';
import { reflection, rotation, scaling, translation } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec';
import { angleOf, dist, sub } from '../geometry/vec';
import type { Entity } from '../document/types';
import { assertFiniteValues } from '../io/validation';
import { kindOf } from '../model/registry';
import { previewConstrained } from '../constraints/drawing';
import { fail, K, L } from './helpers';
import type { CommandDef } from './types';

type Mode = 'STRETCH' | 'MOVE' | 'ROTATE' | 'SCALE' | 'MIRROR';
const MODES: Mode[] = ['STRETCH', 'MOVE', 'ROTATE', 'SCALE', 'MIRROR'];
const MODE_L: Record<Mode, { es: string; en: string }> = {
  STRETCH: { es: '** ESTIRAR **', en: '** STRETCH **' },
  MOVE: { es: '** DESPLAZAR **', en: '** MOVE **' },
  ROTATE: { es: '** GIRAR **', en: '** ROTATE **' },
  SCALE: { es: '** ESCALA **', en: '** SCALE **' },
  MIRROR: { es: '** SIMETRÍA **', en: '** MIRROR **' },
};

/** Edición por pinzamientos (grips): estirar, desplazar, girar, escalar y simetría, con Copia. */
export const GRIP: CommandDef = {
  name: '_GRIP',
  aliases: [],
  category: 'modify',
  label: L('Edición con pinzamientos', 'Grip editing'),
  description: L('Arrastra un grip para estirar; Espacio/Intro alterna Desplazar, Girar, Escala y Simetría.', 'Drag a grip to stretch; Space/Enter cycles Move, Rotate, Scale and Mirror.'),
  async run(api) {
    const editor = api.editor;
    const ctxGrip = editor.gripContext;
    if (!ctxGrip) return;
    const doc = editor.doc;
    const ids = [...new Set(editor.selection.list)];
    const refs = ctxGrip.refs;
    let base: Vec2 = ctxGrip.base;
    let copy = false;
    let modeIdx = 0;
    const dynamicRef = refs.find((r) => r.gripId.startsWith('dyn:'));
    try {
      // grips de menú (visibilidad/consulta) y simetría: actúan con un clic
      if (dynamicRef && /:(menu|flip)$/.test(dynamicRef.gripId)) {
        const e = doc.entity(dynamicRef.entityId)!;
        const next = kindOf(e).moveGrip(e, dynamicRef.gripId, dynamicRef.p, editor.ctx);
        if (next) {
          try {
            assertFiniteValues(next);
          } catch {
            fail('El pinzamiento excede el rango de coordenadas válido.', 'The grip exceeds the valid coordinate range.');
          }
          api.apply('GRIP', (tx) => tx.put('entities', next as Entity));
        }
        return;
      }
      const stretchPreview = (p: Vec2): Entity[] | null => {
        const out: Entity[] = [];
        const byEntity = new Map<string, Entity>();
        for (const r of refs) {
          const cur = byEntity.get(r.entityId) ?? doc.entity(r.entityId);
          if (!cur) continue;
          const moved = kindOf(cur).moveGrip(cur, r.gripId, r.gripId.startsWith('dyn:') ? p : { x: r.p.x + (p.x - base.x), y: r.p.y + (p.y - base.y) }, editor.ctx);
          if (moved) {
            try {
              assertFiniteValues(moved);
            } catch {
              return null;
            }
            byEntity.set(r.entityId, moved as Entity);
          }
        }
        for (const e of byEntity.values()) out.push(e);
        return out;
      };
      const transformOf = (mode: Mode, p: Vec2, refAngle = 0): Mat2D | null => {
        switch (mode) {
          case 'MOVE':
            return translation(p.x - base.x, p.y - base.y);
          case 'ROTATE':
            return rotation(angleOf(sub(p, base)) - refAngle, base);
          case 'SCALE': {
            const d = dist(p, base);
            return d > 1e-12 ? scaling(d, d, base) : null;
          }
          case 'MIRROR':
            return dist(p, base) > 1e-12 ? reflection(base, p) : null;
          default:
            return null;
        }
      };
      const transformed = (m: Mat2D | null): Entity[] => {
        if (!m || Object.values(m).some((value) => !Number.isFinite(value))) return [];
        const entities: Entity[] = [];
        for (const id of ids) {
          const current = doc.entity(id);
          if (!current) continue;
          const moved = kindOf(current).transform(current, m, editor.ctx);
          if (!moved) continue;
          try {
            assertFiniteValues(moved);
          } catch {
            return [];
          }
          entities.push(moved);
        }
        return entities;
      };
      for (;;) {
        const mode = MODES[modeIdx];
        const r = await api.getPoint({
          prompt: L(`${MODE_L[mode].es} Precise ${mode === 'STRETCH' ? 'el punto de estiramiento' : mode === 'MOVE' ? 'el punto de desplazamiento' : mode === 'ROTATE' ? 'el ángulo de rotación' : mode === 'SCALE' ? 'el factor de escala' : 'el segundo punto'}`, `${MODE_L[mode].en} Specify ${mode === 'STRETCH' ? 'stretch point' : mode === 'MOVE' ? 'move point' : mode === 'ROTATE' ? 'rotation angle' : mode === 'SCALE' ? 'scale factor' : 'second point'}`),
          base,
          allowNone: true,
          keywords: [K('Base', 'punto Base', 'Base point', ['b']), K('Copy', 'Copiar', 'Copy', ['c']), K('Undo', 'desHacer', 'Undo', ['h', 'u']), K('eXit', 'Salir', 'eXit', ['s', 'x'])],
          // sin Copiar, la vista previa incluye lo que las restricciones del dibujo arrastrarían
          preview: (p) => {
            const entities = mode === 'STRETCH' ? stretchPreview(p) : transformed(transformOf(mode, p));
            if (!entities) return null;
            return { entities: copy ? entities : previewConstrained(doc.data, entities) };
          },
        });
        if (r.kind === 'none') {
          modeIdx = (modeIdx + 1) % MODES.length;
          if (dynamicRef) modeIdx = 0;
          continue;
        }
        if (r.kind === 'keyword') {
          if (r.key === 'eXit') return;
          if (r.key === 'Copy') copy = true;
          if (r.key === 'Undo') doc.undo();
          if (r.key === 'Base') {
            const b = await api.getPoint({ prompt: L('Precise el punto base', 'Specify base point') });
            if (b.kind === 'point') base = b.p;
          }
          continue;
        }
        const p = r.p;
        if (mode === 'STRETCH') {
          const moved = stretchPreview(p);
          if (!moved) fail('El pinzamiento excede el rango de coordenadas válido.', 'The grip exceeds the valid coordinate range.');
          api.apply('GRIP STRETCH', (tx) => {
            for (const e of moved) {
              if (copy) {
                const { id: _i, order: _o, ...rest } = e;
                tx.addEntity(rest as never);
              } else tx.put('entities', e);
            }
          });
        } else {
          const m = transformOf(mode, p);
          if (m) editor.transformEntities(ids, m, `GRIP ${mode}`, copy);
        }
        if (!copy) return;
      }
    } finally {
      editor.gripContext = null;
      editor.emit('overlay');
    }
  },
};
