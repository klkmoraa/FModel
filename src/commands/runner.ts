import type { Vec2 } from '../geometry/vec';
import { dist } from '../geometry/vec';
import type { Transaction } from '../document/document';
import type { Id } from '../document/types';
import { parseAngle, parseCoordinateInput } from '../snap/coords';
import { evaluate } from '../lib/expr';
import type { Editor } from '../editor/editor';
import { requestUi } from '../app/services';
import { findCommand } from './registry';
import type { CommandApi, CommandDef, InputRequest, InputResponse, Keyword, L10n, PreviewSpec } from './types';
import { CancelError, CommandError } from './types';

export interface PendingInput {
  req: InputRequest;
  resolve: (r: InputResponse) => void;
  reject: (e: unknown) => void;
}

export interface CommandLogEntry {
  kind: 'command' | 'prompt' | 'input' | 'info' | 'warn' | 'error';
  text: string;
  at: number;
}

interface ActiveCommand {
  def: CommandDef;
  abort: AbortController;
  pending: PendingInput | null;
  lastPoint: Vec2 | null;
}

const tr = (lang: 'es' | 'en', l: L10n) => l[lang];

/**
 * Ejecuta comandos asíncronos. Cada comando corre dentro de un grupo de historial:
 * sus pasos se ven al instante y se deshacen como una sola operación. Escape
 * termina el comando conservando los pasos completados (como AutoCAD); un error
 * inesperado revierte todo y explica la causa.
 */
export class CommandRunner {
  private stack: ActiveCommand[] = [];
  private listeners = new Set<() => void>();
  log: CommandLogEntry[] = [];
  lastCommand: CommandDef | null = null;
  history: string[] = [];
  lastPoint: Vec2 | null = null;

  constructor(private editor: Editor) {}

  get active(): ActiveCommand | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  get pending(): PendingInput | null {
    return this.active?.pending ?? null;
  }

  get busy(): boolean {
    return this.stack.length > 0;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const l of this.listeners) l();
  }

  private pushLog(kind: CommandLogEntry['kind'], text: string) {
    this.log.push({ kind, text, at: Date.now() });
    if (this.log.length > 500) this.log.splice(0, this.log.length - 500);
    this.emit();
  }

  message(kind: 'info' | 'warn' | 'error', l: L10n | string) {
    this.pushLog(kind, typeof l === 'string' ? l : tr(this.editor.lang, l));
  }

  /** Ejecuta por nombre o alias. */
  async execute(nameOrAlias: string, args?: string[]): Promise<void> {
    const def = findCommand(nameOrAlias);
    if (!def) {
      this.message('error', { es: `Comando desconocido «${nameOrAlias}». Escribe ? o usa la paleta de comandos (Ctrl+K).`, en: `Unknown command "${nameOrAlias}". Type ? or open the command palette (Ctrl+K).` });
      return;
    }
    return this.run(def, args);
  }

  async run(def: CommandDef, args?: string[]): Promise<void> {
    if (this.busy && !def.transparent) this.cancelAll();
    const doc = this.editor.doc;
    const active: ActiveCommand = { def, abort: new AbortController(), pending: null, lastPoint: this.lastPoint };
    this.stack.push(active);
    if (!def.transparent) {
      this.lastCommand = def;
      this.history = [def.name, ...this.history.filter((h) => h !== def.name)].slice(0, 50);
    }
    this.pushLog('command', `${def.transparent && this.stack.length > 1 ? "'" : ''}${def.name}`);
    if (def.ui) requestUi(def.ui);
    const grouped = !def.readOnly && !doc.history.inGroup;
    if (grouped) doc.history.beginGroup(tr(this.editor.lang, def.label));
    let failed = false;
    try {
      await def.run(this.api(active), args);
    } catch (err) {
      if (err instanceof CancelError) {
        this.pushLog('info', this.editor.lang === 'es' ? '*Cancelar*' : '*Cancel*');
      } else {
        failed = true;
        if (doc.activeTransaction) doc.activeTransaction.rollback();
        const msg = err instanceof CommandError ? tr(this.editor.lang, err.l10n) : err instanceof Error ? err.message : String(err);
        this.pushLog('error', `${def.name}: ${msg}`);
        console.error(err);
      }
    } finally {
      if (grouped) {
        if (failed) doc.history.abortGroup();
        else doc.history.endGroup();
      }
      const i = this.stack.indexOf(active);
      if (i >= 0) this.stack.splice(i, 1);
      if (active.lastPoint) this.lastPoint = active.lastPoint;
      this.editor.setPreview(null);
      this.editor.onCommandEnd(def);
      this.emit();
    }
  }

  /**
   * Ejecuta un comando alimentando sus peticiones con una secuencia de entradas
   * (texto, '' = Intro, o puntos). Base de paletas de herramientas y macros.
   */
  async script(name: string, inputs: (string | Vec2)[], args?: string[]): Promise<void> {
    const queue = [...inputs];
    let lastFed: PendingInput | null = null;
    const feed = () => {
      const p = this.pending;
      if (!p || !queue.length || p === lastFed) return;
      lastFed = p;
      const next = queue.shift()!;
      queueMicrotask(() => {
        if (typeof next === 'string') this.submitText(next);
        else if (p.req.kind === 'selection') {
          // un punto designa el objeto bajo él y la petición sigue abierta
          const id = this.editor.pickEntityAt(next, p.req.types);
          if (id) this.editor.addToRequestSelection([id]);
          lastFed = null;
          feed();
        } else if (p.req.kind === 'entity') {
          const id = this.editor.pickEntityAt(next, p.req.types);
          if (id) this.submitEntity(id, next);
          else this.cancel();
        } else this.submitPoint(next);
      });
    };
    const off = this.subscribe(feed);
    try {
      const run = this.execute(name, args);
      feed();
      await run;
    } finally {
      off();
    }
  }

  repeatLast() {
    if (this.lastCommand) void this.run(this.lastCommand);
  }

  cancel() {
    const a = this.active;
    if (!a) return;
    a.abort.abort();
    const p = a.pending;
    a.pending = null;
    p?.reject(new CancelError());
    this.emit();
  }

  cancelAll() {
    while (this.stack.length) {
      const before = this.stack.length;
      this.cancel();
      // el finally de run() retira el comando; si el comando no estaba esperando, sácalo
      if (this.stack.length === before) this.stack.pop();
    }
  }

  private api(active: ActiveCommand): CommandApi {
    const editor = this.editor;
    const runner = this;
    const request = (req: InputRequest) =>
      new Promise<InputResponse>((resolve, reject) => {
        if (active.abort.signal.aborted) {
          reject(new CancelError());
          return;
        }
        active.pending = { req, resolve, reject };
        runner.pushLog('prompt', runner.promptText(req));
        editor.onRequest(req);
        runner.emit();
      }).finally(() => {
        if (active.pending?.req === req) active.pending = null;
      });
    const api: CommandApi = {
      editor,
      get lang() {
        return editor.lang;
      },
      t: (l) => tr(editor.lang, l),
      apply<T>(label: string, fn: (tx: Transaction) => T): T {
        return editor.doc.transact(label, fn);
      },
      request,
      getPoint: async (r) => {
        const res = await request({ ...r, kind: 'point' });
        if (res.kind === 'point') active.lastPoint = res.p;
        return res as never;
      },
      getDistance: async (r) => (await request({ ...r, kind: 'distance' })) as never,
      getAngle: async (r) => (await request({ ...r, kind: 'angle' })) as never,
      getNumber: async (r) => (await request({ ...r, kind: 'number' })) as never,
      getString: async (r) => (await request({ ...r, kind: 'string' })) as never,
      getKeyword: async (r) => (await request({ ...r, kind: 'keyword' })) as never,
      getSelection: async (r) => {
        const pre = editor.selection.list.filter((id) => editor.isSelectable(id, r.types, r.allowLocked));
        if (r.usePreselection !== false && pre.length) {
          editor.selection.clear();
          return r.single ? pre.slice(0, 1) : [...pre];
        }
        const res = await request({ ...r, kind: 'selection' });
        if (res.kind === 'selection') return res.ids;
        return [];
      },
      getEntity: async (r) => (await request({ ...r, kind: 'entity' })) as never,
      setPreview: (p: PreviewSpec | null) => editor.setPreview(p),
      info: (m) => runner.message('info', m),
      warn: (m) => runner.message('warn', m),
      get lastPoint() {
        return active.lastPoint ?? runner.lastPoint;
      },
      set lastPoint(p: Vec2 | null) {
        active.lastPoint = p;
      },
      signal: active.abort.signal,
    };
    return api;
  }

  promptText(req: InputRequest): string {
    const lang = this.editor.lang;
    let s = tr(lang, req.prompt);
    if (req.keywords?.length) s += ` [${req.keywords.map((k) => tr(lang, k.label)).join('/')}]`;
    const dv = 'defaultValue' in req ? req.defaultValue : undefined;
    if (dv !== undefined && typeof dv !== 'object') s += ` <${typeof dv === 'number' ? (req.kind === 'angle' ? ((dv * 180) / Math.PI).toFixed(2) : String(Math.round(dv * 1e6) / 1e6)) : dv}>`;
    return `${s}:`;
  }

  // ------------------------------------------------------------------ entrada

  private resolve(res: InputResponse, echo?: string) {
    const p = this.pending;
    if (!p) return;
    if (echo !== undefined) this.pushLog('input', echo);
    this.active!.pending = null;
    p.resolve(res);
    this.emit();
  }

  matchKeyword(text: string, keywords: Keyword[] | undefined): string | null {
    if (!keywords?.length) return null;
    const t = text.trim().toLowerCase();
    if (!t) return null;
    const lang = this.editor.lang;
    for (const k of keywords) {
      const label = k.label[lang].toLowerCase();
      const other = k.label[lang === 'es' ? 'en' : 'es'].toLowerCase();
      const cap = (k.label[lang].match(/[A-ZÁÉÍÓÚÑ]/g) ?? []).join('').toLowerCase();
      const cands = [k.key.toLowerCase(), label, other, ...(k.aliases ?? []).map((a) => a.toLowerCase())];
      if (cands.includes(t) || (cap && cap === t)) return k.key;
    }
    for (const k of keywords) {
      if (k.label[lang].toLowerCase().startsWith(t) || k.key.toLowerCase().startsWith(t)) return k.key;
    }
    return null;
  }

  /** Clic o punto resuelto en el lienzo. */
  submitPoint(p: Vec2) {
    const pending = this.pending;
    if (!pending) return;
    const req = pending.req;
    const echo = `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
    switch (req.kind) {
      case 'point':
        this.resolve({ kind: 'point', p }, echo);
        break;
      case 'distance': {
        if (!req.base) {
          // el primer clic fija la base; el segundo da la distancia
          this.pending!.req = { ...req, base: p, prompt: { es: 'Segundo punto', en: 'Second point' } };
          this.editor.onRequest(this.pending!.req);
          this.emit();
          return;
        }
        this.resolve({ kind: 'value', value: dist(req.base, p), p }, echo);
        break;
      }
      case 'angle': {
        if (!req.base) {
          this.pending!.req = { ...req, base: p, prompt: { es: 'Segundo punto', en: 'Second point' } };
          this.editor.onRequest(this.pending!.req);
          this.emit();
          return;
        }
        this.resolve({ kind: 'value', value: Math.atan2(p.y - req.base.y, p.x - req.base.x), p }, echo);
        break;
      }
      default:
        break;
    }
  }

  submitSelection(ids: Id[]) {
    const req = this.pending?.req;
    if (req?.kind === 'selection') this.resolve({ kind: 'selection', ids }, `${ids.length} ${this.editor.lang === 'es' ? 'encontrados' : 'found'}`);
  }

  submitEntity(id: Id, p: Vec2) {
    const req = this.pending?.req;
    if (req?.kind === 'entity') this.resolve({ kind: 'entity', id, p });
  }

  submitKeyword(key: string) {
    this.resolve({ kind: 'keyword', key }, key);
  }

  /**
   * Texto de la línea de comandos o de la entrada dinámica. Sin comando activo,
   * ejecuta el comando; Enter vacío repite el último.
   */
  submitText(text: string, opts: { cursorPoint?: Vec2 | null; dynamicRelative?: boolean } = {}) {
    const pending = this.pending;
    const raw = text.trim();
    if (!pending) {
      if (!raw) {
        if (this.lastCommand) this.pushLog('input', '↵');
        this.repeatLast();
        return;
      }
      const [name, ...args] = raw.split(/\s+/);
      void this.execute(name, args);
      return;
    }
    const req = pending.req;
    const lang = this.editor.lang;
    if (!raw) {
      const dv = 'defaultValue' in req ? req.defaultValue : undefined;
      if (dv !== undefined) {
        if (req.kind === 'point') this.resolve({ kind: 'point', p: dv as Vec2 }, '↵');
        else if (req.kind === 'string') this.resolve({ kind: 'string', value: dv as string }, '↵');
        else if (req.kind === 'keyword') this.resolve({ kind: 'keyword', key: dv as string }, '↵');
        else this.resolve({ kind: 'value', value: dv as number }, '↵');
        return;
      }
      if (req.kind === 'selection') {
        this.editor.finishSelectionRequest();
        return;
      }
      if (req.allowNone || req.kind === 'string') {
        if (req.kind === 'string' && !req.allowNone) this.resolve({ kind: 'string', value: '' }, '↵');
        else this.resolve({ kind: 'none' }, '↵');
      }
      return;
    }
    if (req.kind === 'string') {
      this.resolve({ kind: 'string', value: text }, text);
      return;
    }
    const kw = this.matchKeyword(raw, req.keywords);
    if (kw) {
      this.resolve({ kind: 'keyword', key: kw }, raw);
      return;
    }
    const fail = (l: L10n) => this.message('error', l);
    try {
      switch (req.kind) {
        case 'point': {
          const last = req.base ?? this.active?.lastPoint ?? this.lastPoint;
          const parsed = parseCoordinateInput(raw, { lastPoint: last, dynamicRelative: opts.dynamicRelative, angleBase: this.editor.doc.settings.angleBase });
          if (parsed.kind === 'point') {
            this.resolve({ kind: 'point', p: parsed.p }, raw);
            return;
          }
          if (parsed.kind === 'distance') {
            const base = req.base ?? last;
            const cur = opts.cursorPoint;
            if (!base || !cur || dist(base, cur) < 1e-12) {
              fail({ es: 'Distancia directa: mueve el cursor para indicar la dirección desde el último punto.', en: 'Direct distance: move the cursor to show the direction from the last point.' });
              return;
            }
            const d = dist(base, cur);
            const p = { x: base.x + ((cur.x - base.x) / d) * parsed.value, y: base.y + ((cur.y - base.y) / d) * parsed.value };
            this.resolve({ kind: 'point', p }, raw);
            return;
          }
          if (parsed.kind === 'angle-lock') {
            this.editor.setAngleLock(parsed.angle);
            this.message('info', { es: `Anulación de ángulo: ${raw.slice(1)}°`, en: `Angle override: ${raw.slice(1)}°` });
            return;
          }
          fail({ es: `«${raw}» no es un punto válido. Usa x,y · @dx,dy · @distancia<ángulo o una opción.`, en: `"${raw}" is not a valid point. Use x,y · @dx,dy · @distance<angle or an option.` });
          return;
        }
        case 'distance': {
          const parsed = parseCoordinateInput(raw, { lastPoint: req.base });
          if (parsed.kind === 'point' && req.base) {
            this.resolve({ kind: 'value', value: dist(req.base, parsed.p), p: parsed.p }, raw);
            return;
          }
          const v = evaluate(raw);
          if (!Number.isFinite(v) || (v < 0 && !req.allowNegative) || (v === 0 && !req.allowZero)) {
            fail({ es: `Valor no válido: la distancia debe ser ${req.allowZero ? 'no negativa' : 'positiva'}.`, en: `Invalid value: distance must be ${req.allowZero ? 'non-negative' : 'positive'}.` });
            return;
          }
          this.resolve({ kind: 'value', value: v }, raw);
          return;
        }
        case 'angle': {
          const v = parseAngle(raw, this.editor.doc.settings.angleBase);
          if (!Number.isFinite(v)) throw new Error('nan');
          this.resolve({ kind: 'value', value: v }, raw);
          return;
        }
        case 'number': {
          const v = evaluate(raw);
          if (!Number.isFinite(v)) throw new Error('nan');
          if (req.integer && !Number.isInteger(v)) {
            fail({ es: 'Se requiere un número entero.', en: 'An integer is required.' });
            return;
          }
          if (req.min !== undefined && v < req.min) {
            fail({ es: `El valor debe ser ≥ ${req.min}.`, en: `Value must be ≥ ${req.min}.` });
            return;
          }
          if (req.max !== undefined && v > req.max) {
            fail({ es: `El valor debe ser ≤ ${req.max}.`, en: `Value must be ≤ ${req.max}.` });
            return;
          }
          this.resolve({ kind: 'value', value: v }, raw);
          return;
        }
        case 'selection':
          this.editor.selectionKeyword(raw);
          return;
        case 'keyword':
        case 'entity':
          fail({ es: `Opción no reconocida «${raw}».`, en: `Unrecognized option "${raw}".` });
          return;
      }
    } catch {
      fail({ es: `No se pudo interpretar «${raw}».`, en: `Could not interpret "${raw}".` });
    }
    void lang;
  }
}
