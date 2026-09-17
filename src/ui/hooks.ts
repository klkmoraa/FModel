import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Editor, EditorEvent } from '../editor/editor';

/** Re-renderiza cuando ocurre alguno de los eventos del editor. */
export function useEditorEvents(editor: Editor, events: EditorEvent[]): number {
  const key = events.join('|');
  const subscribe = useCallback(
    (cb: () => void) => {
      const offs = events.map((ev) => editor.on(ev, cb));
      return () => offs.forEach((o) => o());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, key],
  );
  const getSnapshot = useCallback(() => events.reduce((s, ev) => s + editor.versions[ev], 0), [editor, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Igual que useEditorEvents pero limitado a un fotograma (para eventos muy frecuentes). */
export function useThrottledEditorEvents(editor: Editor, events: EditorEvent[]): number {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const offs = events.map((ev) =>
      editor.on(ev, () => {
        if (raf.current) return;
        raf.current = requestAnimationFrame(() => {
          raf.current = 0;
          setV((x) => x + 1);
        });
      }),
    );
    return () => {
      offs.forEach((o) => o());
      cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, events.join('|')]);
  return v;
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => (typeof matchMedia !== 'undefined' ? matchMedia(q).matches : false));
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
