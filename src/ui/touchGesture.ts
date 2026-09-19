import type { Vec2 } from '../geometry/vec';

export type GesturePhase =
  | 'idle'
  | 'tap-candidate'
  | 'single-pan'
  | 'point-aim'
  | 'multi-touch'
  | 'cancelled';

export interface TouchGestureOptions {
  pinchDeadzonePx?: number;
  doubleTapMs?: number;
  doubleTapPx?: number;
  longPressMs?: number;
  tapMoveTolerancePx?: number;
}

export interface TouchGestureActions {
  onTap: (p: Vec2) => void;
  onDoubleTap: (p: Vec2) => void;
  onLongPress: (p: Vec2) => void;
  onSinglePan: (dx: number, dy: number) => void;
  onTwoFingerPan: (dx: number, dy: number) => void;
  onPinch: (center: Vec2, factor: number, pan: Vec2) => void;
  onAimMove: (p: Vec2) => void;
  onAimEnd: (p: Vec2) => void;
  onPointerMove: (p: Vec2) => void;
  onCancel: () => void;
  isPointLike: () => boolean;
}

export class TouchGestureController {
  private readonly options: Required<TouchGestureOptions>;
  private readonly actions: TouchGestureActions;

  private pointers = new Map<number, Vec2>();
  private activePair: number[] = [];
  private phase: GesturePhase = 'idle';

  private tapStart: (Vec2 & { t: number }) | null = null;
  private lastTap: (Vec2 & { t: number }) | null = null;
  private moved = false;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;

  private lastCenter: Vec2 | null = null;
  private lastDist = 0;
  private startDist = 0;
  private zooming = false;

  constructor(actions: TouchGestureActions, options: TouchGestureOptions = {}) {
    this.actions = actions;
    this.options = {
      pinchDeadzonePx: options.pinchDeadzonePx ?? 14,
      doubleTapMs: options.doubleTapMs ?? 280,
      doubleTapPx: options.doubleTapPx ?? 24,
      longPressMs: options.longPressMs ?? 500,
      tapMoveTolerancePx: options.tapMoveTolerancePx ?? 8,
    };
  }

  get currentPhase(): GesturePhase {
    return this.phase;
  }

  get activePointerCount(): number {
    return this.pointers.size;
  }

  get isZooming(): boolean {
    return this.zooming;
  }

  onPointerDown(pointerId: number, p: Vec2, now = Date.now()) {
    this.pointers.set(pointerId, { ...p });

    if (this.pointers.size === 1) {
      this.clearLongPressTimer();
      this.tapStart = { ...p, t: now };
      this.moved = false;
      this.phase = 'tap-candidate';
      this.actions.onPointerMove(p);

      this.longPressTimer = setTimeout(() => {
        if (!this.moved && this.pointers.size === 1 && this.tapStart) {
          this.tapStart = null;
          this.phase = 'cancelled';
          this.actions.onLongPress(p);
        }
      }, this.options.longPressMs);
      return;
    }

    if (this.pointers.size === 2) {
      this.clearLongPressTimer();
      this.tapStart = null;
      this.actions.onCancel();

      const ids = [...this.pointers.keys()];
      this.activePair = [ids[0], ids[1]];
      const p1 = this.pointers.get(this.activePair[0])!;
      const p2 = this.pointers.get(this.activePair[1])!;

      this.lastCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      this.lastDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      this.startDist = this.lastDist;
      this.zooming = false;
      this.phase = 'multi-touch';
      return;
    }

    // 3+ punteros: ignorar para encuadre/zoom para evitar saltos o perturbaciones por toques accidentales de palma
    if (this.pointers.size >= 3) {
      // no perturbar activePair existente
    }
  }

  onPointerMove(pointerId: number, p: Vec2) {
    if (!this.pointers.has(pointerId)) return;
    const prev = this.pointers.get(pointerId)!;
    this.pointers.set(pointerId, { ...p });

    if (this.pointers.size >= 2) {
      if (this.activePair.length !== 2 || !this.activePair.includes(pointerId)) return;
      const p1 = this.pointers.get(this.activePair[0])!;
      const p2 = this.pointers.get(this.activePair[1])!;
      const c = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);

      if (!this.zooming && Math.abs(d - this.startDist) > this.options.pinchDeadzonePx) {
        this.zooming = true;
      }

      if (this.lastCenter && this.lastDist > 0) {
        const pan = { x: c.x - this.lastCenter.x, y: c.y - this.lastCenter.y };
        if (this.zooming) {
          const factor = d / this.lastDist;
          this.actions.onPinch(c, factor, pan);
        } else {
          this.actions.onTwoFingerPan(pan.x, pan.y);
        }
      }
      this.lastCenter = c;
      this.lastDist = d;
      return;
    }

    if (this.pointers.size === 1) {
      if (this.phase === 'cancelled') return;

      if (this.tapStart && Math.hypot(p.x - this.tapStart.x, p.y - this.tapStart.y) > this.options.tapMoveTolerancePx) {
        this.moved = true;
        this.clearLongPressTimer();
      }

      const pointLike = this.actions.isPointLike();
      if (this.moved && !pointLike) {
        this.phase = 'single-pan';
        this.actions.onSinglePan(p.x - prev.x, p.y - prev.y);
      } else {
        if (pointLike && this.moved) {
          this.phase = 'point-aim';
          this.actions.onAimMove(p);
        } else {
          this.actions.onPointerMove(p);
        }
      }
    }
  }

  onPointerUp(pointerId: number, p: Vec2, now = Date.now()) {
    if (!this.pointers.has(pointerId)) return;
    this.pointers.delete(pointerId);
    this.clearLongPressTimer();

    if (this.activePair.includes(pointerId) || this.pointers.size < 2) {
      this.lastCenter = null;
      this.lastDist = 0;
      this.zooming = false;
      this.activePair = [];
    }

    // Si estábamos en gesto multitáctil y queda 1 o más dedos, evitar que levantar dedos residuales active clics
    if (this.phase === 'multi-touch') {
      if (this.pointers.size === 0) {
        this.phase = 'idle';
      } else {
        this.phase = 'cancelled';
        this.tapStart = null;
        this.moved = true;
      }
      return;
    }

    if (this.phase === 'cancelled') {
      if (this.pointers.size === 0) this.phase = 'idle';
      this.tapStart = null;
      return;
    }

    const pointLike = this.actions.isPointLike();
    if (this.tapStart && (!this.moved || pointLike)) {
      if (this.moved && pointLike) {
        // Fin de apuntado con lupa/referencia
        this.actions.onAimEnd(p);
      } else if (!this.moved) {
        const prev = this.lastTap;
        if (
          !pointLike &&
          prev &&
          now - prev.t < this.options.doubleTapMs &&
          Math.hypot(p.x - prev.x, p.y - prev.y) < this.options.doubleTapPx
        ) {
          this.lastTap = null;
          this.actions.onDoubleTap(p);
        } else {
          this.lastTap = { ...p, t: now };
          this.actions.onTap(p);
        }
      }
    }

    this.tapStart = null;
    this.phase = 'idle';
  }

  onPointerCancel(pointerId: number) {
    if (!this.pointers.has(pointerId)) return;
    this.pointers.delete(pointerId);
    this.clearLongPressTimer();

    this.lastCenter = null;
    this.lastDist = 0;
    this.zooming = false;
    this.activePair = [];
    this.tapStart = null;
    this.moved = true;
    this.phase = this.pointers.size === 0 ? 'idle' : 'cancelled';

    this.actions.onCancel();
  }

  destroy() {
    this.clearLongPressTimer();
    this.pointers.clear();
    this.activePair = [];
    this.tapStart = null;
    this.lastTap = null;
    this.lastCenter = null;
    this.phase = 'idle';
    this.actions.onCancel();
  }

  private clearLongPressTimer() {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}
