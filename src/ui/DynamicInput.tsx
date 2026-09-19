import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { Editor } from '../editor/editor';
import { useThrottledEditorEvents } from './hooks';

export interface DynamicInputHandle {
  /** Procesa una tecla; devuelve true si la consumió. */
  key(e: KeyboardEvent): boolean;
  active(): boolean;
}

interface Fields {
  a: string;
  b: string;
  idx: 0 | 1;
  typed: [boolean, boolean];
}

const EMPTY: Fields = { a: '', b: '', idx: 0, typed: [false, false] };

/**
 * Entrada dinámica junto al cursor. Con punto base: distancia y ángulo (polares
 * relativas); sin base: X e Y absolutas. Tab alterna campo y lo bloquea.
 */
export const DynamicInput = forwardRef<DynamicInputHandle, { editor: Editor }>(function DynamicInput({ editor }, ref) {
  useThrottledEditorEvents(editor, ['overlay', 'command', 'view']);
  const [f, setF] = useState<Fields>(EMPTY);
  const pending = editor.runner.pending;
  const req = pending?.req;
  const on = editor.prefs.dynamicInput.on && editor.hover.inside;
  const pointLike = !!req && (req.kind === 'point' || req.kind === 'distance' || req.kind === 'angle');
  const base = pointLike && 'base' in req! ? (req as { base?: { x: number; y: number } | null }).base ?? null : null;
  const cur = editor.hover.resolved?.p ?? editor.hover.world;

  useEffect(() => setF(EMPTY), [pending]);

  const liveA = base ? Math.hypot(cur.x - base.x, cur.y - base.y) : cur.x;
  const angDeg = base ? ((Math.atan2(cur.y - base.y, cur.x - base.x) * 180) / Math.PI + 360) % 360 : cur.y;
  const valueA = f.typed[0] ? f.a : liveA.toFixed(4);
  const valueB = f.typed[1] ? f.b : base ? angDeg.toFixed(2) : cur.y.toFixed(4);

  const commit = () => {
    if (!req) return;
    const a = parseFloat(f.typed[0] ? f.a : String(liveA));
    const b = parseFloat(f.typed[1] ? f.b : String(base ? angDeg : cur.y));
    if (!Number.isFinite(a)) return;
    if (req.kind === 'distance' && !f.typed[1]) {
      editor.runner.submitText(String(a));
    } else if (req.kind === 'angle') {
      editor.runner.submitText(String(f.typed[0] ? a : angDeg));
    } else if (base) {
      if (!f.typed[1] && f.typed[0]) editor.runner.submitText(String(a), { cursorPoint: cur });
      else editor.runner.submitText(`@${a}<${Number.isFinite(b) ? b : angDeg}`);
    } else {
      editor.runner.submitText(`#${a},${Number.isFinite(b) ? b : cur.y}`);
    }
    setF(EMPTY);
  };

  useImperativeHandle(ref, () => ({
    active: () => on && pointLike,
    key(e: KeyboardEvent) {
      if (!on || !pointLike) return false;
      const k = e.key;
      if (/^[0-9.-]$/.test(k) || (k === ',' && !base)) {
        if (k === ',') {
          setF((s) => ({ ...s, idx: 1 }));
          return true;
        }
        setF((s) => {
          const field = s.idx === 0 ? 'a' : 'b';
          const typed: [boolean, boolean] = [...s.typed];
          const prev = typed[s.idx] ? s[field] : '';
          typed[s.idx] = true;
          return { ...s, [field]: prev + k, typed };
        });
        return true;
      }
      const anyTyped = f.typed[0] || f.typed[1];
      if (k === 'Tab' && anyTyped) {
        setF((s) => ({ ...s, idx: s.idx === 0 ? 1 : 0 }));
        return true;
      }
      if (k === 'Backspace' && anyTyped) {
        setF((s) => {
          const field = s.idx === 0 ? 'a' : 'b';
          const v = s[field].slice(0, -1);
          const typed: [boolean, boolean] = [...s.typed];
          typed[s.idx] = v.length > 0;
          return { ...s, [field]: v, typed };
        });
        return true;
      }
      if ((k === 'Enter' || k === ' ') && anyTyped) {
        commit();
        return true;
      }
      if (k === 'Escape' && anyTyped) {
        setF(EMPTY);
        return true;
      }
      return false;
    },
  }));

  if (!on || !pending) return null;
  const s = editor.hover.screen;
  const prompt = editor.runner.promptText(pending.req).replace(/\s*\[[^\]]*\]/, '').replace(/:$/, '');
  return (
    <div className="dyn" style={{ left: s.x + 22, top: s.y + 22 }} aria-hidden="true">
      <span className="dyn__prompt">{prompt}</span>
      {pointLike && (
        <>
          <span className={`dyn__field${f.idx === 0 && (f.typed[0] || f.typed[1]) ? ' is-active' : ''}${f.typed[0] ? ' is-locked' : ''}`}>{valueA}</span>
          {req!.kind !== 'distance' && <span className={`dyn__field${f.idx === 1 ? ' is-active' : ''}${f.typed[1] ? ' is-locked' : ''}`}>{base ? `${valueB}°` : valueB}</span>}
        </>
      )}
    </div>
  );
});
