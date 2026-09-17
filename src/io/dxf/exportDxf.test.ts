import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { installDynamicBlocks } from '../../blocks/install';
import { insertBlock } from '../../blocks/blockOps';
import { installDynamicSamples } from '../../blocks/samples';
import { createDocument, DIMSTYLE_ISO_ID, entityDefaults, TEXTSTYLE_STANDARD_ID } from '../../document/defaults';
import type { ArcEntity, CircleEntity, DimensionEntity, EllipseEntity, HatchEntity, InsertEntity, LayerRecord, LineEntity, LwPolylineEntity, MTextEntity, SplineEntity, TextEntity, ViewportEntity, WipeoutEntity } from '../../document/types';
import { MODEL_SPACE_ID } from '../../document/types';
import { createContext } from '../../model/context';
import { exportDxf } from './exportDxf';
import { decodeDxfBytes, importDxfIntoDocument } from './importDxf';
import { parseDxf } from './parser';

function richDocument() {
  const doc = createDocument({ title: 'Exportación' });
  const ctx = createContext(doc);
  installDynamicBlocks(ctx);
  installDynamicSamples(doc);
  const dashed = [...doc.data.linetypes.values()].find((l) => l.name === 'DASHED')!.id;
  doc.transact('seed', (tx) => {
    const layer: LayerRecord = { id: 'lay-ejes', name: 'Ejes', color: '#d9720a', linetype: dashed, lineweight: 35, transparency: 40, on: true, frozen: false, locked: true, plot: false, description: 'Ejes de replanteo', order: 5 };
    tx.add('layers', layer);
    tx.add('layers', { ...layer, id: 'lay-oculta', name: 'Oculta', color: 'aci:3', on: false, locked: false, plot: true, transparency: 0, description: '', order: 6 });
    const d = entityDefaults(doc);
    tx.addEntity<LineEntity>({ ...d, layer: 'lay-ejes', type: 'line', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } });
    tx.addEntity<CircleEntity>({ ...d, color: '#7657d5', lineweight: 50, type: 'circle', center: { x: 50, y: 50 }, radius: 20 });
    tx.addEntity<ArcEntity>({ ...d, type: 'arc', center: { x: 120, y: 50 }, radius: 15, startAngle: 0.2, endAngle: 2.8 });
    tx.addEntity<EllipseEntity>({ ...d, type: 'ellipse', center: { x: 160, y: 50 }, majorAxis: { x: 20, y: 5 }, ratio: 0.4, startParam: 0, endParam: Math.PI * 2 });
    tx.addEntity<LwPolylineEntity>({ ...d, type: 'lwpolyline', closed: true, vertices: [{ x: 0, y: 100 }, { x: 40, y: 100, bulge: 0.5 }, { x: 40, y: 140 }, { x: 0, y: 140 }] });
    tx.addEntity<SplineEntity>({ ...d, type: 'spline', method: 'cv', fitTolerance: 0, spline: { degree: 3, ctrl: [{ x: 60, y: 100 }, { x: 80, y: 140 }, { x: 100, y: 90 }, { x: 120, y: 130 }], knots: [0, 0, 0, 0, 1, 1, 1, 1] } });
    tx.addEntity<TextEntity>({ ...d, type: 'text', text: 'Sección A–A Ø50 ±0,1', position: { x: 10, y: 200 }, alignPoint: { x: 60, y: 200 }, height: 5, rotation: 0.1, widthFactor: 0.9, oblique: 0, style: TEXTSTYLE_STANDARD_ID, halign: 'center', valign: 'baseline' });
    tx.addEntity<MTextEntity>({ ...d, type: 'mtext', position: { x: 100, y: 220 }, width: 80, height: 3.5, rotation: 0, style: TEXTSTYLE_STANDARD_ID, attachment: 1, lineSpacing: 1, contents: 'Notas:\\P\\b1Importante\\b0 texto largo '.repeat(12) });
    tx.addEntity<HatchEntity>({
      ...d,
      type: 'hatch',
      loops: [
        { closed: true, vertices: [{ x: 200, y: 100 }, { x: 260, y: 100 }, { x: 260, y: 160 }, { x: 200, y: 160 }] },
        { closed: true, vertices: [{ x: 220, y: 120 }, { x: 240, y: 120 }, { x: 240, y: 140 }, { x: 220, y: 140 }] },
      ],
      pattern: { type: 'predefined', name: 'ANSI31', angle: 0, scale: 2, spacing: 1, double: false },
      origin: { x: 0, y: 0 },
      islandStyle: 'normal',
    });
    tx.addEntity<HatchEntity>({ ...d, color: 'aci:1', type: 'hatch', loops: [{ closed: true, vertices: [{ x: 300, y: 100 }, { x: 320, y: 100 }, { x: 310, y: 120 }] }], pattern: { type: 'solid', name: 'SOLID', angle: 0, scale: 1, spacing: 1, double: false }, origin: { x: 0, y: 0 }, islandStyle: 'normal' });
    tx.addEntity<DimensionEntity>({ ...d, type: 'dimension', dimType: 'linear', style: DIMSTYLE_ISO_ID, overrides: {}, p1: { x: 0, y: 0 }, p2: { x: 200, y: 0 }, p3: { x: 100, y: -20 }, rotation: 0 });
    tx.addEntity<DimensionEntity>({ ...d, type: 'dimension', dimType: 'radial', style: DIMSTYLE_ISO_ID, overrides: {}, center: { x: 50, y: 50 }, p1: { x: 64.14, y: 64.14 }, p2: { x: 50, y: 50 }, p3: { x: 80, y: 80 }, rotation: 0 });
    tx.addEntity<WipeoutEntity>({ ...d, type: 'wipeout', frame: true, vertices: [{ x: 400, y: 0 }, { x: 440, y: 0 }, { x: 440, y: 30 }, { x: 400, y: 30 }] });
  });
  const panel = doc.findByName('blocks', 'FM Panel ajustable')!;
  const symbol = doc.findByName('blocks', 'FM Símbolo eléctrico')!;
  const layoutId = [...doc.data.layouts.keys()][0];
  doc.transact('inserts', (tx) => {
    const a = insertBlock(tx, doc, panel.id, MODEL_SPACE_ID, { x: 0, y: 300 }, { x: 0.1, y: 0.1 });
    const w = panel.dynamic!.parameters.find((p) => p.name === 'Ancho')!;
    tx.updateEntity<InsertEntity>(a.id, { dynamic: { values: { [w.id]: 1800 } } });
    insertBlock(tx, doc, symbol.id, MODEL_SPACE_ID, { x: 300, y: 300 }, { x: 2, y: 2 }, 0.3, { CIRCUITO: 'C7' });
    const d = entityDefaults(doc, layoutId);
    tx.addEntity<ViewportEntity>({ ...d, type: 'viewport', center: { x: 200, y: 150 }, width: 300, height: 200, viewCenter: { x: 200, y: 150 }, scale: 0.5, viewTwist: 0, displayLocked: true, on: true, frozenLayers: ['lay-ejes'], layerOverrides: {} });
    tx.addEntity<ViewportEntity>({ ...d, type: 'viewport', center: { x: 380, y: 60 }, width: 60, height: 60, viewCenter: { x: 0, y: 0 }, scale: 1, viewTwist: 0, displayLocked: false, on: true, frozenLayers: [], layerOverrides: {}, clipBoundary: [{ x: 350, y: 30 }, { x: 410, y: 30 }, { x: 380, y: 90 }] });
  });
  doc.transact('group', (tx) => {
    const ids = doc.entitiesOf(MODEL_SPACE_ID).slice(0, 2).map((e) => e.id);
    tx.add('groups', { id: 'grp-1', name: 'Estructura', description: 'Grupo de prueba', members: ids, selectable: true });
  });
  return { doc, ctx };
}

describe('DXF export', () => {
  it('writes a structurally complete R2010 file with unique handles', () => {
    const { doc, ctx } = richDocument();
    const { text, report } = exportDxf(doc, ctx);
    if (process.env.FMODEL_DXF_OUT) writeFileSync(process.env.FMODEL_DXF_OUT, text);
    const parsed = parseDxf(text);
    expect(parsed.version).toBe('AC1024');
    const lines = text.split('\n');
    const handles: string[] = [];
    // el valor de $HANDSEED también usa el código 5: se excluye
    for (let i = 0; i + 1 < lines.length; i += 2) if ((lines[i].trim() === '5' || lines[i].trim() === '105') && lines[i - 1] !== '$HANDSEED') handles.push(lines[i + 1]);
    expect(new Set(handles).size).toBe(handles.length);
    const seedAt = lines.indexOf('$HANDSEED');
    const seed = parseInt(lines[seedAt + 2], 16);
    expect(handles.every((h) => parseInt(h, 16) < seed)).toBe(true);
    for (const t of ['LINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'LWPOLYLINE', 'SPLINE', 'TEXT', 'MTEXT', 'HATCH', 'DIMENSION', 'INSERT', 'ATTRIB', 'VIEWPORT', 'WIPEOUT']) expect(report.exported[t], t).toBeGreaterThan(0);
    expect(report.transformed['Bloque dinámico']?.count).toBeGreaterThan(0);
    expect(lines.length % 2).toBe(1);
  });

  it('round-trips geometry, layers and blocks through the importer', () => {
    const { doc, ctx } = richDocument();
    const { text } = exportDxf(doc, ctx);
    const back = createDocument();
    const rep = importDxfIntoDocument(back, text, { replace: true });
    const byType = (d: typeof doc, owner: string) => {
      const m: Record<string, number> = {};
      for (const e of d.entitiesOf(owner)) m[e.type] = (m[e.type] ?? 0) + 1;
      return m;
    };
    const src = byType(doc, MODEL_SPACE_ID);
    const dst = byType(back, MODEL_SPACE_ID);
    for (const t of ['line', 'circle', 'arc', 'ellipse', 'lwpolyline', 'spline', 'text', 'mtext', 'hatch', 'dimension', 'insert', 'wipeout']) expect(dst[t], `${t}: ${JSON.stringify(dst)}`).toBe(src[t]);
    const ejes = back.findByName('layers', 'Ejes')!;
    expect(ejes.locked).toBe(true);
    expect(ejes.plot).toBe(false);
    expect(ejes.lineweight).toBe(35);
    expect(ejes.color.toLowerCase()).toBe('#d9720a');
    expect(back.findByName('layers', 'Oculta')!.on).toBe(false);
    const circle = back.entitiesOf(MODEL_SPACE_ID).find((e) => e.type === 'circle') as CircleEntity;
    expect(circle.radius).toBeCloseTo(20);
    expect(circle.lineweight).toBe(50);
    const txt = back.entitiesOf(MODEL_SPACE_ID).find((e) => e.type === 'text') as TextEntity;
    expect(txt.text).toBe('Sección A–A Ø50 ±0,1');
    const ins = back.entitiesOf(MODEL_SPACE_ID).filter((e): e is InsertEntity => e.type === 'insert');
    expect(ins.some((i) => i.attributes.some((a) => a.value === 'C7'))).toBe(true);
    const layout = [...back.data.layouts.values()][0];
    expect(back.entitiesOf(layout.id).filter((e) => e.type === 'viewport').length).toBe(2);
    expect(rep.warnings.join(' ')).not.toMatch(/error/i);
  });

  it('decodes pre-2007 files with their code page and newer files as UTF-8', () => {
    const r2000 = '  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1015\n  9\n$DWGCODEPAGE\n  3\nANSI_1252\n  0\nENDSEC\n  0\nEOF\n';
    const latin = Uint8Array.from([...r2000].map((c) => c.charCodeAt(0)).concat([0x53, 0x65, 0x63, 0x63, 0x69, 0xf3, 0x6e]));
    expect(decodeDxfBytes(latin).endsWith('Sección')).toBe(true);
    const utf8 = new TextEncoder().encode(r2000.replace('AC1015', 'AC1024') + 'Sección');
    expect(decodeDxfBytes(utf8).endsWith('Sección')).toBe(true);
  });
});
