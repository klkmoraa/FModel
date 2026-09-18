# Parte 1 — Ida y vuelta DXF de bloques dinámicos: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un bloque dinámico de FModel exportado a DXF vuelva a FModel como bloque dinámico (definición e instancias), sin cambiar lo que ven otros programas.

**Architecture:** Un módulo puro `io/dxf/dynamicData.ts` codifica/decodifica: la definición va en un `XRECORD` bajo el diccionario raíz `FMODEL_DYNAMIC_BLOCKS` (IDs de entidad sustituidos por handles DXF), y cada `INSERT` de un bloque dinámico lleva XDATA `FMODEL` con el nombre del bloque base y su estado. El exportador escribe esos datos; el importador los lee, apunta las instancias al bloque base, omite las variantes `_Vn` que solo usan instancias FModel y remapea handles → IDs nuevos.

**Tech Stack:** TypeScript, vitest, ezdxf (auditoría con `scripts/audit-dxf.py`).

**Spec:** `docs/superpowers/specs/2026-09-17-bloques-biblioteca-dwg-design.md` (Parte 1)

## Global Constraints

- DXF de salida R2010 (`AC1024`) válido para ezdxf: `scripts/audit-dxf.py` sin errores ni correcciones.
- Otros programas deben ver exactamente las variantes estáticas `Nombre_Vn` de hoy.
- Datos propios con versión de esquema 1; versión desconocida o JSON dañado → variantes estáticas + aviso en el informe, nunca interpretación a ciegas.
- Cadenas XDATA/XRECORD en trozos de ≤ 120 caracteres (≤ 255 bytes en UTF-8).
- `pnpm verify` debe pasar. Capas: `io` (3) solo importa de capas ≤ 3.
- Mensajes de informe en español (como los existentes).

Entorno: `P=/Users/crismora/.cache/codex-runtimes/codex-primary-runtime/dependencies; export PATH="$P/node/bin:$P/bin/fallback:$PATH"`; Python con ezdxf: `$P/python/bin/python3`.

---

### Task 1: Módulo `dynamicData.ts` (codificación pura)

**Files:**
- Create: `src/io/dxf/dynamicData.ts`
- Test: `src/io/dxf/dynamicData.test.ts`

**Interfaces:**
- Produces:
  - `FMODEL_APPID = 'FMODEL'`, `FMODEL_DYN_DICT = 'FMODEL_DYNAMIC_BLOCKS'`, `DYN_SCHEMA = 1`
  - `chunkText(s: string, size?: number): string[]`
  - `remapStrings<T>(value: T, map: (s: string) => string | undefined): T`
  - `encodeDefinition(def: DynamicBlockDefinition, idToHandle: (id: string) => string | undefined): string`
  - `decodeDefinition(json: string, handleToId: (h: string) => string | undefined): { def: DynamicBlockDefinition; missing: number }`
  - `xrecordBody(blockName: string, json: string): Pair[]`
  - `readXrecord(rec: DxfRecord): { blockName: string; json: string } | null` (lanza `Error` si la versión es desconocida o el JSON no es válido)
  - `instanceXdata(baseName: string, state: DynamicInstanceState | undefined): Pair[]`
  - `readInstanceXdata(pairs: Pair[]): { baseName: string; state: DynamicInstanceState } | null`

- [ ] **Step 1: Pruebas que fallan** — `src/io/dxf/dynamicData.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DynamicBlockDefinition } from '../../document/types';
import { chunkText, decodeDefinition, encodeDefinition, instanceXdata, readInstanceXdata, readXrecord, remapStrings, xrecordBody } from './dynamicData';

const def = {
  parameters: [{ id: 'p1', type: 'linear', name: 'Ancho' }],
  actions: [{ id: 'a1', type: 'stretch', paramId: 'p1', selection: ['e1', 'e2'] }],
  constraints: [],
  lookups: [{ id: 'l1', rows: [{ label: 'A', inputs: ['600', 'BEEF'] }] }],
  variables: [],
  propertyOrder: ['p1'],
} as unknown as DynamicBlockDefinition;

describe('datos dinámicos FModel en DXF', () => {
  it('trocea texto en partes de 120 caracteres como máximo', () => {
    const parts = chunkText('á'.repeat(250));
    expect(parts.map((p) => p.length)).toEqual([120, 120, 10]);
    expect(chunkText('')).toEqual(['']);
  });

  it('sustituye solo las cadenas del mapa, en cualquier profundidad', () => {
    const out = remapStrings({ a: 'e1', b: ['e2', 'x'], c: { d: 'e1', n: 3 } }, (s) => ({ e1: 'H1', e2: 'H2' })[s]);
    expect(out).toEqual({ a: 'H1', b: ['H2', 'x'], c: { d: 'H1', n: 3 } });
  });

  it('codifica con handles y decodifica con IDs nuevos contando los que faltan', () => {
    const json = encodeDefinition(def, (id) => ({ e1: 'A1', e2: 'A2' })[id]);
    expect(json).toContain('"@H:A1"');
    const { def: back, missing } = decodeDefinition(json, (h) => (h === 'A1' ? 'n1' : undefined));
    expect((back.actions[0] as { selection: string[] }).selection).toEqual(['n1']);
    expect(missing).toBe(1);
    expect(back.parameters[0].id).toBe('p1');
    // valores de tablas con forma de handle no se tocan
    expect((back.lookups[0] as unknown as { rows: { inputs: string[] }[] }).rows[0].inputs).toEqual(['600', 'BEEF']);
  });

  it('XRECORD: ida y vuelta, y rechazo de versión desconocida o JSON dañado', () => {
    const json = JSON.stringify(def).repeat(1);
    const rec = { type: 'XRECORD', pairs: [[5, '1F'], [330, '1E'], [100, 'AcDbXrecord'], ...xrecordBody('Puerta', json)] as [number, string][] };
    expect(readXrecord(rec)).toEqual({ blockName: 'Puerta', json });
    expect(readXrecord({ type: 'XRECORD', pairs: [[100, 'AcDbXrecord'], [280, '1']] })).toBeNull();
    const future = { type: 'XRECORD', pairs: xrecordBody('P', json).map(([c, v]) => [c, c === 90 ? '99' : v]) as [number, string][] };
    expect(() => readXrecord(future)).toThrow(/versión/);
    const broken = { type: 'XRECORD', pairs: xrecordBody('P', '{roto') };
    expect(() => readXrecord(broken)).toThrow(/JSON/);
  });

  it('XDATA de instancia: ida y vuelta e ignora otras aplicaciones', () => {
    const state = { values: { p1: 1800 }, visibilityState: 'Toma doble' };
    const pairs: [number, string][] = [[10, '0'], [1001, 'ACAD'], [1000, 'otra'], ...instanceXdata('Panel', state)];
    expect(readInstanceXdata(pairs)).toEqual({ baseName: 'Panel', state });
    expect(readInstanceXdata([[1001, 'ACAD'], [1000, 'x']])).toBeNull();
    expect(readInstanceXdata(instanceXdata('Panel', undefined))).toEqual({ baseName: 'Panel', state: { values: {} } });
  });
});
```

- [ ] **Step 2:** `pnpm vitest run src/io/dxf/dynamicData.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementación** — `src/io/dxf/dynamicData.ts`:

```ts
import type { DynamicBlockDefinition, DynamicInstanceState } from '../../document/types';
import type { DxfRecord, Pair } from './parser';

/**
 * Datos propios de FModel dentro de un DXF para conservar los bloques dinámicos en la ida y
 * vuelta. Otros programas los ignoran (XDATA con APPID registrado y XRECORD en un diccionario
 * propio) y siguen viendo las variantes estáticas.
 */
export const FMODEL_APPID = 'FMODEL';
export const FMODEL_DYN_DICT = 'FMODEL_DYNAMIC_BLOCKS';
export const DYN_SCHEMA = 1;
const DEF_MARK = 'FMODEL_DYNAMIC';
const INST_MARK = 'DYNINSTANCE';
const HANDLE_PREFIX = '@H:';

/** Trozos de como máximo `size` caracteres (120 × 2 bytes UTF-8 < 255 bytes por cadena DXF). */
export function chunkText(s: string, size = 120): string[] {
  if (!s) return [''];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

/** Copia profunda sustituyendo las cadenas que el mapa conoce (IDs ↔ handles). */
export function remapStrings<T>(value: T, map: (s: string) => string | undefined): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return map(v) ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

export function encodeDefinition(def: DynamicBlockDefinition, idToHandle: (id: string) => string | undefined): string {
  const { validation: _v, ...rest } = def;
  return JSON.stringify(remapStrings(rest, (id) => {
    const h = idToHandle(id);
    return h ? `${HANDLE_PREFIX}${h}` : undefined;
  }));
}

/**
 * Sustituye cada `@H:<handle>` por el ID nuevo. Las referencias sin objeto equivalente se
 * quitan de las listas (selecciones, estados de visibilidad) o quedan vacías, y se cuentan.
 */
export function decodeDefinition(json: string, handleToId: (h: string) => string | undefined): { def: DynamicBlockDefinition; missing: number } {
  let missing = 0;
  const resolve = (s: string) => (s.startsWith(HANDLE_PREFIX) ? (handleToId(s.slice(HANDLE_PREFIX.length)) ?? null) : s);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = resolve(v);
      if (r === null) missing++;
      return r ?? '';
    }
    if (Array.isArray(v)) {
      return v
        .filter((x) => !(typeof x === 'string' && resolve(x) === null && ++missing))
        .map(walk);
    }
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { def: walk(JSON.parse(json)) as DynamicBlockDefinition, missing };
}

export function xrecordBody(blockName: string, json: string): Pair[] {
  return [[280, '1'], [1, DEF_MARK], [90, String(DYN_SCHEMA)], [2, blockName], ...chunkText(json).map((c): Pair => [3, c])];
}

export function readXrecord(rec: DxfRecord): { blockName: string; json: string } | null {
  if (rec.type !== 'XRECORD' || !rec.pairs.some(([c, v]) => c === 1 && v.trim() === DEF_MARK)) return null;
  const version = Number(rec.pairs.find(([c]) => c === 90)?.[1]);
  if (version !== DYN_SCHEMA) throw new Error(`versión de datos dinámicos desconocida (${version})`);
  const blockName = rec.pairs.find(([c]) => c === 2)?.[1].trim() ?? '';
  const json = rec.pairs.filter(([c]) => c === 3).map(([, v]) => v).join('');
  try {
    JSON.parse(json);
  } catch {
    throw new Error('JSON de definición dinámica dañado');
  }
  return { blockName, json };
}

export function instanceXdata(baseName: string, state: DynamicInstanceState | undefined): Pair[] {
  return [[1001, FMODEL_APPID], [1000, INST_MARK], [1070, String(DYN_SCHEMA)], [1000, baseName], ...chunkText(JSON.stringify(state ?? { values: {} })).map((c): Pair => [1000, c])];
}

export function readInstanceXdata(pairs: Pair[]): { baseName: string; state: DynamicInstanceState } | null {
  const start = pairs.findIndex(([c, v]) => c === 1001 && v.trim() === FMODEL_APPID);
  if (start < 0) return null;
  const own: Pair[] = [];
  for (let i = start + 1; i < pairs.length && pairs[i][0] !== 1001; i++) own.push(pairs[i]);
  if (own[0]?.[1].trim() !== INST_MARK || Number(own.find(([c]) => c === 1070)?.[1]) !== DYN_SCHEMA) return null;
  const strings = own.filter(([c]) => c === 1000).slice(1);
  const baseName = strings[0]?.[1].trim();
  if (!baseName) return null;
  try {
    return { baseName, state: JSON.parse(strings.slice(1).map(([, v]) => v).join('')) as DynamicInstanceState };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4:** `pnpm vitest run src/io/dxf/dynamicData.test.ts` → PASS.
- [ ] **Step 5:** Commit `Codificación de bloques dinámicos de FModel para DXF`.

---

### Task 2: Exportador escribe definición e instancias

**Files:**
- Modify: `src/io/dxf/exportDxf.ts` (APPID ~l.1061, `writeInsert` ~l.645, bucle de bloques ~l.824, OBJECTS ~l.1216)
- Test: `src/io/dxf/dynamicRoundTrip.test.ts` (nuevo; en esta tarea solo la parte de exportación)

**Interfaces:**
- Consumes: `FMODEL_APPID`, `FMODEL_DYN_DICT`, `encodeDefinition`, `xrecordBody`, `instanceXdata` (Task 1).

- [ ] **Step 1: Prueba que falla** — `src/io/dxf/dynamicRoundTrip.test.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { insertBlock } from '../../blocks/blockOps';
import { installDynamicBlocks } from '../../blocks/install';
import { installDynamicSamples } from '../../blocks/samples';
import { createDocument } from '../../document/defaults';
import type { InsertEntity, VisibilityParam } from '../../document/types';
import { MODEL_SPACE_ID } from '../../document/types';
import { createContext } from '../../model/context';
import { exportDxf } from './exportDxf';
import { parseDxf } from './parser';

export function dynamicDoc() {
  const doc = createDocument({ title: 'Dinámicos' });
  const ctx = createContext(doc);
  installDynamicBlocks(ctx);
  installDynamicSamples(doc);
  const panel = doc.findByName('blocks', 'FM Panel ajustable')!;
  const symbol = doc.findByName('blocks', 'FM Símbolo eléctrico')!;
  const w = panel.dynamic!.parameters.find((p) => p.name === 'Ancho')!;
  const vis = symbol.dynamic!.parameters.find((p): p is VisibilityParam => p.type === 'visibility')!;
  doc.transact('inserts', (tx) => {
    const a = insertBlock(tx, doc, panel.id, MODEL_SPACE_ID, { x: 0, y: 0 });
    tx.updateEntity<InsertEntity>(a.id, { dynamic: { values: { [w.id]: 1800 } } });
    const b = insertBlock(tx, doc, symbol.id, MODEL_SPACE_ID, { x: 3000, y: 0 });
    tx.updateEntity<InsertEntity>(b.id, { dynamic: { values: { [vis.id]: 'Interruptor' } } });
    insertBlock(tx, doc, symbol.id, MODEL_SPACE_ID, { x: 4000, y: 0 });
  });
  return { doc, ctx, panel, symbol, w, vis };
}

describe('exportación de bloques dinámicos con datos FModel', () => {
  it('escribe el XRECORD de cada definición y la XDATA de cada instancia', () => {
    const { doc, ctx } = dynamicDoc();
    const { text } = exportDxf(doc, ctx);
    if (process.env.FMODEL_DXF_OUT) writeFileSync(process.env.FMODEL_DXF_OUT.replace(/\.dxf$/, '-dyn.dxf'), text);
    const dxf = parseDxf(text);
    const appids = dxf.tables.get('APPID')!.records.map((r) => r.pairs.find(([c]) => c === 2)?.[1]);
    expect(appids).toContain('FMODEL');
    const xrecs = dxf.objects.filter((o) => o.type === 'XRECORD' && o.pairs.some(([c, v]) => c === 1 && v === 'FMODEL_DYNAMIC'));
    expect(xrecs.length).toBe([...doc.data.blocks.values()].filter((b) => b.dynamic).length);
    const inserts = dxf.entities.filter((e) => e.type === 'INSERT');
    expect(inserts.every((i) => i.pairs.some(([c, v]) => c === 1001 && v === 'FMODEL'))).toBe(true);
    // otros programas siguen viendo variantes estáticas
    expect(inserts.map((i) => i.pairs.find(([c]) => c === 2)?.[1])).toEqual(expect.arrayContaining([expect.stringMatching(/_V\d+$/)]));
  });
});
```

- [ ] **Step 2:** `pnpm vitest run src/io/dxf/dynamicRoundTrip.test.ts` → FAIL (sin APPID FMODEL).

- [ ] **Step 3: Implementación en `exportDxf.ts`**
  1. Import: `import { encodeDefinition, FMODEL_APPID, FMODEL_DYN_DICT, instanceXdata, xrecordBody } from './dynamicData';`
  2. En `writeInsert`, justo antes de `ok('INSERT');`:
     ```ts
     if (def.dynamic) {
       const xd = instanceXdata(userBlockNames.get(def.id)!, e.dynamic);
       if (xd.reduce((n, [, v]) => n + v.length, 0) > 12000) report.warnings.push(`Instancia de «${def.name}» con estado demasiado grande: se exporta solo como variante estática.`);
       else for (const [c, v] of xd) b.tag(c, c === 1070 ? Number(v) : v);
     }
     ```
  3. Mensaje de `transformed('Bloque dinámico', …)`: `'Cada estado usado se exporta como bloque estático para otros programas; FModel conserva parámetros, acciones y estados al reimportar.'`
  4. Tras el bucle `for (const def of data.blocks.values())` que escribe las entidades de los bloques:
     ```ts
     const dynRecords = [...data.blocks.values()]
       .filter((d) => d.dynamic)
       .map((d) => ({ name: userBlockNames.get(d.id)!, handle: H.next(), json: encodeDefinition(d.dynamic!, (id) => entityHandles.get(id)) }));
     const fmDict = dynRecords.length ? H.next() : '';
     ```
  5. `const appids = ['ACAD', 'AcCmTransparency', 'AcAecLayerStandard', FMODEL_APPID];`
  6. En OBJECTS, tras `if (wipeouts) rootEntries.push(...)`: `if (fmDict) rootEntries.push([FMODEL_DYN_DICT, fmDict]);` y, tras `dict(OBJ.plotSettings, OBJ.root, []);`:
     ```ts
     if (fmDict) {
       dict(fmDict, OBJ.root, dynRecords.map((r) => [r.name, r.handle]));
       for (const r of dynRecords) {
         t(0, 'XRECORD');
         t(5, r.handle);
         t(330, fmDict);
         t(100, 'AcDbXrecord');
         for (const [c, v] of xrecordBody(r.name, r.json)) t(c, c === 280 || c === 90 ? Number(v) : v);
       }
     }
     ```
     Verificar que `t` acepta número (es `out.tag`).
- [ ] **Step 4:** prueba → PASS; `pnpm vitest run src/io/dxf` → todo PASS.
- [ ] **Step 5:** Auditoría: `FMODEL_DXF_OUT=$TMPDIR/fm.dxf pnpm vitest run src/io/dxf/dynamicRoundTrip.test.ts && $P/python/bin/python3 scripts/audit-dxf.py $TMPDIR/fm-dyn.dxf` → «sin errores ni correcciones».
- [ ] **Step 6:** Commit `El DXF exportado guarda la definición y el estado de los bloques dinámicos`.

---

### Task 3: Importador reconstruye los bloques dinámicos

**Files:**
- Modify: `src/io/dxf/importDxf.ts` (antes de «bloques» ~l.220, `convertList`/`add` ~l.262-280, caso `INSERT` ~l.411, final de la transacción ~l.575)
- Test: `src/io/dxf/dynamicRoundTrip.test.ts`

**Interfaces:**
- Consumes: `readXrecord`, `readInstanceXdata`, `decodeDefinition`, `FMODEL_DYN_DICT` (Task 1); `dynamicDoc()` (Task 2).

- [ ] **Step 1: Pruebas que fallan** (añadir al archivo):

```ts
import { importDxfIntoDocument } from './importDxf';

function roundTrip() {
  const src = dynamicDoc();
  const { text } = exportDxf(src.doc, src.ctx);
  const doc = createDocument();
  const ctx = createContext(doc);
  installDynamicBlocks(ctx);
  const report = importDxfIntoDocument(doc, text);
  return { src, doc, ctx, report, text };
}

describe('ida y vuelta DXF de bloques dinámicos', () => {
  it('reconstruye definiciones con entidades propias y sin variantes', () => {
    const { src, doc } = roundTrip();
    const panel = doc.findByName('blocks', 'FM Panel ajustable')!;
    expect(panel.dynamic?.parameters.length).toBe(src.panel.dynamic!.parameters.length);
    expect(panel.dynamic?.actions.length).toBe(src.panel.dynamic!.actions.length);
    const own = new Set(doc.entitiesOf(panel.id).map((e) => e.id));
    for (const a of panel.dynamic!.actions) for (const id of (a as { selection?: string[] }).selection ?? []) expect(own.has(id)).toBe(true);
    expect([...doc.data.blocks.values()].some((b) => /_V\d+$/.test(b.name))).toBe(false);
  });

  it('las instancias apuntan al bloque base con su estado y se evalúan igual', () => {
    const { src, doc, ctx } = roundTrip();
    const inserts = doc.entitiesOf(MODEL_SPACE_ID).filter((e): e is InsertEntity => e.type === 'insert');
    const panel = doc.findByName('blocks', 'FM Panel ajustable')!;
    const pi = inserts.find((i) => i.blockId === panel.id)!;
    expect(pi.dynamic?.values[src.w.id]).toBe(1800);
    const srcInsert = src.doc.entitiesOf(MODEL_SPACE_ID).find((e): e is InsertEntity => e.type === 'insert' && e.blockId === src.panel.id)!;
    expect(ctx.evaluateBlock(panel.id, pi.dynamic).length).toBe(src.ctx.evaluateBlock(src.panel.id, srcInsert.dynamic).length);
    const symbol = doc.findByName('blocks', 'FM Símbolo eléctrico')!;
    expect(inserts.filter((i) => i.blockId === symbol.id).map((i) => i.dynamic?.values[src.vis.id])).toEqual(['Interruptor', undefined]);
  });

  it('con datos dañados conserva las variantes estáticas y avisa', () => {
    const { text } = roundTrip();
    const broken = text.replace(/\n 90\n1\n  2\nFM Panel ajustable\n/, '\n 90\n7\n  2\nFM Panel ajustable\n');
    expect(broken).not.toBe(text);
    const doc = createDocument();
    const report = importDxfIntoDocument(doc, broken);
    expect(report.warnings.some((w) => /versión de datos dinámicos/.test(w))).toBe(true);
    expect([...doc.data.blocks.values()].some((b) => /^FM Panel ajustable_V\d+$/.test(b.name))).toBe(true);
    expect(doc.findByName('blocks', 'FM Panel ajustable')?.dynamic).toBeUndefined();
  });
});
```

Nota: la prueba de datos dañados depende del formato exacto de `TagBuffer` (código con ancho 3). Si el patrón no coincide, construir `broken` localizando el XRECORD en `parseDxf(text)` y reescribiendo la línea del grupo 90 que sigue al marcador; lo esencial es cambiar la versión a 7 solo en el registro del panel.

- [ ] **Step 2:** `pnpm vitest run src/io/dxf/dynamicRoundTrip.test.ts` → las tres nuevas FAIL.

- [ ] **Step 3: Implementación en `importDxf.ts`**
  1. Import: `import { decodeDefinition, readInstanceXdata, readXrecord } from './dynamicData';`
  2. Justo antes de `// ---- bloques`:
     ```ts
     // datos dinámicos propios de FModel (ida y vuelta)
     const fmDynamic = new Map<string, string>();
     for (const o of dxf.objects) {
       try {
         const x = readXrecord(o);
         if (x) fmDynamic.set(x.blockName.toUpperCase(), x.json);
       } catch (err) {
         report.warnings.push(`Bloque dinámico de FModel no recuperado: ${err instanceof Error ? err.message : String(err)}; se conservan las variantes estáticas.`);
       }
     }
     // variantes estáticas que solo usan instancias FModel recuperables: no se importan
     const variantRefs = new Map<string, boolean>();
     for (const rec of [...dxf.entities, ...dxf.blocks.flatMap((b) => b.entities)]) {
       if (rec.type !== 'INSERT') continue;
       const name = new R(rec).str(2).toUpperCase();
       const x = readInstanceXdata(rec.pairs);
       const recoverable = !!x && fmDynamic.has(x.baseName.toUpperCase()) && x.baseName.toUpperCase() !== name;
       variantRefs.set(name, (variantRefs.get(name) ?? true) && recoverable);
     }
     const skipVariant = (upper: string) => variantRefs.get(upper) === true;
     ```
  3. En el bucle de bloques, tras el `continue` de `*D`: `if (skipVariant(upper)) continue;`
  4. Mapa de handles: sustituir `const add = …` por
     ```ts
     const handleToId = new Map<string, Id>();
     let currentHandle = '';
     const add = (e: Omit<Entity, 'id' | 'order'>) => {
       const created = tx.addEntity(e as never) as Entity;
       if (currentHandle && !handleToId.has(currentHandle)) handleToId.set(currentHandle, created.id);
       return created;
     };
     ```
     y en `convertList`, antes de `convert(...)`: `currentHandle = r.str(5).toUpperCase();`. (`add` debe declararse antes de `convertList` si hoy no lo está; moverlo si hace falta.)
  5. Caso `INSERT`: tras resolver `blockId`, antes de `add(...)`:
     ```ts
     const fm = readInstanceXdata(rec.pairs);
     const baseId = fm && fmDynamic.has(fm.baseName.toUpperCase()) ? blockIdByName.get(fm.baseName.toUpperCase()) : undefined;
     ```
     y usar `blockId: baseId ?? blockId` (la comprobación `if (!blockId)` pasa a `if (!blockId && !baseId)`), añadiendo `dynamic: baseId ? fm!.state : undefined` al objeto; si `baseId`, `ok('INSERT dinámico')`.
  6. Al final de la transacción (tras `convertList(dxf.entities, …)`):
     ```ts
     const created = new Set(pendingBlocks.map((p) => p.id));
     for (const [upper, json] of fmDynamic) {
       const id = blockIdByName.get(upper);
       if (!id || !created.has(id)) continue;
       const { def, missing } = decodeDefinition(json, (h) => handleToId.get(h.toUpperCase()));
       tx.update('blocks', id, { dynamic: def });
       ok('Bloque dinámico');
       if (missing) report.warnings.push(`${doc.data.blocks.get(id)?.name}: ${missing} referencia(s) de la definición dinámica sin objeto equivalente.`);
     }
     ```
- [ ] **Step 4:** `pnpm vitest run src/io/dxf` → PASS.
- [ ] **Step 5:** Commit `Los bloques dinámicos vuelven a FModel al importar su DXF`.

---

### Task 4: Documentación y verificación completa

**Files:**
- Modify: `docs/dxf-compatibilidad.md` (fila «Bloque dinámico» en «Se transforma» de exportación; nueva fila en «Se conserva» de importación)
- Modify: `src/app/features.ts` (nota de la función «Importación y exportación DXF…»), regenerar `docs/FEATURES.md` con `pnpm docs:features`

- [ ] **Step 1:** En `docs/dxf-compatibilidad.md`, sustituir la fila por:
  `| Bloque dinámico (cada estado usado) | bloque estático \`Nombre_Vn\` para otros programas, más datos propios FModel (XRECORD \`FMODEL_DYNAMIC_BLOCKS\` y XDATA \`FMODEL\`) | al reimportar en FModel vuelven parámetros, acciones, restricciones y estados |`
  y añadir en la importación, tras la lista «Se conserva»: «Bloques dinámicos exportados por FModel: se reconstruyen la definición y el estado de cada instancia; las variantes `Nombre_Vn` usadas solo por esas instancias no se importan. Si los datos propios están dañados o son de una versión posterior, se importan las variantes estáticas y se avisa.»
- [ ] **Step 2:** Nota en `src/app/features.ts` para la fila DXF: `'Detalle en docs/dxf-compatibilidad.md. Los bloques dinámicos de FModel sobreviven a la ida y vuelta.'`; `pnpm docs:features`.
- [ ] **Step 3:** `pnpm verify` → PASS; auditoría ezdxf del DXF de prueba → sin problemas.
- [ ] **Step 4:** Commit `Documenta la ida y vuelta DXF de bloques dinámicos`.
