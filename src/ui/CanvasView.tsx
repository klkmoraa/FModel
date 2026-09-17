import { useEffect, useMemo, useRef } from 'react';
import type { Editor } from '../editor/editor';
import { AssetImageCache } from '../render/assets';
import { renderOverlay } from '../render/overlayRenderer';
import { renderScene } from '../render/sceneRenderer';
import { drawTouchLoupe } from '../render/loupe';
import type { RenderTheme } from '../render/theme';

interface Props {
  editor: Editor;
  theme: RenderTheme;
  onContextMenu?: (x: number, y: number) => void;
}

interface TouchState {
  pointers: Map<number, { x: number; y: number }>;
  lastCenter: { x: number; y: number } | null;
  lastDist: number;
  tapStart: { x: number; y: number; t: number } | null;
  moved: boolean;
  longPress: number;
}

export function CanvasView({ editor, theme, onContextMenu }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const dirty = useRef({ scene: true, overlay: true });
  const raf = useRef(0);
  const images = useMemo(
    () =>
      new AssetImageCache(
        () => editor.doc,
        () => {
          dirty.current.scene = true;
          schedule();
        },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  function schedule() {
    if (raf.current) return;
    raf.current = requestAnimationFrame(draw);
  }

  function draw() {
    raf.current = 0;
    const scene = sceneRef.current;
    const overlay = overlayRef.current;
    if (!scene || !overlay) return;
    const dpr = window.devicePixelRatio || 1;
    const opts = { theme: themeRef.current, dpr, images };
    try {
      if (dirty.current.scene) {
        dirty.current.scene = false;
        const g = scene.getContext('2d', { alpha: false });
        if (g) renderScene(g, editor, opts);
      }
      if (dirty.current.overlay) {
        dirty.current.overlay = false;
        const g = overlay.getContext('2d');
        if (g) {
          renderOverlay(g, editor, opts);
          // la lupa se compone al final: amplía la escena y la superposición ya dibujadas
          if (editor.touchPoint) drawTouchLoupe(g, scene, editor.touchPoint, overlay.width / dpr, overlay.height / dpr, themeRef.current, dpr);
        }
      }
    } catch (err) {
      console.error('render', err);
    }
  }

  useEffect(() => {
    dirty.current.scene = true;
    dirty.current.overlay = true;
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    const markScene = () => {
      dirty.current.scene = true;
      dirty.current.overlay = true;
      schedule();
    };
    const markOverlay = () => {
      dirty.current.overlay = true;
      schedule();
    };
    const offs = [editor.on('doc', markScene), editor.on('view', markScene), editor.on('prefs', markScene), editor.on('space', markScene), editor.on('overlay', markOverlay), editor.on('selection', markOverlay), editor.on('command', markOverlay)];
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // tamaño
  useEffect(() => {
    const host = hostRef.current!;
    const ro = new ResizeObserver(() => {
      const r = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      for (const c of [sceneRef.current!, overlayRef.current!]) {
        c.width = Math.max(1, Math.round(r.width * dpr));
        c.height = Math.max(1, Math.round(r.height * dpr));
      }
      editor.setViewportSize(r.width, r.height);
      dirty.current.scene = true;
      dirty.current.overlay = true;
      draw();
    });
    ro.observe(host);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // entrada
  useEffect(() => {
    const host = hostRef.current!;
    const touch: TouchState = { pointers: new Map(), lastCenter: null, lastDist: 0, tapStart: null, moved: false, longPress: 0 };
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const isTouch = (e: PointerEvent) => e.pointerType === 'touch';

    const down = (e: PointerEvent) => {
      try {
        host.setPointerCapture(e.pointerId);
      } catch {
        /* el puntero ya no está activo */
      }
      const p = local(e);
      if (isTouch(e)) {
        touch.pointers.set(e.pointerId, p);
        if (touch.pointers.size === 1) {
          touch.tapStart = { ...p, t: Date.now() };
          touch.moved = false;
          editor.pointerMove(p);
          window.clearTimeout(touch.longPress);
          touch.longPress = window.setTimeout(() => {
            if (!touch.moved && touch.pointers.size === 1) {
              touch.tapStart = null;
              editor.pointerUp(p, 2);
              navigator.vibrate?.(12);
            }
          }, 550);
        } else {
          window.clearTimeout(touch.longPress);
          touch.tapStart = null;
          if (editor.touchPoint) {
            editor.touchPoint = null;
            editor.emit('overlay');
          }
          const pts = [...touch.pointers.values()];
          touch.lastCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          touch.lastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        }
        return;
      }
      editor.pointerDown(p, e.button, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (isTouch(e)) {
        if (!touch.pointers.has(e.pointerId)) return;
        const prev = touch.pointers.get(e.pointerId)!;
        touch.pointers.set(e.pointerId, p);
        if (touch.pointers.size >= 2) {
          const pts = [...touch.pointers.values()];
          const c = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (touch.lastCenter && touch.lastDist > 0) editor.pinch(c, d / touch.lastDist, { x: c.x - touch.lastCenter.x, y: c.y - touch.lastCenter.y });
          touch.lastCenter = c;
          touch.lastDist = d;
          return;
        }
        if (touch.tapStart && Math.hypot(p.x - touch.tapStart.x, p.y - touch.tapStart.y) > 8) touch.moved = true;
        const req = editor.runner.pending?.req;
        const pointLike = req && (req.kind === 'point' || req.kind === 'distance' || req.kind === 'angle');
        if (touch.moved && !pointLike) {
          // un dedo sin petición de punto: encuadre
          editor.view.panPixels(p.x - prev.x, p.y - prev.y);
          editor.emit('view');
        } else {
          if (pointLike && touch.moved) editor.touchPoint = p;
          editor.pointerMove(p);
          if (editor.touchPoint) editor.emit('overlay');
        }
        return;
      }
      editor.pointerMove(p, { shift: e.shiftKey, buttons: e.buttons });
    };
    const up = (e: PointerEvent) => {
      const p = local(e);
      if (isTouch(e)) {
        touch.pointers.delete(e.pointerId);
        window.clearTimeout(touch.longPress);
        if (touch.pointers.size < 2) {
          touch.lastCenter = null;
          touch.lastDist = 0;
        }
        const req = editor.runner.pending?.req;
        const pointLike = req && (req.kind === 'point' || req.kind === 'distance' || req.kind === 'angle');
        if (touch.tapStart && (!touch.moved || pointLike)) {
          editor.pointerMove(p);
          editor.pointerDown(p, 0);
          editor.pointerUp(p, 0);
        }
        touch.tapStart = null;
        if (editor.touchPoint) {
          editor.touchPoint = null;
          editor.emit('overlay');
        }
        return;
      }
      editor.pointerUp(p, e.button, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      if (e.ctrlKey && Math.abs(e.deltaY) < 50) editor.wheel(p, e.deltaY * 8);
      else if (!e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaX) > 0 && Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY)) {
        editor.view.panPixels(-e.deltaX, -e.deltaY);
        editor.emit('view');
      } else editor.wheel(p, e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY);
    };
    const leave = () => editor.pointerLeave();
    const ctx = (e: MouseEvent) => {
      e.preventDefault();
      if (!editor.runner.busy && onContextMenu && e.shiftKey) {
        const p = local(e);
        onContextMenu(p.x, p.y);
      }
    };
    const dbl = (e: MouseEvent) => {
      if (e.button === 1) editor.zoomExtents();
      else if (e.button === 0) editor.doubleClick(local(e));
    };
    const aux = (e: MouseEvent) => {
      if (e.button === 1 && e.detail === 2) editor.zoomExtents();
    };
    host.addEventListener('pointerdown', down);
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
    host.addEventListener('pointerleave', leave);
    host.addEventListener('wheel', wheel, { passive: false });
    host.addEventListener('contextmenu', ctx);
    host.addEventListener('dblclick', dbl);
    host.addEventListener('auxclick', aux);
    return () => {
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', up);
      host.removeEventListener('pointerleave', leave);
      host.removeEventListener('wheel', wheel);
      host.removeEventListener('contextmenu', ctx);
      host.removeEventListener('dblclick', dbl);
      host.removeEventListener('auxclick', aux);
    };
  }, [editor, onContextMenu]);

  return (
    <div ref={hostRef} className={`canvas-host${editor.runner.busy ? ' is-busy' : ''}`} aria-label={editor.lang === 'es' ? 'Lienzo de dibujo' : 'Drawing canvas'} role="application">
      <canvas ref={sceneRef} />
      <canvas ref={overlayRef} />
    </div>
  );
}
