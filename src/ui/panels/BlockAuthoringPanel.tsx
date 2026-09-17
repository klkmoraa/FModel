import { AlertTriangle, CircleX, Eye, FlaskConical, Plus, RotateCcw, Save, Star, Table2, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ACTION_COMPAT, ACTION_TYPE_LABEL, DIM_CONSTRAINT_LABEL, emptyDynamic, formulaNames, GEO_CONSTRAINT_LABEL, isValidFormulaName, PARAM_TYPE_LABEL, paramsWithoutAction, removeParameter } from '../../blocks/authoring';
import { evaluateDynamic, resetDynamic, validateDynamicBlock } from '../../blocks/dynamic';
import { requestUi } from '../../app/services';
import type { Lang } from '../../commands/types';
import type { BlockRecord, DynAction, DynamicBlockDefinition, DynParam, Id, InsertEntity, ValueSet, VisibilityParam } from '../../document/types';
import type { Editor } from '../../editor/editor';
import { blockThumbnail } from '../../render/thumbnail';
import { NumberField, TextField, Toggle, tr } from '../controls';
import { useEditorEvents, useMediaQuery } from '../hooks';

type Mutate = (label: string, fn: (d: DynamicBlockDefinition) => DynamicBlockDefinition) => void;

const DEG = 180 / Math.PI;

/**
 * Panel de autoría del Editor de bloques: parámetros, acciones, estados de visibilidad,
 * tablas de consulta, restricciones y variables, con validación y vista previa en vivo.
 * Todas las ediciones son transacciones dentro del grupo de la sesión (BCLOSE → Descartar las revierte).
 */
export function BlockAuthoringPanel({ editor }: { editor: Editor }) {
  useEditorEvents(editor, ['doc', 'space', 'selection']);
  const lang = editor.lang;
  const doc = editor.doc;
  const session = editor.blockEdit;
  const block = session ? doc.data.blocks.get(session.blockId) : undefined;
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = editor.prefs.theme === 'noche' || (editor.prefs.theme === 'system' && systemDark);

  if (!session || !block) {
    return (
      <div className="panel">
        <div className="empty">
          {tr(lang, 'Abre una definición con el Editor de bloques para añadir parámetros, acciones, estados de visibilidad y restricciones.', 'Open a definition in the Block Editor to add parameters, actions, visibility states and constraints.')}
        </div>
        <button className="btn btn--primary" onClick={() => editor.command('BEDIT')}>
          {tr(lang, 'Editar bloque…', 'Edit block…')}
        </button>
      </div>
    );
  }
  return <Authoring editor={editor} block={block} dark={dark} lang={lang} />;
}

function Authoring({ editor, block, dark, lang }: { editor: Editor; block: BlockRecord; dark: boolean; lang: Lang }) {
  const doc = editor.doc;
  const session = editor.blockEdit!;
  const def = block.dynamic ?? emptyDynamic();
  const testing = !!session.testing;

  const mutate: Mutate = (label, fn) => {
    const cur = doc.data.blocks.get(block.id);
    if (!cur) return;
    doc.transact(label, (tx) => tx.update('blocks', block.id, { dynamic: fn(structuredClone(cur.dynamic ?? emptyDynamic())) }));
  };
  const fail = (es: string, en: string) => editor.runner.message('error', { es, en });

  const report = useMemo(() => validateDynamicBlock(editor.ctx, block), [doc.version, block]); // eslint-disable-line react-hooks/exhaustive-deps
  const evaluation = useMemo(() => {
    if (!block.dynamic) return { warnings: [] as string[], conflicts: [] as Id[] };
    try {
      const ev = evaluateDynamic(editor.ctx, block, doc.entitiesOf(block.id), undefined);
      return { warnings: ev.warnings, conflicts: ev.conflicts };
    } catch (err) {
      return { warnings: [err instanceof Error ? err.message : String(err)], conflicts: [] as Id[] };
    }
  }, [doc.version, block]); // eslint-disable-line react-hooks/exhaustive-deps
  const noAction = new Set(paramsWithoutAction(def).map((p) => p.id));
  const blockSel = editor.selection.list.filter((id) => doc.entity(id)?.owner === block.id);
  const thumb = blockThumbnail(editor, block.id, 112, dark);
  const warnings = [...new Set([...report.warnings, ...evaluation.warnings])];

  return (
    <div className="panel authoring">
      <div className="panel__head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">{tr(lang, 'Editor de bloques', 'Block editor')}</div>
          <div className="panel__title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={block.name}>
            {block.name}
          </div>
        </div>
        <span className={`status-pill ${testing ? 'status-pill--experimental' : 'status-pill--disponible'}`}>{testing ? tr(lang, 'Prueba', 'Testing') : `Rev. ${block.revision}`}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 10, alignItems: 'start' }}>
        <div className="authoring__preview" aria-label={tr(lang, 'Vista previa con valores por defecto', 'Preview with default values')}>
          {thumb ? <img src={thumb} width={104} height={104} alt="" /> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className={`btn btn--sm${testing ? ' btn--accent' : ''}`} onClick={() => editor.command('BTESTBLOCK')}>
            <FlaskConical size={13} /> {testing ? tr(lang, 'Cerrar prueba', 'Close test') : tr(lang, 'Probar bloque', 'Test block')}
          </button>
          {testing && (
            <button
              className="btn btn--sm"
              onClick={() => {
                const ins = session.testing ? (doc.entity(session.testing.insertId) as InsertEntity | undefined) : undefined;
                if (ins) doc.transact('RESETBLOCK', (tx) => tx.put('entities', resetDynamic(ins)));
              }}
            >
              <RotateCcw size={13} /> {tr(lang, 'Restaurar por defecto', 'Restore defaults')}
            </button>
          )}
          <button className="btn btn--sm" onClick={() => editor.command('BSAVE')} disabled={testing}>
            <Save size={13} /> {tr(lang, 'Guardar', 'Save')}
          </button>
          <button className="btn btn--sm btn--primary" onClick={() => editor.command('BCLOSE', ['Save'])}>
            {tr(lang, 'Guardar y cerrar', 'Save and close')}
          </button>
          <button className="btn btn--sm btn--danger" onClick={() => window.confirm(tr(lang, '¿Descartar todos los cambios hechos en esta sesión?', 'Discard all changes made in this session?')) && editor.command('BCLOSE', ['Discard'])}>
            {tr(lang, 'Descartar y cerrar', 'Discard and close')}
          </button>
        </div>
      </div>

      {(report.errors.length > 0 || warnings.length > 0 || evaluation.conflicts.length > 0) && (
        <div className="authoring__issues" role="status">
          {report.errors.map((m) => (
            <div key={`e${m}`} className="authoring__issue is-error">
              <CircleX size={13} /> <span>{m}</span>
            </div>
          ))}
          {warnings.map((m) => (
            <div key={`w${m}`} className="authoring__issue is-warn">
              <AlertTriangle size={13} /> <span>{m.replace(/^⚠\s*/, '')}</span>
            </div>
          ))}
          {evaluation.conflicts.length > 0 && (
            <div className="authoring__issue is-warn">
              <AlertTriangle size={13} /> <span>{tr(lang, `${evaluation.conflicts.length} restricción(es) en conflicto o sin resolver.`, `${evaluation.conflicts.length} conflicting or unsolved constraint(s).`)}</span>
            </div>
          )}
          {report.errors.some((m) => m.includes('inexistente')) && (
            <button className="btn btn--sm" onClick={() => editor.command('BVALIDATEREPAIR')}>
              {tr(lang, 'Reparar referencias rotas', 'Repair broken references')}
            </button>
          )}
        </div>
      )}

      <div className="authoring__tools" role="toolbar" aria-label={tr(lang, 'Añadir', 'Add')}>
        {[
          ['BPARAMETER', tr(lang, 'Parámetro', 'Parameter')],
          ['BACTION', tr(lang, 'Acción', 'Action')],
          ['BCONSTRAINT', tr(lang, 'Restricción', 'Constraint')],
          ['BCPARAMETER', tr(lang, 'Cota', 'Dimensional')],
          ['BVARIABLE', tr(lang, 'Variable', 'Variable')],
        ].map(([cmd, label]) => (
          <button key={cmd} className="btn btn--sm" disabled={testing} onClick={() => editor.command(cmd)}>
            <Plus size={12} /> {label}
          </button>
        ))}
      </div>

      <Section title={tr(lang, 'Parámetros', 'Parameters')} count={def.parameters.length} open>
        {def.parameters.map((p) => (
          <ParamItem key={p.id} p={p} def={def} lang={lang} mutate={mutate} fail={fail} noAction={noAction.has(p.id)} editor={editor} />
        ))}
        {!def.parameters.length && <div className="empty">{tr(lang, 'Sin parámetros. Añade uno con «Parámetro».', 'No parameters. Add one with “Parameter”.')}</div>}
      </Section>

      <Section title={tr(lang, 'Acciones', 'Actions')} count={def.actions.length} open={def.actions.length > 0}>
        {def.actions.map((a) => (
          <ActionItem key={a.id} a={a} def={def} lang={lang} mutate={mutate} editor={editor} block={block} blockSel={blockSel} />
        ))}
        {!def.actions.length && <div className="empty">{tr(lang, 'Sin acciones. Las acciones deciden qué geometría mueve cada parámetro.', 'No actions. Actions decide which geometry each parameter drives.')}</div>}
      </Section>

      <VisibilitySection def={def} lang={lang} mutate={mutate} editor={editor} block={block} blockSel={blockSel} />

      {def.lookups.length > 0 && (
        <Section title={tr(lang, 'Tablas de consulta', 'Lookup tables')} count={def.lookups.length}>
          {def.lookups.map((t) => (
            <div className="list-row" key={t.id}>
              <Table2 size={13} />
              <span style={{ flex: 1 }}>
                <strong>{t.name}</strong>
                <br />
                <small style={{ color: 'var(--ink-muted)' }}>
                  {tr(lang, `${t.inputs.length} entrada(s) · ${t.rows.length} fila(s)`, `${t.inputs.length} input(s) · ${t.rows.length} row(s)`)}
                </small>
              </span>
              <button className="btn btn--sm" onClick={() => requestUi('lookup-table', t.id)}>
                {tr(lang, 'Editar', 'Edit')}
              </button>
            </div>
          ))}
        </Section>
      )}

      <Section title={tr(lang, 'Restricciones', 'Constraints')} count={def.constraints.length}>
        {def.constraints.map((c) => {
          const conflict = evaluation.conflicts.includes(c.id);
          return (
            <div key={c.id} className={`authoring__row${conflict ? ' is-conflict' : ''}`}>
              {c.kind === 'geometric' ? (
                <>
                  <span style={{ flex: 1 }}>
                    {GEO_CONSTRAINT_LABEL[c.type][lang]} <small style={{ color: 'var(--ink-muted)' }}>· {c.refs.length} ref.</small>
                  </span>
                  <Toggle checked={c.enabled} onChange={(v) => mutate('BCONSTRAINT', (d) => ({ ...d, constraints: d.constraints.map((x) => (x.id === c.id ? { ...x, enabled: v } : x)) }))} label={tr(lang, 'Activa', 'On')} />
                </>
              ) : (
                <>
                  <span className="eyebrow" style={{ width: 70 }} title={DIM_CONSTRAINT_LABEL[c.type][lang]}>
                    {c.name}
                  </span>
                  <div style={{ flex: 1 }}>
                    <TextField value={c.expression} ariaLabel={tr(lang, `Fórmula de ${c.name}`, `Formula for ${c.name}`)} onCommit={(v) => mutate('BCPARAMETER', (d) => ({ ...d, constraints: d.constraints.map((x) => (x.id === c.id && x.kind === 'dimensional' ? { ...x, expression: v } : x)) }))} />
                  </div>
                  <Toggle checked={c.isParameter} onChange={(v) => mutate('BCPARAMETER', (d) => ({ ...d, constraints: d.constraints.map((x) => (x.id === c.id && x.kind === 'dimensional' ? { ...x, isParameter: v } : x)) }))} label={tr(lang, 'Prop.', 'Prop.')} />
                </>
              )}
              {conflict && <AlertTriangle size={13} color="var(--fs-signal-attention)" aria-label={tr(lang, 'En conflicto', 'Conflicting')} />}
              <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => mutate('BCONSTRAINT DELETE', (d) => ({ ...d, constraints: d.constraints.filter((x) => x.id !== c.id) }))} aria-label={tr(lang, 'Eliminar restricción', 'Delete constraint')}>
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
        {!def.constraints.length && <div className="empty">{tr(lang, 'Sin restricciones.', 'No constraints.')}</div>}
      </Section>

      <VariablesSection def={def} lang={lang} mutate={mutate} fail={fail} />
    </div>
  );
}

function Section({ title, count, open, children }: { title: string; count: number; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="section" open={open}>
      <summary>
        <span style={{ flex: 1 }}>{title}</span>
        <span className="eyebrow">{count}</span>
      </summary>
      <div className="section__body">{children}</div>
    </details>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function renameOk(def: DynamicBlockDefinition, current: string, next: string, fail: (es: string, en: string) => void): boolean {
  if (next === current) return false;
  if (!isValidFormulaName(next)) {
    fail(`«${next}» no es un nombre válido: usa letras, dígitos y _ sin empezar por dígito.`, `"${next}" is not a valid name: use letters, digits and _ not starting with a digit.`);
    return false;
  }
  if ([...formulaNames(def)].some((n) => n.toLowerCase() === next.toLowerCase())) {
    fail(`Ya existe «${next}» en este bloque.`, `"${next}" already exists in this block.`);
    return false;
  }
  return true;
}

const GRIP_OPTIONS: Partial<Record<DynParam['type'], number[]>> = { linear: [0, 1, 2], xy: [0, 1, 4], polar: [0, 1], point: [0, 1], rotation: [0, 1], flip: [0, 1], visibility: [0, 1], lookup: [0, 1], alignment: [0, 1] };

function ParamItem({ p, def, lang, mutate, fail, noAction, editor }: { p: DynParam; def: DynamicBlockDefinition; lang: Lang; mutate: Mutate; fail: (es: string, en: string) => void; noAction: boolean; editor: Editor }) {
  const set = (patch: Partial<DynParam>) => mutate('BPARAMETER EDIT', (d) => ({ ...d, parameters: d.parameters.map((x) => (x.id === p.id ? ({ ...x, ...patch } as DynParam) : x)) }));
  const actions = def.actions.filter((a) => a.paramId === p.id);
  return (
    <details className="authoring__item">
      <summary>
        <span className="authoring__chip">{PARAM_TYPE_LABEL[p.type][lang]}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label || p.name}</span>
        {noAction ? (
          <span className="authoring__badge is-warn" title={tr(lang, 'Sin acción asociada: no modificará geometría', 'No action: it will not modify geometry')}>
            <AlertTriangle size={11} /> {tr(lang, 'sin acción', 'no action')}
          </span>
        ) : actions.length ? (
          <span className="eyebrow">{actions.length}×</span>
        ) : null}
      </summary>
      <div className="section__body">
        <Field label={tr(lang, 'Nombre', 'Name')}>
          <TextField value={p.name} onCommit={(v) => renameOk(def, p.name, v.trim(), fail) && set({ name: v.trim() })} />
        </Field>
        <Field label={tr(lang, 'Etiqueta', 'Label')}>
          <TextField value={p.label} onCommit={(v) => set({ label: v })} />
        </Field>
        <Field label={tr(lang, 'Descripción', 'Description')}>
          <TextField value={p.description ?? ''} onCommit={(v) => set({ description: v })} />
        </Field>
        {GRIP_OPTIONS[p.type] && (
          <Field label={tr(lang, 'Grips', 'Grips')}>
            <select className="select" value={p.gripCount} onChange={(e) => set({ gripCount: Number(e.target.value) as DynParam['gripCount'] })}>
              {GRIP_OPTIONS[p.type]!.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Toggle checked={p.showInProperties} onChange={(v) => set({ showInProperties: v })} label={tr(lang, 'En propiedades', 'In properties')} />
          <Toggle checked={p.chainActions} onChange={(v) => set({ chainActions: v })} label={tr(lang, 'Encadenar acciones', 'Chain actions')} />
        </div>
        {p.type === 'linear' && (
          <>
            <Field label={tr(lang, 'Base', 'Base')}>
              <select className="select" value={p.baseLocation} onChange={(e) => set({ baseLocation: e.target.value as 'start' | 'middle' } as Partial<DynParam>)}>
                <option value="start">{tr(lang, 'Punto inicial', 'Start point')}</option>
                <option value="middle">{tr(lang, 'Punto medio', 'Midpoint')}</option>
              </select>
            </Field>
            <Field label={tr(lang, 'Fórmula', 'Formula')}>
              <TextField value={p.expression ?? ''} ariaLabel={tr(lang, 'Fórmula opcional', 'Optional formula')} onCommit={(v) => set({ expression: v.trim() || undefined } as Partial<DynParam>)} />
            </Field>
            <ValueSetEditor lang={lang} value={p.valueSet} onChange={(vs) => set({ valueSet: vs } as Partial<DynParam>)} />
          </>
        )}
        {p.type === 'rotation' && (
          <>
            <Field label={tr(lang, 'Ángulo por defecto', 'Default angle')}>
              <NumberField lang={lang} value={p.angle * DEG} suffix="°" onCommit={(v) => set({ angle: v / DEG } as Partial<DynParam>)} />
            </Field>
            <ValueSetEditor lang={lang} value={p.valueSet} onChange={(vs) => set({ valueSet: vs } as Partial<DynParam>)} />
          </>
        )}
        {p.type === 'polar' && (
          <>
            <div className="eyebrow">{tr(lang, 'Distancia', 'Distance')}</div>
            <ValueSetEditor lang={lang} value={p.distanceSet} onChange={(vs) => set({ distanceSet: vs } as Partial<DynParam>)} />
            <div className="eyebrow">{tr(lang, 'Ángulo', 'Angle')}</div>
            <ValueSetEditor lang={lang} value={p.angleSet} onChange={(vs) => set({ angleSet: vs } as Partial<DynParam>)} />
          </>
        )}
        {p.type === 'xy' && (
          <>
            <div className="eyebrow">X</div>
            <ValueSetEditor lang={lang} value={p.xSet} onChange={(vs) => set({ xSet: vs } as Partial<DynParam>)} />
            <div className="eyebrow">Y</div>
            <ValueSetEditor lang={lang} value={p.ySet} onChange={(vs) => set({ ySet: vs } as Partial<DynParam>)} />
          </>
        )}
        {p.type === 'flip' && (
          <>
            <Field label={tr(lang, 'Normal', 'Not flipped')}>
              <TextField value={p.labelNotFlipped} onCommit={(v) => set({ labelNotFlipped: v } as Partial<DynParam>)} />
            </Field>
            <Field label={tr(lang, 'Invertido', 'Flipped')}>
              <TextField value={p.labelFlipped} onCommit={(v) => set({ labelFlipped: v } as Partial<DynParam>)} />
            </Field>
          </>
        )}
        {p.type === 'alignment' && (
          <Field label={tr(lang, 'Tipo', 'Type')}>
            <select className="select" value={p.alignType} onChange={(e) => set({ alignType: e.target.value as 'perpendicular' | 'tangent' } as Partial<DynParam>)}>
              <option value="perpendicular">{tr(lang, 'Perpendicular', 'Perpendicular')}</option>
              <option value="tangent">{tr(lang, 'Tangente', 'Tangent')}</option>
            </select>
          </Field>
        )}
        {p.type === 'lookup' && (
          <button className="btn btn--sm" onClick={() => requestUi('lookup-table', p.tableId)}>
            <Table2 size={13} /> {tr(lang, 'Editar tabla de consulta', 'Edit lookup table')}
          </button>
        )}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {noAction && (
            <button className="btn btn--sm" onClick={() => editor.command('BACTION')}>
              {tr(lang, 'Añadir acción', 'Add action')}
            </button>
          )}
          <button
            className="btn btn--sm btn--danger"
            onClick={() => {
              const deps = actions.length;
              if (deps && !window.confirm(tr(lang, `Se eliminarán también ${deps} acción(es) de «${p.name}».`, `${deps} action(s) of "${p.name}" will also be deleted.`))) return;
              mutate('BPARAMETER DELETE', (d) => removeParameter(d, p.id));
            }}
          >
            <Trash2 size={12} /> {tr(lang, 'Eliminar', 'Delete')}
          </button>
        </div>
      </div>
    </details>
  );
}

function ValueSetEditor({ value, onChange, lang }: { value: ValueSet; onChange: (v: ValueSet) => void; lang: Lang }) {
  const num = (s: string) => {
    const t = s.trim().replace(',', '.');
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };
  return (
    <>
      <Field label={tr(lang, 'Conjunto de valores', 'Value set')}>
        <select className="select" value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as ValueSet['kind'], increment: value.increment ?? 1, list: value.list ?? [] })}>
          <option value="none">{tr(lang, 'Libre', 'None')}</option>
          <option value="increment">{tr(lang, 'Incremento', 'Increment')}</option>
          <option value="list">{tr(lang, 'Lista', 'List')}</option>
        </select>
      </Field>
      {value.kind !== 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: value.kind === 'increment' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 4 }}>
          {value.kind === 'increment' && <TextField ariaLabel={tr(lang, 'Incremento', 'Increment')} value={value.increment === undefined ? '' : String(value.increment)} onCommit={(s) => onChange({ ...value, increment: num(s) })} />}
          <TextField ariaLabel={tr(lang, 'Mínimo', 'Minimum')} value={value.min === undefined ? '' : String(value.min)} onCommit={(s) => onChange({ ...value, min: num(s) })} />
          <TextField ariaLabel={tr(lang, 'Máximo', 'Maximum')} value={value.max === undefined ? '' : String(value.max)} onCommit={(s) => onChange({ ...value, max: num(s) })} />
        </div>
      )}
      {value.kind === 'list' && (
        <Field label={tr(lang, 'Valores', 'Values')}>
          <TextField
            value={(value.list ?? []).join('; ')}
            ariaLabel={tr(lang, 'Valores separados por punto y coma', 'Semicolon-separated values')}
            onCommit={(s) =>
              onChange({
                ...value,
                list: [...new Set(s.split(/[;\s]+/).map(num).filter((n): n is number => n !== undefined))].sort((a, b) => a - b),
              })
            }
          />
        </Field>
      )}
      <small style={{ color: 'var(--ink-muted)' }}>{tr(lang, 'Incremento: mínimo · máximo (vacío = sin límite)', 'Increment · minimum · maximum (blank = no limit)')}</small>
    </>
  );
}

function ActionItem({ a, def, lang, mutate, editor, block, blockSel }: { a: DynAction; def: DynamicBlockDefinition; lang: Lang; mutate: Mutate; editor: Editor; block: BlockRecord; blockSel: Id[] }) {
  const set = (patch: Partial<DynAction>) => mutate('BACTION EDIT', (d) => ({ ...d, actions: d.actions.map((x) => (x.id === a.id ? ({ ...x, ...patch } as DynAction) : x)) }));
  const param = def.parameters.find((p) => p.id === a.paramId);
  const compatible = def.parameters.filter((p) => ACTION_COMPAT[a.type].includes(p.type));
  const existing = a.selection.filter((id) => editor.doc.entity(id)?.owner === block.id);
  const chained = a.selection.filter((id) => def.parameters.some((p) => p.id === id));
  return (
    <details className="authoring__item">
      <summary>
        <span className="authoring__chip">{ACTION_TYPE_LABEL[a.type][lang]}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
        {!param && <span className="authoring__badge is-error">{tr(lang, 'sin parámetro', 'no parameter')}</span>}
        {a.type !== 'lookup' && !a.selection.length && <span className="authoring__badge is-warn">{tr(lang, 'sin objetos', 'no objects')}</span>}
      </summary>
      <div className="section__body">
        <Field label={tr(lang, 'Nombre', 'Name')}>
          <TextField value={a.name} onCommit={(v) => set({ name: v })} />
        </Field>
        <Field label={tr(lang, 'Parámetro', 'Parameter')}>
          <select className="select" value={a.paramId} onChange={(e) => set({ paramId: e.target.value })}>
            {!param && <option value={a.paramId}>—</option>}
            {compatible.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({PARAM_TYPE_LABEL[p.type][lang]})
              </option>
            ))}
          </select>
        </Field>
        {a.type !== 'lookup' && (
          <>
            <div className="field">
              <label>{tr(lang, 'Objetos', 'Objects')}</label>
              <span style={{ fontSize: 12 }}>
                {tr(lang, `${existing.length} objeto(s)`, `${existing.length} object(s)`)}
                {chained.length ? tr(lang, ` · ${chained.length} parámetro(s) encadenado(s)`, ` · ${chained.length} chained parameter(s)`) : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button className="btn btn--sm" onClick={() => editor.selection.set(existing)} disabled={!existing.length}>
                <Eye size={12} /> {tr(lang, 'Mostrar', 'Show')}
              </button>
              <button className="btn btn--sm" disabled={!blockSel.length} title={tr(lang, 'Sustituye por los objetos seleccionados en el lienzo', 'Replace with the objects selected on the canvas')} onClick={() => set({ selection: [...blockSel, ...chained] })}>
                {tr(lang, 'Usar selección', 'Use selection')}
              </button>
              <button className="btn btn--sm" disabled={!blockSel.length} onClick={() => set({ selection: [...new Set([...a.selection, ...blockSel])] })}>
                + {tr(lang, 'Añadir', 'Add')}
              </button>
              <button className="btn btn--sm" disabled={!blockSel.length} onClick={() => set({ selection: a.selection.filter((id) => !blockSel.includes(id)) })}>
                − {tr(lang, 'Quitar', 'Remove')}
              </button>
            </div>
          </>
        )}
        {(a.type === 'move' || a.type === 'stretch') && (
          <>
            <Field label={tr(lang, 'Punto del parámetro', 'Parameter point')}>
              <select className="select" value={a.paramPoint} onChange={(e) => set({ paramPoint: e.target.value as 'base' | 'end' | 'corner' })}>
                <option value="end">{tr(lang, 'Final', 'End')}</option>
                <option value="base">{tr(lang, 'Base', 'Base')}</option>
                {param?.type === 'xy' && <option value="corner">{tr(lang, 'Esquina', 'Corner')}</option>}
              </select>
            </Field>
            <Field label={tr(lang, 'Eje', 'Axis')}>
              <select className="select" value={a.axis} onChange={(e) => set({ axis: e.target.value as 'xy' | 'x' | 'y' })}>
                <option value="xy">XY</option>
                <option value="x">X</option>
                <option value="y">Y</option>
              </select>
            </Field>
            <Field label={tr(lang, 'Multiplicador', 'Multiplier')}>
              <NumberField lang={lang} value={a.distanceMultiplier} onCommit={(v) => set({ distanceMultiplier: v })} />
            </Field>
            <Field label={tr(lang, 'Desfase angular', 'Angle offset')}>
              <NumberField lang={lang} value={a.angleOffset * DEG} suffix="°" onCommit={(v) => set({ angleOffset: v / DEG })} />
            </Field>
          </>
        )}
        {(a.type === 'stretch' || a.type === 'polarstretch') && (
          <div className="field">
            <label>{tr(lang, 'Marco', 'Frame')}</label>
            <span style={{ fontSize: 12 }}>{tr(lang, `${a.frame.length} vértices`, `${a.frame.length} vertices`)}</span>
          </div>
        )}
        {a.type === 'polarstretch' && (
          <div className="field">
            <label>{tr(lang, 'Solo giran', 'Rotate only')}</label>
            <span style={{ fontSize: 12 }}>{a.rotateOnly.length}</span>
          </div>
        )}
        {(a.type === 'scale' || a.type === 'rotate') && (
          <Field label={tr(lang, 'Tipo de base', 'Base type')}>
            <select className="select" value={a.baseType} onChange={(e) => set({ baseType: e.target.value as 'dependent' | 'independent', basePoint: e.target.value === 'independent' ? (a.basePoint ?? { x: 0, y: 0 }) : undefined })}>
              <option value="dependent">{tr(lang, 'Dependiente', 'Dependent')}</option>
              <option value="independent">{tr(lang, 'Independiente', 'Independent')}</option>
            </select>
          </Field>
        )}
        {(a.type === 'scale' || a.type === 'rotate') && a.baseType === 'independent' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <NumberField lang={lang} ariaLabel="X" value={a.basePoint?.x ?? 0} onCommit={(v) => set({ basePoint: { x: v, y: a.basePoint?.y ?? 0 } })} />
            <NumberField lang={lang} ariaLabel="Y" value={a.basePoint?.y ?? 0} onCommit={(v) => set({ basePoint: { x: a.basePoint?.x ?? 0, y: v } })} />
          </div>
        )}
        {a.type === 'array' && (
          <>
            {param?.type === 'rotation' ? (
              <>
                <Field label={tr(lang, 'Elementos (fórmula)', 'Items (formula)')}>
                  <TextField value={a.polarCount ?? ''} onCommit={(v) => set({ polarCount: v.trim() || undefined })} />
                </Field>
                <Field label={tr(lang, 'Ángulo a llenar', 'Fill angle')}>
                  <NumberField lang={lang} value={a.fillAngle ?? 360} suffix="°" onCommit={(v) => set({ fillAngle: v })} />
                </Field>
              </>
            ) : (
              <>
                <Field label={tr(lang, 'Distancia columnas', 'Column offset')}>
                  <NumberField lang={lang} value={a.columnOffset} onCommit={(v) => set({ columnOffset: v })} />
                </Field>
                <Field label={tr(lang, 'Distancia filas', 'Row offset')}>
                  <NumberField lang={lang} value={a.rowOffset} onCommit={(v) => set({ rowOffset: v })} />
                </Field>
              </>
            )}
          </>
        )}
        {a.type === 'lookup' && (
          <button className="btn btn--sm" onClick={() => requestUi('lookup-table', a.tableId)}>
            <Table2 size={13} /> {tr(lang, 'Editar tabla de consulta', 'Edit lookup table')}
          </button>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn--sm btn--danger" onClick={() => mutate('BACTION DELETE', (d) => ({ ...d, actions: d.actions.filter((x) => x.id !== a.id) }))}>
            <Trash2 size={12} /> {tr(lang, 'Eliminar', 'Delete')}
          </button>
        </div>
      </div>
    </details>
  );
}

function VisibilitySection({ def, lang, mutate, editor, block, blockSel }: { def: DynamicBlockDefinition; lang: Lang; mutate: Mutate; editor: Editor; block: BlockRecord; blockSel: Id[] }) {
  const [newName, setNewName] = useState('');
  const vis = def.parameters.find((p): p is VisibilityParam => p.type === 'visibility');
  if (!vis) {
    return (
      <Section title={tr(lang, 'Estados de visibilidad', 'Visibility states')} count={0}>
        <div className="empty">{tr(lang, 'Añade un parámetro de visibilidad para crear estados (p. ej. variantes de un símbolo).', 'Add a visibility parameter to create states (e.g. symbol variants).')}</div>
        <button className="btn btn--sm" onClick={() => editor.command('BPARAMETER', ['Visibility'])}>
          <Plus size={12} /> {tr(lang, 'Parámetro de visibilidad', 'Visibility parameter')}
        </button>
      </Section>
    );
  }
  const current = editor.blockEditState.currentVisibility ?? vis.defaultState;
  const all = editor.doc.entitiesOf(block.id).length;
  const setVis = (fn: (p: VisibilityParam) => VisibilityParam) => mutate('BVSTATE', (d) => ({ ...d, parameters: d.parameters.map((p) => (p.id === vis.id ? fn(p as VisibilityParam) : p)) }));
  const setCurrent = (name: string) => {
    editor.blockEditState = { currentVisibility: name };
    editor.emit('doc');
  };
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    if (vis.states.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      editor.runner.message('error', { es: `Ya existe el estado «${name}».`, en: `State "${name}" already exists.` });
      return;
    }
    const base = vis.states.find((s) => s.name === current)?.visible ?? editor.doc.entitiesOf(block.id).map((e) => e.id);
    setVis((p) => ({ ...p, states: [...p.states, { name, visible: [...base] }] }));
    setNewName('');
    setCurrent(name);
  };
  return (
    <Section title={tr(lang, 'Estados de visibilidad', 'Visibility states')} count={vis.states.length} open>
      <div role="radiogroup" aria-label={tr(lang, 'Estado mostrado', 'Displayed state')}>
        {vis.states.map((s) => (
          <div key={s.name} className={`list-row${s.name === current ? ' is-active' : ''}`}>
            <input type="radio" name={`vis-${vis.id}`} checked={s.name === current} onChange={() => setCurrent(s.name)} aria-label={tr(lang, `Mostrar estado ${s.name}`, `Show state ${s.name}`)} />
            <div style={{ flex: 1 }}>
              <TextField
                value={s.name}
                ariaLabel={tr(lang, 'Nombre del estado', 'State name')}
                onCommit={(v) => {
                  const n = v.trim();
                  if (!n || vis.states.some((x) => x.name.toLowerCase() === n.toLowerCase() && x.name !== s.name)) return;
                  setVis((p) => ({ ...p, defaultState: p.defaultState === s.name ? n : p.defaultState, states: p.states.map((x) => (x.name === s.name ? { ...x, name: n } : x)) }));
                  if (current === s.name) setCurrent(n);
                }}
              />
            </div>
            <span className="eyebrow" title={tr(lang, 'Objetos visibles', 'Visible objects')}>
              {s.visible.filter((id) => editor.doc.entity(id)).length}/{all}
            </span>
            <button className="icon-btn" style={{ width: 24, height: 24, color: vis.defaultState === s.name ? 'var(--fs-signal-attention)' : undefined }} onClick={() => setVis((p) => ({ ...p, defaultState: s.name }))} title={tr(lang, 'Estado por defecto', 'Default state')} aria-pressed={vis.defaultState === s.name}>
              <Star size={12} />
            </button>
            <button
              className="icon-btn"
              style={{ width: 24, height: 24 }}
              disabled={vis.states.length <= 1}
              onClick={() => {
                const rest = vis.states.filter((x) => x.name !== s.name);
                setVis((p) => ({ ...p, states: rest, defaultState: p.defaultState === s.name ? rest[0].name : p.defaultState }));
                if (current === s.name) setCurrent(rest[0].name);
              }}
              aria-label={tr(lang, 'Eliminar estado', 'Delete state')}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input className="input" value={newName} placeholder={tr(lang, 'Nuevo estado…', 'New state…')} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && add())} />
        <button className="btn btn--sm" onClick={add} disabled={!newName.trim()}>
          <Plus size={12} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button className="btn btn--sm" disabled={!blockSel.length} onClick={() => setVis((p) => ({ ...p, states: p.states.map((s) => (s.name === current ? { ...s, visible: [...new Set([...s.visible, ...blockSel])] } : s)) }))}>
          {tr(lang, `Hacer visible en «${current}»`, `Make visible in "${current}"`)}
        </button>
        <button className="btn btn--sm" disabled={!blockSel.length} onClick={() => setVis((p) => ({ ...p, states: p.states.map((s) => (s.name === current ? { ...s, visible: s.visible.filter((id) => !blockSel.includes(id)) } : s)) }))}>
          {tr(lang, 'Ocultar', 'Hide')}
        </button>
      </div>
      <small style={{ color: 'var(--ink-muted)' }}>{tr(lang, 'Los objetos ocultos en el estado mostrado se dibujan atenuados y siguen siendo designables.', 'Objects hidden in the displayed state are drawn faded and remain selectable.')}</small>
    </Section>
  );
}

function VariablesSection({ def, lang, mutate, fail }: { def: DynamicBlockDefinition; lang: Lang; mutate: Mutate; fail: (es: string, en: string) => void }) {
  const [name, setName] = useState('');
  const [expr, setExpr] = useState('');
  const add = () => {
    const n = name.trim();
    if (!renameOk(def, '', n, fail)) return;
    mutate('BVARIABLE', (d) => ({ ...d, variables: [...d.variables, { name: n, expression: expr.trim() || '0', exposed: false, readOnly: false }] }));
    setName('');
    setExpr('');
  };
  return (
    <Section title={tr(lang, 'Variables y fórmulas', 'Variables and formulas')} count={def.variables.length}>
      {def.variables.map((v) => (
        <div key={v.name} className="authoring__row">
          <span className="eyebrow" style={{ width: 70, overflow: 'hidden', textOverflow: 'ellipsis' }} title={v.name}>
            {v.name}
          </span>
          <div style={{ flex: 1 }}>
            <TextField value={v.expression} ariaLabel={tr(lang, `Expresión de ${v.name}`, `Expression for ${v.name}`)} onCommit={(ex) => mutate('BVARIABLE', (d) => ({ ...d, variables: d.variables.map((x) => (x.name === v.name ? { ...x, expression: ex } : x)) }))} />
          </div>
          <Toggle checked={v.exposed} onChange={(on) => mutate('BVARIABLE', (d) => ({ ...d, variables: d.variables.map((x) => (x.name === v.name ? { ...x, exposed: on } : x)) }))} label={tr(lang, 'Prop.', 'Prop.')} />
          <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => mutate('BVARIABLE DELETE', (d) => ({ ...d, variables: d.variables.filter((x) => x.name !== v.name) }))} aria-label={tr(lang, 'Eliminar variable', 'Delete variable')}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 4 }}>
        <input className="input" value={name} placeholder={tr(lang, 'nombre', 'name')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={tr(lang, 'Nombre de la variable', 'Variable name')} />
        <input className="input input--mono" value={expr} placeholder={tr(lang, 'expresión, p. ej. d1/2', 'expression, e.g. d1/2')} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && add())} aria-label={tr(lang, 'Expresión', 'Expression')} />
        <button className="btn btn--sm" onClick={add} disabled={!name.trim()}>
          <Plus size={12} />
        </button>
      </div>
    </Section>
  );
}
