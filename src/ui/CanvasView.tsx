import { useEffect, useMemo, useRef } from 'react';
import type { Editor } from '../editor/editor';
import { AssetImageCache } from '../render/assets';
import { renderOverlay } from '../render/overlayRenderer';
import { renderScene } from '../render/sceneRenderer';
import { drawTouchLoupe } from '../render/loupe';
import type { RenderTheme } from '../render/theme';
import { WheelClassifier } from './wheelInput';
import { DND_MIME } from './dnd';
import { dropOnCanvas, parseDropPayload } from './dropOnCanvas';
import { TouchGestureController } from './touchGesture';
import { effectiveDpr } from './dpr';

interface Props {
  editor: Editor;
  theme: RenderTheme;
  onContextMenu?: (x: number, y: number) => void;
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
    const dpr = effectiveDpr();
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
    const offs = [editor.on('doc', markScene), editor.on('view', markScene), editor.on('prefs', markScene), editor.on('space', markScene), editor.on('scene', markScene), editor.on('overlay', markOverlay), editor.on('selection', markOverlay), editor.on('command', markOverlay)];
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    const off = editor.doc.subscribe((event) => {
      if (event.source === 'load' || event.changes.some((change) => change.coll === 'assets')) images.clear();
    });
    return () => {
      off();
      images.clear();
    };
  }, [editor, images]);

  // tamaño
  useEffect(() => {
    const host = hostRef.current!;
    const ro = new ResizeObserver(() => {
      const r = host.getBoundingClientRect();
      const dpr = effectiveDpr();
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
    const wheels = new WheelClassifier();
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const isTouch = (e: PointerEvent) => e.pointerType === 'touch';
    let gripTimer: ReturnType<typeof setTimeout> | null = null;
    const clearGrip = () => { if (gripTimer !== null) clearTimeout(gripTimer); gripTimer = null; };
    let gestureGrip: { command: typeof editor.runner.active; version: number } | null = null;
    const cancelUnchangedGestureGrip = () => {
      const owned = gestureGrip;
      gestureGrip = null;
      // Only this gesture's still-unmodified grip may yield to a native double click.
      if (owned && editor.runner.active === owned.command && owned.command?.def.name === '_GRIP' && editor.doc.version === owned.version) editor.runner.cancelAll();
    };
    const currentCommand = () => editor.runner.active;
    const deferGrip = (activate: () => void) => {
      clearGrip(); gestureGrip = null;
      gripTimer = setTimeout(() => { gripTimer = null; const previous = currentCommand(); activate(); const started = currentCommand(); if (!previous && started?.def.name === '_GRIP') gestureGrip = { command: started, version: editor.doc.version }; }, 320);
    };
    let secondMouseClick = false;
    let precisionGesture: { pointerId: number; opened: boolean; cancelled: boolean } | null = null;
    const mouseDown = (e: MouseEvent) => {
      if (e.detail < 2) gestureGrip = null;
      if (e.button === 0 && e.detail >= 2) cancelUnchangedGestureGrip();
      secondMouseClick = e.button === 0 && e.detail >= 2 && !editor.runner.busy;
      if (secondMouseClick) clearGrip();
    };


    const gesture = new TouchGestureController(
      {
        onTap: (p) => {
          editor.pointerMove(p);
          editor.pointerDown(p, 0);
          editor.pointerUp(p, 0, { deferGrip });
        },
        onDoubleTap: (p) => {
          clearGrip();
          cancelUnchangedGestureGrip();
          editor.doubleClick(p);
        },
        onLongPress: (p) => {
          editor.pointerUp(p, 2);
          navigator.vibrate?.(12);
        },
        onSinglePan: (dx, dy) => {
          editor.view.panPixels(dx, dy);
          editor.emit('view');
        },
        onTwoFingerPan: (dx, dy) => {
          editor.panView(dx, dy);
        },
        onPinch: (center, factor, pan) => {
          editor.pinch(center, factor, pan);
        },
        onAimMove: (p) => {
          editor.touchPoint = p;
          editor.pointerMove(p);
          editor.emit('overlay');
        },
        onAimEnd: (p) => {
          editor.pointerMove(p);
          editor.pointerDown(p, 0);
          editor.pointerUp(p, 0);
          if (editor.touchPoint) {
            editor.touchPoint = null;
            editor.emit('overlay');
          }
        },
        onPointerMove: (p) => {
          editor.pointerMove(p);
        },
        onCancel: () => {
          if (editor.touchPoint) {
            editor.touchPoint = null;
            editor.emit('overlay');
          }
          editor.pointerCancel();
        },
        isPointLike: () => {
          const req = editor.runner.pending?.req;
          return !!(req && (req.kind === 'point' || req.kind === 'distance' || req.kind === 'angle'));
        },
      },
      {
        pinchDeadzonePx: 14,
        doubleTapMs: 320,
        doubleTapPx: 28,
        longPressMs: 500,
        tapMoveTolerancePx: 8,
      }
    );

    const blur = () => {
      clearGrip(); gestureGrip = null; secondMouseClick = false;
      // Keep a cancelled right gesture latched until a fresh down consumes its trailing up.
      if (precisionGesture) precisionGesture.cancelled = true;
    };
    const down = (e: PointerEvent) => {
      precisionGesture = null;
      if (e.button === 2 && e.shiftKey && onContextMenu) { precisionGesture = { pointerId: e.pointerId, opened: false, cancelled: false }; e.preventDefault(); return; }
      try {
        host.setPointerCapture(e.pointerId);
      } catch {
        /* el puntero ya no está activo */
      }
      const p = local(e);
      if (isTouch(e)) {
        gesture.onPointerDown(e.pointerId, p);
        return;
      }
      editor.pointerDown(p, e.button, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (isTouch(e)) {
        gesture.onPointerMove(e.pointerId, p);
        return;
      }
      editor.pointerMove(p, { shift: e.shiftKey, buttons: e.buttons });
    };
    const up = (e: PointerEvent) => {
      if (precisionGesture?.pointerId === e.pointerId && e.button === 2) {
        e.preventDefault();
        if (!precisionGesture.opened && !precisionGesture.cancelled) { precisionGesture.opened = true; const p = local(e); onContextMenu?.(p.x, p.y); }
        return;
      }
      try {
        if (host.hasPointerCapture(e.pointerId)) {
          host.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* puntero ya no activo */
      }
      if (isTouch(e)) {
        gesture.onPointerUp(e.pointerId, local(e));
        return;
      }
      if (e.button === 0 && secondMouseClick) { secondMouseClick = false; editor.pointerCancel(); return; }
      editor.pointerUp(local(e), e.button, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, deferGrip });
    };
    const cancel = (e: PointerEvent) => {
      clearGrip();
      if (precisionGesture?.pointerId === e.pointerId) { precisionGesture = null; e.preventDefault(); return; }
      try {
        if (host.hasPointerCapture(e.pointerId)) {
          host.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* puntero ya no activo */
      }
      if (isTouch(e)) {
        gesture.onPointerCancel(e.pointerId);
        return;
      }
      editor.pointerCancel();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const action = wheels.classify(e, editor.prefs.wheelMode);
      if (action.kind === 'pan') {
        editor.panView(action.dx, action.dy);
        editor.pointerMove(p, { shift: e.shiftKey });
      } else editor.wheel(p, action.delta);
    };
    const leave = () => editor.pointerLeave();
    const ctx = (e: MouseEvent) => {
      e.preventDefault();
      if (precisionGesture) {
        if (!precisionGesture.opened && !precisionGesture.cancelled) { precisionGesture.opened = true; const p = local(e); onContextMenu?.(p.x, p.y); }
        return;
      }
      if (onContextMenu && e.shiftKey) {
        const p = local(e);
        onContextMenu(p.x, p.y);
      }
    };
    const dbl = (e: MouseEvent) => {
      clearGrip();
      if (e.button === 1) editor.zoomExtents();
      else if (e.button === 0) editor.doubleClick(local(e));
    };
    const aux = (e: MouseEvent) => {
      if (e.button === 1 && e.detail === 2) editor.zoomExtents();
    };
    // arrastrar y soltar desde los paneles de bloques, biblioteca y paletas
    const carries = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes(DND_MIME);
    const dragover = (e: DragEvent) => {
      if (!carries(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
      editor.dragHover(local(e));
    };
    const dragleave = (e: DragEvent) => {
      if (carries(e)) editor.pointerLeave();
    };
    const drop = (e: DragEvent) => {
      if (!carries(e)) return;
      e.preventDefault();
      const at = editor.dropAt(local(e));
      const item = parseDropPayload(e.dataTransfer!.getData(DND_MIME));
      if (!item) return;
      void dropOnCanvas(editor, item, at);
    };
    host.addEventListener('dragover', dragover);
    host.addEventListener('dragleave', dragleave);
    host.addEventListener('drop', drop);
    window.addEventListener('blur', blur);
    host.addEventListener('mousedown', mouseDown);
    host.addEventListener('pointerdown', down);
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', cancel);
    host.addEventListener('pointerleave', leave);
    host.addEventListener('wheel', wheel, { passive: false });
    host.addEventListener('contextmenu', ctx);
    host.addEventListener('dblclick', dbl);
    host.addEventListener('auxclick', aux);
    return () => {
      clearGrip();
      gesture.destroy();
      host.removeEventListener('dragover', dragover);
      host.removeEventListener('dragleave', dragleave);
      host.removeEventListener('drop', drop);
      window.removeEventListener('blur', blur);
      host.removeEventListener('mousedown', mouseDown);
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', cancel);
      host.removeEventListener('pointerleave', leave);
      host.removeEventListener('wheel', wheel);
      host.removeEventListener('contextmenu', ctx);
      host.removeEventListener('dblclick', dbl);
      host.removeEventListener('auxclick', aux);
    };
  }, [editor, onContextMenu]);

  const canvasAriaDesc =
    editor.lang === 'es'
      ? `Lienzo 2D de dibujo técnico. Objetos: ${editor.doc.data.entities.size}. Espacio actual: ${
          editor.spaceKind === 'model' ? 'Modelo' : editor.spaceKind === 'block' ? 'Bloque' : 'Presentación'
        }. Usa la línea de comandos o atajos de teclado para dibujar e interactuar.`
      : `2D technical drawing canvas. Objects: ${editor.doc.data.entities.size}. Current space: ${
          editor.spaceKind === 'model' ? 'Model' : editor.spaceKind === 'block' ? 'Block' : 'Layout'
        }. Use the command line or keyboard shortcuts to draw and interact.`;

  return (
    <div
      ref={hostRef}
      className={`canvas-host${editor.runner.busy ? ' is-busy' : ''}`}
      aria-label={editor.lang === 'es' ? 'Lienzo de dibujo' : 'Drawing canvas'}
      role="application"
      aria-description={canvasAriaDesc}
      tabIndex={0}
    >
      <span className="sr-only">{canvasAriaDesc}</span>
      <canvas ref={sceneRef} />
      <canvas ref={overlayRef} />
    </div>
  );
}
