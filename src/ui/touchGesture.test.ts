import { describe, expect, it, vi } from 'vitest';
import type { Vec2 } from '../geometry/vec';
import { TouchGestureController, type TouchGestureActions } from './touchGesture';

function createMockActions(isPointLike = false): {
  actions: TouchGestureActions;
  taps: Vec2[];
  doubleTaps: Vec2[];
  longPresses: Vec2[];
  singlePans: { dx: number; dy: number }[];
  twoFingerPans: { dx: number; dy: number }[];
  pinches: { center: Vec2; factor: number; pan: Vec2 }[];
  aimMoves: Vec2[];
  aimEnds: Vec2[];
  pointerMoves: Vec2[];
  cancels: number;
  setPointLike: (v: boolean) => void;
} {
  let pointLike = isPointLike;
  const taps: Vec2[] = [];
  const doubleTaps: Vec2[] = [];
  const longPresses: Vec2[] = [];
  const singlePans: { dx: number; dy: number }[] = [];
  const twoFingerPans: { dx: number; dy: number }[] = [];
  const pinches: { center: Vec2; factor: number; pan: Vec2 }[] = [];
  const aimMoves: Vec2[] = [];
  const aimEnds: Vec2[] = [];
  const pointerMoves: Vec2[] = [];
  let cancels = 0;

  const actions: TouchGestureActions = {
    onTap: (p) => taps.push(p),
    onDoubleTap: (p) => doubleTaps.push(p),
    onLongPress: (p) => longPresses.push(p),
    onSinglePan: (dx, dy) => singlePans.push({ dx, dy }),
    onTwoFingerPan: (dx, dy) => twoFingerPans.push({ dx, dy }),
    onPinch: (center, factor, pan) => pinches.push({ center, factor, pan }),
    onAimMove: (p) => aimMoves.push(p),
    onAimEnd: (p) => aimEnds.push(p),
    onPointerMove: (p) => pointerMoves.push(p),
    onCancel: () => cancels++,
    isPointLike: () => pointLike,
  };

  return {
    actions,
    taps,
    doubleTaps,
    longPresses,
    singlePans,
    twoFingerPans,
    pinches,
    aimMoves,
    aimEnds,
    pointerMoves,
    get cancels() {
      return cancels;
    },
    setPointLike: (v) => {
      pointLike = v;
    },
  };
}

describe('TouchGestureController (UI-002)', () => {
  it('1. Single tap: registra tap sin pans ni pinches', () => {
    const mock = createMockActions(false);
    const ctrl = new TouchGestureController(mock.actions, { longPressMs: 500 });

    ctrl.onPointerDown(1, { x: 100, y: 100 }, 1000);
    expect(ctrl.currentPhase).toBe('tap-candidate');
    expect(mock.pointerMoves).toHaveLength(1);

    ctrl.onPointerUp(1, { x: 100, y: 100 }, 1100);
    expect(ctrl.currentPhase).toBe('idle');
    expect(mock.taps).toHaveLength(1);
    expect(mock.taps[0]).toEqual({ x: 100, y: 100 });
    expect(mock.doubleTaps).toHaveLength(0);
    expect(mock.singlePans).toHaveLength(0);
    expect(mock.pinches).toHaveLength(0);
  });

  it('2. Double tap: detecta dos pulsaciones rápidas y cercanas en reposo', () => {
    const mock = createMockActions(false);
    const ctrl = new TouchGestureController(mock.actions, { doubleTapMs: 280, doubleTapPx: 24 });

    // Primer tap
    ctrl.onPointerDown(1, { x: 100, y: 100 }, 1000);
    ctrl.onPointerUp(1, { x: 100, y: 100 }, 1050);
    expect(mock.taps).toHaveLength(1);

    // Segundo tap en menos de 280ms y < 24px
    ctrl.onPointerDown(1, { x: 105, y: 102 }, 1150);
    ctrl.onPointerUp(1, { x: 105, y: 102 }, 1200);

    expect(mock.doubleTaps).toHaveLength(1);
    expect(mock.doubleTaps[0]).toEqual({ x: 105, y: 102 });
  });

  it('3. Double tap en comando de punto: no dispara doubleTap sino dos taps consecutivos para situar puntos', () => {
    const mock = createMockActions(true); // isPointLike = true (ej. dibujando línea)
    const ctrl = new TouchGestureController(mock.actions, { doubleTapMs: 280 });

    ctrl.onPointerDown(1, { x: 100, y: 100 }, 1000);
    ctrl.onPointerUp(1, { x: 100, y: 100 }, 1050);

    ctrl.onPointerDown(1, { x: 102, y: 101 }, 1150);
    ctrl.onPointerUp(1, { x: 102, y: 101 }, 1200);

    expect(mock.doubleTaps).toHaveLength(0);
    expect(mock.taps).toHaveLength(2);
  });

  it('4. Long press: dispara acción y no emite tap al soltar', () => {
    vi.useFakeTimers();
    try {
      const mock = createMockActions(false);
      const ctrl = new TouchGestureController(mock.actions, { longPressMs: 500 });

      ctrl.onPointerDown(1, { x: 50, y: 50 }, 1000);
      expect(mock.longPresses).toHaveLength(0);

      vi.advanceTimersByTime(550);
      expect(mock.longPresses).toHaveLength(1);
      expect(mock.longPresses[0]).toEqual({ x: 50, y: 50 });

      // Al levantar el dedo tras long press, no debe generar tap
      ctrl.onPointerUp(1, { x: 50, y: 50 }, 1600);
      expect(mock.taps).toHaveLength(0);
      expect(ctrl.currentPhase).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('5. Single finger pan: arrastre con un dedo encuadra si no hay comando de punto', () => {
    const mock = createMockActions(false);
    const ctrl = new TouchGestureController(mock.actions, { tapMoveTolerancePx: 8 });

    ctrl.onPointerDown(1, { x: 100, y: 100 }, 1000);
    // Pequeño movimiento bajo umbral no activa pan
    ctrl.onPointerMove(1, { x: 103, y: 103 });
    expect(mock.singlePans).toHaveLength(0);

    // Movimiento mayor a 8px activa pan
    ctrl.onPointerMove(1, { x: 120, y: 110 });
    expect(ctrl.currentPhase).toBe('single-pan');
    expect(mock.singlePans).toHaveLength(1);
    expect(mock.singlePans[0]).toEqual({ dx: 17, dy: 7 });

    ctrl.onPointerUp(1, { x: 120, y: 110 }, 1200);
    expect(mock.taps).toHaveLength(0);
  });

  it('6. Point aim con lupa: arrastre con un dedo en comando de punto activa puntería y sitúa punto al soltar', () => {
    const mock = createMockActions(true); // isPointLike = true
    const ctrl = new TouchGestureController(mock.actions, { tapMoveTolerancePx: 8 });

    ctrl.onPointerDown(1, { x: 200, y: 200 }, 1000);
    ctrl.onPointerMove(1, { x: 220, y: 220 });

    expect(ctrl.currentPhase).toBe('point-aim');
    expect(mock.aimMoves).toContainEqual({ x: 220, y: 220 });
    expect(mock.singlePans).toHaveLength(0);

    ctrl.onPointerUp(1, { x: 220, y: 220 }, 1200);
    expect(mock.aimEnds).toContainEqual({ x: 220, y: 220 });
    expect(mock.taps).toHaveLength(0);
  });

  it('7. Two finger pan sin zoom bajo deadzone de pellizco', () => {
    const mock = createMockActions(false);
    const ctrl = new TouchGestureController(mock.actions, { pinchDeadzonePx: 14 });

    ctrl.onPointerDown(1, { x: 100, y: 100 });
    ctrl.onPointerDown(2, { x: 200, y: 100 }); // dist inicial = 100
    expect(ctrl.currentPhase).toBe('multi-touch');
    expect(ctrl.isZooming).toBe(false);

    // Mover ambos dedos paralelamente en X +10px (dist se mantiene en 100)
    ctrl.onPointerMove(1, { x: 110, y: 100 });
    ctrl.onPointerMove(2, { x: 210, y: 100 });

    expect(ctrl.isZooming).toBe(false);
    expect(mock.twoFingerPans.length).toBeGreaterThan(0);
    expect(mock.pinches).toHaveLength(0);
  });

  it('8. Pinch zoom: separación de dedos más allá del deadzone activa zoom y calcula centro y factor', () => {
    const mock = createMockActions(false);
    const ctrl = new TouchGestureController(mock.actions, { pinchDeadzonePx: 14 });

    ctrl.onPointerDown(1, { x: 100, y: 100 });
    ctrl.onPointerDown(2, { x: 200, y: 100 }); // dist inicial = 100

    // Separar dedos a 130px (|130 - 100| = 30 > 14)
    ctrl.onPointerMove(1, { x: 85, y: 100 });
    ctrl.onPointerMove(2, { x: 215, y: 100 });

    expect(ctrl.isZooming).toBe(true);
    expect(mock.pinches.length).toBeGreaterThan(0);
    const lastPinch = mock.pinches[mock.pinches.length - 1];
    expect(lastPinch.factor).toBeGreaterThan(1); // acercamiento (zoom in)
    expect(lastPinch.center.y).toBeCloseTo(100, 1);
  });

  it('9. Levantar un dedo durante el pellizco: no salta ni genera taps o puntos fantasma', () => {
    const mock = createMockActions(false);
    const ctrl = new TouchGestureController(mock.actions);

    ctrl.onPointerDown(1, { x: 100, y: 100 });
    ctrl.onPointerDown(2, { x: 200, y: 100 });
    ctrl.onPointerMove(1, { x: 80, y: 100 });
    ctrl.onPointerMove(2, { x: 220, y: 100 });

    // Se levanta el dedo 1
    ctrl.onPointerUp(1, { x: 80, y: 100 });
    expect(ctrl.currentPhase).toBe('cancelled'); // transición protegida para evitar clicks con el dedo 2
    expect(mock.taps).toHaveLength(0);

    // Se levanta el dedo 2
    ctrl.onPointerUp(2, { x: 220, y: 100 });
    expect(ctrl.currentPhase).toBe('idle');
    expect(mock.taps).toHaveLength(0);
    expect(mock.doubleTaps).toHaveLength(0);
  });

  it('10. Pointercancel durante tap: no genera punto ni acción y cancela timers', () => {
    vi.useFakeTimers();
    try {
      const mock = createMockActions(false);
      const ctrl = new TouchGestureController(mock.actions, { longPressMs: 500 });

      ctrl.onPointerDown(1, { x: 150, y: 150 });
      ctrl.onPointerCancel(1);

      expect(mock.cancels).toBe(1);
      expect(mock.taps).toHaveLength(0);

      vi.advanceTimersByTime(600);
      expect(mock.longPresses).toHaveLength(0);
      expect(ctrl.currentPhase).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('11. Pointercancel durante pinch: resetea estado sin emitir acciones', () => {
    const mock = createMockActions(false);
    const ctrl = new TouchGestureController(mock.actions);

    ctrl.onPointerDown(1, { x: 100, y: 100 });
    ctrl.onPointerDown(2, { x: 200, y: 100 });
    ctrl.onPointerMove(1, { x: 80, y: 100 });

    ctrl.onPointerCancel(1);
    // 1 cancel al entrar en multitáctil (para limpiar cualquier lupa previa) + 1 cancel por pointercancel
    expect(mock.cancels).toBe(2);
    expect(ctrl.isZooming).toBe(false);

    // Levantar el segundo dedo después de la cancelación
    ctrl.onPointerUp(2, { x: 200, y: 100 });
    expect(mock.taps).toHaveLength(0);
    expect(ctrl.currentPhase).toBe('idle');
  });

  it('12. Tercer dedo (3+ punteros): se ignora para cálculos de pinch y no genera saltos', () => {
    const mock = createMockActions(false);
    const ctrl = new TouchGestureController(mock.actions);

    ctrl.onPointerDown(1, { x: 100, y: 100 });
    ctrl.onPointerDown(2, { x: 200, y: 100 });

    // Dedo accidental o palma
    ctrl.onPointerDown(3, { x: 300, y: 300 });
    expect(ctrl.activePointerCount).toBe(3);

    const prevPinches = mock.pinches.length;
    // Mover el 3er dedo no debe disparar pinch del par activo
    ctrl.onPointerMove(3, { x: 350, y: 350 });
    expect(mock.pinches.length).toBe(prevPinches);

    // Levantar el 3er dedo no rompe el par
    ctrl.onPointerUp(3, { x: 350, y: 350 });
    expect(ctrl.activePointerCount).toBe(2);
  });

  it('13. destroy() limpia todos los punteros y notifica cancelación', () => {
    const mock = createMockActions(true);
    const ctrl = new TouchGestureController(mock.actions);

    ctrl.onPointerDown(1, { x: 50, y: 50 });
    ctrl.onPointerMove(1, { x: 80, y: 80 }); // point aim activo
    expect(ctrl.currentPhase).toBe('point-aim');

    ctrl.destroy();
    expect(mock.cancels).toBe(1);
    expect(ctrl.currentPhase).toBe('idle');
    expect(ctrl.activePointerCount).toBe(0);
  });
});
