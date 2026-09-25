import { AlertTriangle, Crosshair, Play, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  addParameter,
  applyParameterSet,
  ConstraintError,
  drawingConstraintState,
  isSpaceOwner,
  nextParameterName,
  removeDrawingConstraint,
  removeParameter,
  renameNamed,
  saveParameterSet,
  setNamedExpression,
} from '../../constraints/drawing';
import type { Transaction } from '../../document/document';
import type { DimConstraint, DrawingConstraint } from '../../document/types';
import type { Editor } from '../../editor/editor';
import type { Lang } from '../../commands/types';
import { TextField, Toggle, tr } from '../controls';
import { useEditorEvents } from '../hooks';

const DIM_LABEL: Record<DimConstraint['type'], [string, string]> = {
  'linear-h': ['Horizontal', 'Horizontal'],
  'linear-v': ['Vertical', 'Vertical'],
  aligned: ['Alineada', 'Aligned'],
  angular: ['Angular', 'Angular'],
  radius: ['Radio', 'Radius'],
  diameter: ['Diámetro', 'Diameter'],
};

const fmt = (v: number | undefined) => (v === undefined ? '—' : String(Math.round(v * 1e4) / 1e4));

/**
 * Administrador de parámetros del dibujo: cotas de restricción, parámetros de usuario y
 * variantes. Cada edición es una transacción deshacible; los errores (fórmula inválida,
 * ciclo, valor sin solución) se rechazan sin tocar el dibujo.
 */
export function ParametersPanel({ editor }: { editor: Editor }) {
  useEditorEvents(editor, ['doc', 'space', 'prefs']);
  const lang = editor.lang;
  const doc = editor.doc;
  const data = doc.data;
  const [newName, setNewName] = useState('');
  const [newExpr, setNewExpr] = useState('');
  const [variantName, setVariantName] = useState('');
  const [error, setError] = useState<{ es: string; en: string } | null>(null);
  // tras un rechazo, los campos se vuelven a montar con el valor real del dibujo
  const [rejections, setRejections] = useState(0);

  const space = editor.space;
  const state = useMemo(() => drawingConstraintState(data, space), [doc.version, space]); // eslint-disable-line react-hooks/exhaustive-deps
  const scope = state.scope;
  const dims = [...data.constraints.values()].filter((c): c is DrawingConstraint & DimConstraint => c.kind === 'dimensional');
  const params = [...data.parameters.values()];
  const sets = [...data.parameterSets.values()];
  const inSpace = state.constraints.length;
  const fullyFree = state.freedom ? [...state.freedom.values()].filter((f) => f === 'partial').length : null;

  const run = (label: string, fn: (tx: Transaction) => void): boolean => {
    try {
      doc.transact(label, fn);
      setError(null);
      return true;
    } catch (err) {
      const l10n = err instanceof ConstraintError ? err.l10n : { es: `No se pudo aplicar: ${String(err)}`, en: `Could not apply: ${String(err)}` };
      editor.runner.message('error', l10n);
      setError(l10n);
      setRejections((n) => n + 1);
      return false;
    }
  };

  const selectRefs = (c: DrawingConstraint) => {
    const ids = [...new Set(c.refs.map((r) => r.entityId))].filter((id) => doc.entity(id)?.owner === editor.space);
    if (!ids.length) {
      editor.runner.message('warn', { es: 'Esa cota está en otro espacio.', en: 'That dimension is in another space.' });
      return;
    }
    editor.selection.set(ids);
    editor.zoomSelection(ids);
  };

  const addParam = () => {
    const name = newName.trim() || nextParameterName(data, 'p');
    if (run('PARAMETERS', (tx) => addParameter(tx, name, newExpr))) {
      setNewName('');
      setNewExpr('');
    }
  };

  const issues: { id: string; text: string }[] = [];
  for (const [name, err] of scope.errors) issues.push({ id: `e:${name}`, text: `${name}: ${err[lang]}` });
  const conflicted = state.constraints.filter((c) => state.conflicts.has(c.id));
  if (conflicted.length) issues.push({ id: 'conf', text: tr(lang, `${conflicted.length} restricción(es) sin satisfacer en este espacio.`, `${conflicted.length} unsatisfied constraint(s) in this space.`) });

  return (
    <div className="panel params">
      <div className="panel__head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">{tr(lang, 'Diseño paramétrico', 'Parametric design')}</div>
          <div className="panel__title">{tr(lang, 'Parámetros', 'Parameters')}</div>
        </div>
        <span className={`status-pill ${conflicted.length ? 'status-pill--experimental' : 'status-pill--disponible'}`} title={tr(lang, 'Restricciones en el espacio actual', 'Constraints in the current space')}>
          {inSpace} {tr(lang, 'restr.', 'constr.')}
        </span>
      </div>

      {!isSpaceOwner(data, space) && <div className="empty">{tr(lang, 'En el Editor de bloques las restricciones son del bloque: usa el panel Autoría.', 'In the Block editor constraints belong to the block: use the Authoring panel.')}</div>}

      <div className="params__tools" role="group" aria-label={tr(lang, 'Herramientas paramétricas', 'Parametric tools')}>
        <button className="btn btn--sm" onClick={() => void editor.command('GEOMCONSTRAINT')}>{tr(lang, 'Geométrica', 'Geometric')}</button>
        <button className="btn btn--sm" onClick={() => void editor.command('DIMCONSTRAINT')}>{tr(lang, 'Cota', 'Dimension')}</button>
        <button className="btn btn--sm" onClick={() => void editor.command('AUTOCONSTRAIN')}>{tr(lang, 'Automáticas', 'Auto')}</button>
        <button className="btn btn--sm" onClick={() => void editor.command('DELCONSTRAINT')}>{tr(lang, 'Quitar', 'Remove')}</button>
      </div>
      <div className="params__toggles">
        <Toggle checked={editor.prefs.constraintBar} onChange={(on) => void editor.command('CONSTRAINTBAR', [on ? 'show' : 'hide'])} label={tr(lang, 'Mostrar restricciones', 'Show constraints')} />
        <Toggle checked={editor.prefs.inferConstraints} onChange={(on) => void editor.command('CONSTRAINTINFER', [on ? 'on' : 'off'])} label={tr(lang, 'Inferir al dibujar', 'Infer while drawing')} />
      </div>
      {inSpace > 0 && fullyFree !== null && (
        <small className="params__hint">
          {fullyFree === 0
            ? tr(lang, 'Todo lo restringido en este espacio está totalmente definido.', 'Everything constrained in this space is fully defined.')
            : tr(lang, `${fullyFree} objeto(s) aún tienen grados de libertad (se dibujan con trazo discontinuo en las marcas).`, `${fullyFree} object(s) still have degrees of freedom (dashed in the markers).`)}
        </small>
      )}

      {error && (
        <div className="authoring__issues" role="alert">
          <div className="authoring__issue is-error">
            <AlertTriangle size={13} aria-hidden="true" /> <span>{error[lang]}</span>
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="authoring__issues" role="status">
          {issues.map((i) => (
            <div key={i.id} className="authoring__issue is-warn">
              <AlertTriangle size={13} aria-hidden="true" /> <span>{i.text}</span>
            </div>
          ))}
        </div>
      )}

      <details className="section" open>
        <summary>
          <span style={{ flex: 1 }}>{tr(lang, 'Cotas de restricción', 'Constraint dimensions')}</span>
          <span className="eyebrow">{dims.length}</span>
        </summary>
        <div className="section__body">
          {!dims.length && <small className="params__hint">{tr(lang, 'Crea cotas con DIMCONSTRAINT o convierte cotas asociativas con DCCONVERT.', 'Create dimensions with DIMCONSTRAINT or convert associative ones with DCCONVERT.')}</small>}
          {dims.map((c) => (
            <Row
              key={`${c.id}:${rejections}`}
              lang={lang}
              name={c.name}
              kind={DIM_LABEL[c.type][lang === 'es' ? 0 : 1]}
              expression={c.expression}
              value={scope.values.get(c.name)}
              unit={c.type === 'angular' ? '°' : ''}
              conflict={state.conflicts.has(c.id) || scope.errors.has(c.name)}
              onRename={(v) => run('PARAMETERS', (tx) => renameNamed(tx, c.name, v.trim()))}
              onFormula={(v) => run('PARAMETERS', (tx) => setNamedExpression(tx, c.name, v))}
              onDelete={() => run('DELCONSTRAINT', (tx) => removeDrawingConstraint(tx, c.id))}
              onLocate={() => selectRefs(c)}
            />
          ))}
        </div>
      </details>

      <details className="section" open>
        <summary>
          <span style={{ flex: 1 }}>{tr(lang, 'Parámetros de usuario', 'User parameters')}</span>
          <span className="eyebrow">{params.length}</span>
        </summary>
        <div className="section__body">
          {params.map((p) => (
            <Row
              key={`${p.id}:${rejections}`}
              lang={lang}
              name={p.name}
              expression={p.expression}
              value={scope.values.get(p.name)}
              conflict={scope.errors.has(p.name)}
              onRename={(v) => run('PARAMETERS', (tx) => renameNamed(tx, p.name, v.trim()))}
              onFormula={(v) => run('PARAMETERS', (tx) => setNamedExpression(tx, p.name, v))}
              onDelete={() => run('PARAMETERS', (tx) => removeParameter(tx, p.id))}
            />
          ))}
          <div className="params__add">
            <input className="input" value={newName} placeholder={nextParameterName(data, 'p')} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={tr(lang, 'Nombre del parámetro nuevo', 'New parameter name')} />
            <input className="input input--mono" value={newExpr} placeholder={tr(lang, 'fórmula, p. ej. 2*luz', 'formula, e.g. 2*span')} onChange={(e) => setNewExpr(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && addParam())} aria-label={tr(lang, 'Fórmula del parámetro nuevo', 'New parameter formula')} />
            <button className="btn btn--sm" onClick={addParam} aria-label={tr(lang, 'Añadir parámetro', 'Add parameter')} title={tr(lang, 'Añadir parámetro', 'Add parameter')}>
              <Plus size={12} />
            </button>
          </div>
        </div>
      </details>

      <details className="section" open={sets.length > 0}>
        <summary>
          <span style={{ flex: 1 }}>{tr(lang, 'Variantes', 'Variants')}</span>
          <span className="eyebrow">{sets.length}</span>
        </summary>
        <div className="section__body">
          {sets.map((s) => (
            <div key={s.id} className="authoring__row">
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.name}>
                {s.name}
              </span>
              <span className="eyebrow">{Object.keys(s.values).length}</span>
              <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => run('PARAMETER VARIANT', (tx) => void applyParameterSet(tx, s.id))} aria-label={tr(lang, `Aplicar ${s.name}`, `Apply ${s.name}`)} title={tr(lang, 'Aplicar', 'Apply')}>
                <Play size={12} />
              </button>
              <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => run('PARAMETER VARIANT', (tx) => void saveParameterSet(tx, s.name))} aria-label={tr(lang, `Actualizar ${s.name} con los valores actuales`, `Update ${s.name} with current values`)} title={tr(lang, 'Actualizar con los valores actuales', 'Update with current values')}>
                <Save size={12} />
              </button>
              <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => run('PARAMETER VARIANT', (tx) => tx.remove('parameterSets', s.id))} aria-label={tr(lang, `Eliminar ${s.name}`, `Delete ${s.name}`)} title={tr(lang, 'Eliminar', 'Delete')}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <div className="params__add params__add--two">
            <input className="input" value={variantName} placeholder={tr(lang, 'nombre de la variante', 'variant name')} onChange={(e) => setVariantName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={tr(lang, 'Nombre de la variante', 'Variant name')} />
            <button
              className="btn btn--sm"
              disabled={!variantName.trim() || (!dims.length && !params.length)}
              onClick={() => run('PARAMETER VARIANT', (tx) => void saveParameterSet(tx, variantName)) && setVariantName('')}
            >
              <Save size={12} /> {tr(lang, 'Guardar actual', 'Save current')}
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

function Row({
  lang,
  name,
  kind,
  expression,
  value,
  unit = '',
  conflict,
  onRename,
  onFormula,
  onDelete,
  onLocate,
}: {
  lang: Lang;
  name: string;
  kind?: string;
  expression: string;
  value: number | undefined;
  unit?: string;
  conflict: boolean;
  onRename: (v: string) => void;
  onFormula: (v: string) => void;
  onDelete: () => void;
  onLocate?: () => void;
}) {
  return (
    <div className={`params__row${conflict ? ' is-conflict' : ''}`}>
      <div className="params__name">
        <TextField value={name} ariaLabel={tr(lang, `Nombre de ${name}`, `Name of ${name}`)} onCommit={onRename} />
        {kind && <span className="eyebrow">{kind}</span>}
      </div>
      <div className="params__formula">
        <TextField value={expression} ariaLabel={tr(lang, `Fórmula de ${name}`, `Formula for ${name}`)} onCommit={onFormula} />
      </div>
      <output className="params__value" aria-label={tr(lang, `Valor de ${name}`, `Value of ${name}`)}>
        {fmt(value)}
        {value !== undefined ? unit : ''}
      </output>
      <div className="params__actions">
        {onLocate && (
          <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={onLocate} aria-label={tr(lang, `Mostrar ${name} en el dibujo`, `Show ${name} in the drawing`)} title={tr(lang, 'Mostrar en el dibujo', 'Show in drawing')}>
            <Crosshair size={12} />
          </button>
        )}
        <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={onDelete} aria-label={tr(lang, `Eliminar ${name}`, `Delete ${name}`)} title={tr(lang, 'Eliminar', 'Delete')}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

