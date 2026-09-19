import { describe, expect, it } from 'vitest';
import {
  ARC,
  AREA_COMMANDS,
  BOUNDARY,
  CIRCLE,
  closedLoopOf,
  CONSTRUCTION_COMMANDS,
  CURVE_COMMANDS,
  DIVIDE,
  DONUT,
  DRAW_COMMANDS,
  ELLIPSE,
  HATCH,
  hatchDefaults,
  LINE,
  MLEADER,
  MEASURE,
  MLINE,
  MTEXT,
  nearestCurve,
  PLINE,
  POINT,
  POLYGON,
  RAY,
  RECTANG,
  REGION,
  rectangleVertices,
  REVCLOUD,
  revcloudVertices,
  SPLINE,
  TABLE,
  TEXT,
  WIPEOUT,
  XLINE,
} from './draw';

describe('Fachada pública de comandos de dibujo (ARC-001)', () => {
  it('conserva exports, composición y orden público tras la modularización', () => {
    expect(DRAW_COMMANDS.map((command) => command.name)).toEqual([
      'LINE',
      'PLINE',
      'CIRCLE',
      'ARC',
      'RECTANG',
      'POLYGON',
      'ELLIPSE',
      'SPLINE',
      'POINT',
      'RAY',
      'XLINE',
      'REVCLOUD',
      'DIVIDE',
      'MEASURE',
      'TEXT',
      'MTEXT',
      'MLEADER',
      'TABLE',
      'MLINE',
      'WIPEOUT',
      'HATCH',
      'BOUNDARY',
      'REGION',
      'DONUT',
    ]);

    expect(CURVE_COMMANDS).toContain(LINE);
    expect(CONSTRUCTION_COMMANDS).toContain(POINT);
    expect(AREA_COMMANDS).toContain(HATCH);
    expect([PLINE, CIRCLE, ARC, RECTANG, POLYGON, ELLIPSE, SPLINE, DONUT, RAY, XLINE, REVCLOUD, DIVIDE, MEASURE, TEXT, MTEXT, MLEADER, TABLE, MLINE, WIPEOUT, BOUNDARY, REGION]).toEqual(expect.arrayContaining(DRAW_COMMANDS.filter((command) => command !== LINE && command !== POINT && command !== HATCH)));
    expect(typeof nearestCurve).toBe('function');
    expect(typeof closedLoopOf).toBe('function');
    expect(typeof rectangleVertices).toBe('function');
    expect(typeof revcloudVertices).toBe('function');
    expect(hatchDefaults).toMatchObject({ pattern: 'ANSI31', scale: 1, angle: 0, type: 'predefined' });
  });
});
