import { describe, expect, it } from 'vitest';
import { TAU } from './angle';
import type { Curve, EllipseCurve, LineCurve } from './curves';
import {
  closestParam,
  curveBBox,
  curveLength,
  curvePoint,
  ellipseAngleOfPoint,
  reverseCurve,
  subCurve,
  transformCurve,
} from './curves';
import { chamferLines, filletCurves } from './fillet';
import { intersectCurves } from './intersect';
import { applyToPoint, compose, invert, reflection, rotation, scaling, translation } from './matrix';
import { offsetCurve, offsetPolyline } from './offset';
import { bulgeToArc, curvesToVertices, polylineSegments, polylineSignedArea, pointInPolygon } from './polyline';
import { splineThroughPoints, splinePoint, splitSpline, splineDomain } from './spline';
import { dist } from './vec';

const close = (a: number, b: number, eps = 1e-7) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('matrix', () => {
  it('compose applies in order and inverts', () => {
    const m = compose(translation(1, 2), rotation(Math.PI / 2), scaling(2));
    const p = applyToPoint(m, { x: 1, y: 0 });
    close(p.x, -4);
    close(p.y, 4);
    const back = applyToPoint(invert(m), p);
    close(back.x, 1);
    close(back.y, 0);
  });
  it('reflection mirrors across a line', () => {
    const m = reflection({ x: 0, y: 0 }, { x: 1, y: 1 });
    const p = applyToPoint(m, { x: 2, y: 0 });
    close(p.x, 0);
    close(p.y, 2);
  });
});

describe('bulge', () => {
  it('semicircle bulge=1 is CCW below a +x chord', () => {
    const arc = bulgeToArc({ x: 0, y: 0 }, { x: 2, y: 0 }, 1);
    close(arc.c.x, 1);
    close(arc.c.y, 0);
    close(arc.r, 1);
    const m = curvePoint(arc, 0.5);
    close(m.x, 1);
    close(m.y, -1);
    const e = curvePoint(arc, 1);
    close(e.x, 2);
    close(e.y, 0);
  });
  it('quarter bulge produces 90° arc', () => {
    const b = Math.tan(Math.PI / 8);
    const arc = bulgeToArc({ x: 1, y: 0 }, { x: 0, y: 1 }, b);
    close(arc.c.x, 0);
    close(arc.c.y, 0);
    close(arc.sweep, Math.PI / 2);
  });
  it('polyline area with arc segment (stadium)', () => {
    const verts = [
      { x: 0, y: 0, bulge: 0 },
      { x: 4, y: 0, bulge: 1 },
      { x: 4, y: 2, bulge: 0 },
      { x: 0, y: 2, bulge: 1 },
    ];
    close(polylineSignedArea(verts), 8 + Math.PI, 1e-9);
  });
});

describe('intersections', () => {
  it('line-line', () => {
    const hits = intersectCurves({ kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }, { kind: 'line', a: { x: 0, y: 10 }, b: { x: 10, y: 0 } });
    expect(hits).toHaveLength(1);
    close(hits[0].p.x, 5);
    close(hits[0].t1, 0.5);
  });
  it('line-line extended', () => {
    const a: LineCurve = { kind: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } };
    const b: LineCurve = { kind: 'line', a: { x: 5, y: 1 }, b: { x: 5, y: 2 } };
    expect(intersectCurves(a, b)).toHaveLength(0);
    const h = intersectCurves(a, b, { extend1: true, extend2: true });
    expect(h).toHaveLength(1);
    close(h[0].t1, 5);
    close(h[0].t2, -1);
  });
  it('line-circle two points and arc filtering', () => {
    const line: Curve = { kind: 'line', a: { x: -5, y: 0 }, b: { x: 5, y: 0 } };
    const circle: Curve = { kind: 'arc', c: { x: 0, y: 0 }, r: 2, a0: 0, sweep: TAU };
    expect(intersectCurves(line, circle)).toHaveLength(2);
    const upperArc: Curve = { kind: 'arc', c: { x: 0, y: 0 }, r: 2, a0: 0.1, sweep: Math.PI - 0.2 };
    expect(intersectCurves(line, upperArc)).toHaveLength(0);
    expect(intersectCurves(line, upperArc, { extend2: true })).toHaveLength(2);
  });
  it('line tangent to circle gives one point', () => {
    const line: Curve = { kind: 'line', a: { x: -5, y: 2 }, b: { x: 5, y: 2 } };
    const circle: Curve = { kind: 'arc', c: { x: 0, y: 0 }, r: 2, a0: 0, sweep: TAU };
    const h = intersectCurves(line, circle);
    expect(h).toHaveLength(1);
    close(h[0].p.x, 0, 1e-6);
  });
  it('circle-circle', () => {
    const a: Curve = { kind: 'arc', c: { x: 0, y: 0 }, r: 5, a0: 0, sweep: TAU };
    const b: Curve = { kind: 'arc', c: { x: 8, y: 0 }, r: 5, a0: 0, sweep: TAU };
    const h = intersectCurves(a, b);
    expect(h).toHaveLength(2);
    h.forEach((x) => {
      close(x.p.x, 4);
      close(Math.abs(x.p.y), 3);
    });
  });
  it('line-ellipse', () => {
    const e: EllipseCurve = { kind: 'ellipse', c: { x: 0, y: 0 }, major: { x: 4, y: 0 }, ratio: 0.5, a0: 0, sweep: TAU };
    const h = intersectCurves({ kind: 'line', a: { x: -10, y: 0 }, b: { x: 10, y: 0 } }, e);
    expect(h).toHaveLength(2);
    expect(h.map((x) => Math.round(Math.abs(x.p.x)))).toEqual([4, 4]);
  });
  it('ellipse-circle numeric', () => {
    const e: EllipseCurve = { kind: 'ellipse', c: { x: 0, y: 0 }, major: { x: 4, y: 0 }, ratio: 0.5, a0: 0, sweep: TAU };
    const c: Curve = { kind: 'arc', c: { x: 0, y: 0 }, r: 3, a0: 0, sweep: TAU };
    const h = intersectCurves(e, c);
    expect(h).toHaveLength(4);
    h.forEach((x) => close(Math.hypot(x.p.x, x.p.y), 3, 1e-6));
  });
  it('spline-line numeric', () => {
    const s = splineThroughPoints([
      { x: 0, y: 0 },
      { x: 2, y: 3 },
      { x: 4, y: -1 },
      { x: 6, y: 2 },
    ]);
    const h = intersectCurves({ kind: 'spline', s }, { kind: 'line', a: { x: -1, y: 1 }, b: { x: 7, y: 1 } });
    expect(h.length).toBeGreaterThanOrEqual(3);
    h.forEach((x) => close(x.p.y, 1, 1e-6));
  });
});

describe('curves', () => {
  it('arc bbox includes quadrants', () => {
    const b = curveBBox({ kind: 'arc', c: { x: 0, y: 0 }, r: 1, a0: -0.5, sweep: 1 });
    close(b.maxX, 1);
  });
  it('closest param on arc', () => {
    const arc: Curve = { kind: 'arc', c: { x: 0, y: 0 }, r: 1, a0: 0, sweep: Math.PI };
    close(closestParam(arc, { x: 0, y: 5 }), 0.5);
  });
  it('subCurve and reverse keep geometry', () => {
    const arc: Curve = { kind: 'arc', c: { x: 0, y: 0 }, r: 2, a0: 0, sweep: Math.PI };
    const s = subCurve(arc, 0.25, 0.75);
    close(curveLength(s), Math.PI);
    const r = reverseCurve(s);
    close(dist(curvePoint(r, 0), curvePoint(s, 1)), 0);
  });
  it('ellipse transform preserves points', () => {
    const e: EllipseCurve = { kind: 'ellipse', c: { x: 1, y: 1 }, major: { x: 3, y: 0 }, ratio: 0.4, a0: 0.2, sweep: 2 };
    const m = compose(rotation(0.7), scaling(2, 2), translation(3, -1));
    const t = transformCurve(e, m) as EllipseCurve;
    for (const u of [0, 0.3, 0.8, 1]) {
      const p = applyToPoint(m, curvePoint(e, u));
      close(dist(p, curvePoint(t, u)), 0, 1e-9);
    }
  });
  it('ellipse transform with mirror and non-uniform scale', () => {
    const e: EllipseCurve = { kind: 'ellipse', c: { x: 0, y: 0 }, major: { x: 2, y: 1 }, ratio: 0.5, a0: 0.4, sweep: 1.5 };
    const m = compose(scaling(1, -3), rotation(0.3));
    const t = transformCurve(e, m) as EllipseCurve;
    for (const u of [0, 0.5, 1]) {
      const p = applyToPoint(m, curvePoint(e, u));
      close(dist(p, curvePoint(t, u)), 0, 1e-9);
    }
    const q = curvePoint(t, 0.5);
    const ang = ellipseAngleOfPoint(t, q);
    close(Math.cos(ang), Math.cos(t.a0 + t.sweep * 0.5), 1e-9);
  });
});

describe('spline', () => {
  it('interpolates fit points', () => {
    const fit = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 3, y: 3 },
      { x: 5, y: 1 },
      { x: 6, y: 4 },
    ];
    const s = splineThroughPoints(fit);
    const [u0, u1] = splineDomain(s);
    close(dist(splinePoint(s, u0), fit[0]), 0);
    close(dist(splinePoint(s, u1), fit[4]), 0);
    const tess = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((u) => splinePoint(s, u));
    for (const f of fit.slice(1, 4)) {
      const nearest = Math.min(...tess.map((p) => dist(p, f)), ...Array.from({ length: 1001 }, (_, i) => dist(splinePoint(s, i / 1000), f)));
      expect(nearest).toBeLessThan(1e-2);
    }
  });
  it('split preserves shape', () => {
    const s = splineThroughPoints([
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 3, y: 3 },
      { x: 5, y: 1 },
    ]);
    const [l, r] = splitSpline(s, 0.4);
    expect(l && r).toBeTruthy();
    close(dist(splinePoint(l!, 1), splinePoint(s, 0.4)), 0, 1e-9);
    close(dist(splinePoint(r!, 0), splinePoint(s, 0.4)), 0, 1e-9);
    close(dist(splinePoint(r!, 0.5), splinePoint(s, 0.7)), 0, 1e-9);
  });
});

describe('offset', () => {
  it('offsets arc radius by side', () => {
    const arc = offsetCurve({ kind: 'arc', c: { x: 0, y: 0 }, r: 5, a0: 0, sweep: 1 }, 1);
    expect(arc && arc.kind === 'arc' && arc.r).toBe(4);
    expect(offsetCurve({ kind: 'arc', c: { x: 0, y: 0 }, r: 5, a0: 0, sweep: 1 }, 6)).toBeNull();
  });
  it('closed square offsets inward and outward', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const inside = offsetPolyline(sq, true, 1);
    expect(inside).toHaveLength(1);
    close(Math.abs(polylineSignedArea(inside[0].vertices)), 64, 1e-6);
    const outside = offsetPolyline(sq, true, -1);
    expect(outside).toHaveLength(1);
    close(Math.abs(polylineSignedArea(outside[0].vertices)), 144, 1e-6);
  });
  it('offset removes collapsed local loops', () => {
    // U estrecha: el offset interior mayor que media anchura del canal elimina el canal
    const u = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 6, y: 10 },
      { x: 6, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ];
    const res = offsetPolyline(u, true, 1.5);
    const areas = res.map((r) => Math.abs(polylineSignedArea(r.vertices)));
    expect(res.length).toBeGreaterThanOrEqual(1);
    const pts = res.flatMap((r) => r.vertices);
    // ningún punto del resultado cae dentro del canal (x entre 4 y 6, y > 2)
    expect(pts.some((p) => p.x > 4.01 && p.x < 5.99 && p.y > 2.5)).toBe(false);
    expect(areas.every((a) => a > 0)).toBe(true);
  });
  it('open polyline with arc offsets', () => {
    const verts = [
      { x: 0, y: 0, bulge: 0 },
      { x: 10, y: 0, bulge: 1 },
      { x: 10, y: 4, bulge: 0 },
      { x: 0, y: 4, bulge: 0 },
    ];
    const res = offsetPolyline(verts, false, -1);
    expect(res).toHaveLength(1);
    const segs = polylineSegments(res[0].vertices, res[0].closed);
    const arc = segs.find((s) => s.kind === 'arc');
    expect(arc && arc.kind === 'arc' && Math.abs(arc.r - 3)).toBeLessThan(1e-6);
  });
});

describe('fillet & chamfer', () => {
  it('fillets perpendicular lines', () => {
    const l1: LineCurve = { kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
    const l2: LineCurve = { kind: 'line', a: { x: 10, y: -1 }, b: { x: 10, y: 10 } };
    const r = filletCurves(l1, { x: 2, y: 0 }, l2, { x: 10, y: 8 }, 2)!;
    expect(r).toBeTruthy();
    close(r.arc!.c.x, 8);
    close(r.arc!.c.y, 2);
    close(Math.abs(r.arc!.sweep), Math.PI / 2);
    expect(r.c1!.kind).toBe('line');
    const c1 = r.c1 as LineCurve;
    close(Math.max(c1.a.x, c1.b.x), 8);
    const c2 = r.c2 as LineCurve;
    close(Math.min(c2.a.y, c2.b.y), 2);
  });
  it('fillet radius 0 makes a corner', () => {
    const l1: LineCurve = { kind: 'line', a: { x: 0, y: 0 }, b: { x: 8, y: 0 } };
    const l2: LineCurve = { kind: 'line', a: { x: 10, y: 2 }, b: { x: 10, y: 10 } };
    const r = filletCurves(l1, { x: 1, y: 0 }, l2, { x: 10, y: 9 }, 0)!;
    const c1 = r.c1 as LineCurve;
    close(Math.max(c1.a.x, c1.b.x), 10);
    const c2 = r.c2 as LineCurve;
    close(Math.min(c2.a.y, c2.b.y), 0);
  });
  it('fillets line and arc', () => {
    const line: LineCurve = { kind: 'line', a: { x: -10, y: 0 }, b: { x: 10, y: 0 } };
    const arc: Curve = { kind: 'arc', c: { x: 0, y: 5 }, r: 6, a0: -Math.PI, sweep: Math.PI };
    const r = filletCurves(line, { x: -8, y: 0 }, arc as never, { x: -6, y: 5 }, 1);
    expect(r).toBeTruthy();
    close(dist(r!.arc!.c, { x: 0, y: 5 }), 7, 1e-6);
    close(r!.arc!.c.y, 1, 1e-6);
  });
  it('chamfers two lines', () => {
    const l1: LineCurve = { kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
    const l2: LineCurve = { kind: 'line', a: { x: 10, y: 0 }, b: { x: 10, y: 10 } };
    const r = chamferLines(l1, { x: 1, y: 0 }, l2, { x: 10, y: 9 }, 2, 3)!;
    const line = r.line as LineCurve;
    close(dist(line.a, { x: 8, y: 0 }), 0);
    close(dist(line.b, { x: 10, y: 3 }), 0);
  });
});

describe('polyline helpers', () => {
  it('curvesToVertices builds closed polyline', () => {
    const { vertices, closed } = curvesToVertices([
      { kind: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
      { kind: 'line', a: { x: 1, y: 0 }, b: { x: 1, y: 1 } },
      { kind: 'line', a: { x: 1, y: 1 }, b: { x: 0, y: 0 } },
    ]);
    expect(closed).toBe(true);
    expect(vertices).toHaveLength(3);
  });
  it('pointInPolygon', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(pointInPolygon({ x: 1, y: 1 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 3, y: 1 }, sq)).toBe(false);
  });
});
