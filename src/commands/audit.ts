import { getServices, requestUi } from '../app/services';
import { compareDrawings } from '../audit/compare';
import { applyHealthFixes } from '../audit/health';
import type { DocumentData } from '../document/types';
import { readXrefSource } from '../xref/xref';
import { taskManager } from '../app/tasks';
import { runHeavy } from '../workers/client';
import { openFile } from '../storage/fileAccess';
import { K, L } from './helpers';
import type { CommandDef } from './types';
import { CommandError } from './types';

const AUDIT: CommandDef = {
  name: 'AUDIT',
  aliases: ['AUDITAR', 'REVISAR'],
  category: 'manage',
  icon: 'audit',
  label: L('Auditar dibujo', 'Audit drawing'),
  description: L('Busca errores de integridad (referencias rotas, geometría no válida, duplicados, polilíneas casi cerradas…) y corrige los que son seguros.', 'Finds integrity errors (broken references, invalid geometry, duplicates, nearly closed polylines…) and fixes the safe ones.'),
  async run(api, args) {
    const editor = api.editor;
    const kws = [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])];
    const given = args?.[0] ? editor.runner.matchKeyword(args[0], kws) : null;
    const k = given ? { kind: 'keyword' as const, key: given } : await api.getKeyword({ prompt: L('¿Corregir los errores detectados?', 'Fix any errors detected?'), keywords: kws, defaultValue: 'Yes' });
    if (k.kind !== 'keyword') return;
    api.info(L('Analizando el dibujo en segundo plano…', 'Analyzing the drawing in the background…'));
    const before = await taskManager.runTask(
      'audit-analyze',
      { es: 'Analizando salud del dibujo', en: 'Analyzing drawing health' },
      async (ctx) => runHeavy('analyze', { data: editor.doc.data }, { signal: ctx.signal }),
      { signal: api.signal },
    );
    const fixable = before.issues.filter((i) => i.fixable).length;
    if (k.key === 'Yes' && fixable) {
      const fixes = api.apply('AUDIT', (tx) => applyHealthFixes(tx, editor.doc, before));
      const after = await taskManager.runTask(
        'audit-post-fixes',
        { es: 'Comprobando correcciones de salud', en: 'Verifying health fixes' },
        async (ctx) => runHeavy('analyze', { data: editor.doc.data }, { signal: ctx.signal }),
        { signal: api.signal },
      );
      api.info(L(`AUDIT: ${before.issues.length} problema(s), ${fixes} corrección(es). Puntuación ${before.score} → ${after.score}.`, `AUDIT: ${before.issues.length} issue(s), ${fixes} fix(es). Score ${before.score} → ${after.score}.`));
      requestUi('health-report', { report: after, fixed: fixes });
      return;
    }
    api.info(L(`AUDIT: ${before.issues.length} problema(s), ${fixable} corregible(s). Puntuación ${before.score}/100.`, `AUDIT: ${before.issues.length} issue(s), ${fixable} fixable. Score ${before.score}/100.`));
    requestUi('health-report', { report: before, fixed: 0 });
  },
};

const HEALTHREPORT: CommandDef = {
  name: 'HEALTHREPORT',
  aliases: ['SALUD', 'INFORMESALUD', 'DRAWINGHEALTH'],
  category: 'manage',
  readOnly: true,
  icon: 'audit',
  label: L('Informe de salud del dibujo', 'Drawing health report'),
  description: L('Puntuación y lista de problemas por categoría (geometría, duplicados, referencias, bloques, estándares y elementos sin uso) con acceso a cada objeto.', 'Score and issue list by category (geometry, duplicates, references, blocks, standards and unused items) with access to each object.'),
  async run(api) {
    const report = await taskManager.runTask(
      'health-report',
      { es: 'Calculando informe de salud', en: 'Calculating health report' },
      async (ctx) => runHeavy('analyze', { data: api.editor.doc.data }, { signal: ctx.signal }),
      { signal: api.signal },
    );
    requestUi('health-report', { report, fixed: 0 });
  },
};

const COMPARE: CommandDef = {
  name: 'COMPARE',
  aliases: ['COMPARAR', 'DWGCOMPARE'],
  category: 'manage',
  readOnly: true,
  icon: 'compare',
  label: L('Comparar revisiones', 'Compare revisions'),
  description: L('Compara el dibujo con una versión guardada o con otro archivo del mismo dibujo: añadidos, eliminados y modificados resaltados en el lienzo.', 'Compares the drawing with a saved version or another file of the same drawing: added, removed and modified objects highlighted on the canvas.'),
  async run(api) {
    const editor = api.editor;
    const persistence = getServices().persistence;
    const versions = await persistence.versions(editor.doc.id).catch(() => []);
    const from = await api.getKeyword({
      prompt: L('Comparar con', 'Compare with'),
      keywords: [...(versions.length ? [K('Version', 'Versión guardada', 'Saved version', ['v'])] : []), K('File', 'Archivo', 'File', ['a', 'f'])],
      defaultValue: versions.length ? 'Version' : 'File',
    });
    if (from.kind !== 'keyword') return;
    let base: DocumentData;
    let label: string;
    if (from.key === 'Version') {
      const pick = await api.getKeyword({
        prompt: L('Versión', 'Version'),
        keywords: versions.slice(0, 30).map((v, i) => K(v.id, `${i + 1}. ${v.label || (v.auto ? 'auto' : 'manual')} · ${new Date(v.savedAt).toLocaleString()}`, `${i + 1}. ${v.label || (v.auto ? 'auto' : 'manual')} · ${new Date(v.savedAt).toLocaleString()}`, [String(i + 1)])),
        defaultValue: versions[0].id,
      });
      if (pick.kind !== 'keyword') return;
      const v = versions.find((x) => x.id === pick.key)!;
      base = persistence.loadVersion(v).data;
      label = v.label || new Date(v.savedAt).toLocaleString();
    } else {
      const f = await openFile({ 'application/x-fmodel': ['.fmodel'], 'application/json': ['.json'], 'application/dxf': ['.dxf'] }, 'FModel / DXF');
      if (!f) return;
      if (api.signal.aborted) return;
      try {
        base = readXrefSource(f.bytes, f.name).data;
      } catch (err) {
        throw new CommandError(L(`No se pudo leer «${f.name}»: ${String(err)}`, `Could not read "${f.name}": ${String(err)}`));
      }
      label = f.name;
    }
    if (api.signal.aborted) return;
    const diff = compareDrawings(base, editor.doc.data);
    editor.compare = { diff, label };
    editor.emit('overlay');
    const changed = Object.keys(diff.records).length;
    api.info(
      L(
        `Comparado con «${label}»: ${diff.added.length} añadido(s), ${diff.removed.length} eliminado(s), ${diff.modified.length} modificado(s)${changed ? `; cambios en ${changed} tabla(s)` : ''}. COMPAREEND para terminar.`,
        `Compared with "${label}": ${diff.added.length} added, ${diff.removed.length} removed, ${diff.modified.length} modified${changed ? `; changes in ${changed} table(s)` : ''}. COMPAREEND to finish.`,
      ),
    );
    requestUi('compare');
  },
};

const COMPAREEND: CommandDef = {
  name: 'COMPAREEND',
  aliases: ['TERMINARCOMPARACION'],
  category: 'manage',
  readOnly: true,
  label: L('Terminar comparación', 'End comparison'),
  description: L('Quita los resaltados de la comparación de revisiones.', 'Removes the revision comparison highlights.'),
  run(api) {
    api.editor.compare = null;
    api.editor.emit('overlay');
  },
};

export const AUDIT_COMMANDS: CommandDef[] = [AUDIT, HEALTHREPORT, COMPARE, COMPAREEND];
