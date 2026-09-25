import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults, MLEADERSTYLE_STANDARD_ID } from '../../document/defaults';
import type { LineEntity, MLeaderEntity } from '../../document/types';
import { createContext } from '../context';
import { mleaderKind } from './annotation';

describe('annotation entity bounds', () => {
  it('includes block content in a multileader bounding box', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    doc.transact('BLOCK', (tx) => {
      tx.add('blocks', {
        id: 'content-block',
        name: 'Contenido',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: '',
        units: 'mm',
        explodable: true,
        scaleUniformly: false,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(doc, 'content-block'),
        type: 'line',
        start: { x: 100, y: 100 },
        end: { x: 120, y: 120 },
      });
    });
    const leader: MLeaderEntity = {
      ...entityDefaults(doc),
      id: 'mleader-content',
      order: 1,
      type: 'mleader',
      style: MLEADERSTYLE_STANDARD_ID,
      leaders: [],
      landing: { x: 0, y: 0 },
      doglegLength: 0,
      direction: 1,
      content: { type: 'block', blockId: 'content-block', scale: 1, rotation: 0, attributes: {} },
    };

    const bounds = mleaderKind.bbox(leader, ctx);

    expect(bounds.maxX).toBeGreaterThanOrEqual(121);
    expect(bounds.maxY).toBeGreaterThanOrEqual(120);
  });
});

describe('marca de centro', () => {
  it('dibuja cruz y ejes como tramos separados, sin unirlos entre sí', async () => {
    const { centerMarkKind } = await import('./centermark');
    const { createDocument, entityDefaults } = await import('../../document/defaults');
    const { createContext } = await import('../context');
    const doc = createDocument();
    const mark = { ...entityDefaults(doc), id: 'm', order: 1, type: 'centermark' as const, mode: 'mark' as const, center: { x: 0, y: 0 }, radius: 10, rotation: 0, crossSize: 0.1, crossGap: 0.05, extension: 3 };
    const [item] = centerMarkKind.graphics(mark, createContext(doc));
    const cmds = item.k === 'path' ? item.cmds : [];
    expect(cmds.filter((c) => c.t === 'M')).toHaveLength(6);
    expect(cmds.filter((c) => c.t === 'L')).toHaveLength(6);
  });
});
