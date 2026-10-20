import type { SnapType } from '../model/registry';
import { isPointRequest, precisionToken, type PointModifierKind } from '../app/pointPrecision';
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
  id: number;
  kind: 'command' | 'prompt' | 'input' | 'info' | 'warn' | 'error';
  text: string;
  at: number;
}

interface PointModifierFrame {
  kind: PointModifierKind;
  parent: PendingInput;
  preview: PreviewSpec | null;
  first: Vec2 | null;
}

interface ActiveCommand {
  def: CommandDef;
  abort: AbortController;
  pending: PendingInput | null;
  lastPoint: Vec2 | null;
  doc: Editor['doc'];
  groupOpen: boolean;
  modifiers: PointModifierFrame[];
  suspendedPreview: PreviewSpec | null;
  snapOverride: SnapType[] | null;
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
  private nextLogId = 0;
  private feedbackCommand: ActiveCommand | null = null;
  /** Aviso efímero; nunca forma parte del dibujo ni sustituye al historial. */
  feedback: CommandLogEntry | null = null;
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

  /** Only skip input-free transparent wrappers; an interactive command owns its own snaps. */
  private get pointCommand(): ActiveCommand | null {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const command = this.stack[i];
      if (command.pending) return isPointRequest(command.pending.req) ? command : null;
      if (!command.def.transparent) break;
    }
    return null;
  }
  get pointPending(): PendingInput | null { return this.pointCommand?.pending ?? null; }
  get pointSnapOverride(): SnapType[] | null { return this.pointCommand?.snapOverride ?? null; }
  set pointSnapOverride(types: SnapType[] | null) { const command = this.pointCommand; if (command) command.snapOverride = types; }

  /** Load has already cleared history: detach old commands without ending their old groups. */
  resetForLoad() {
    const previous = this.stack;
    this.stack = [];
    for (const command of previous) {
      command.groupOpen = false;
      command.abort.abort();
      const pending = command.modifiers[0]?.parent ?? command.pending;
      command.pending = null; command.modifiers = [];
      pending?.reject(new CancelError());
    }
    this.lastPoint = null;
    this.emit();
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

  private pushLog(kind: CommandLogEntry['kind'], text: string, command = this.active) {
    const entry = { id: ++this.nextLogId, kind, text, at: Date.now() };
    this.log.push(entry);
    if (kind === 'warn' || kind === 'error') {
      this.feedback = entry;
      this.feedbackCommand = command;
    }
    if (this.log.length > 500) this.log.splice(0, this.log.length - 500);
    this.emit();
  }

  message(kind: 'info' | 'warn' | 'error', l: L10n | string) {
    this.messageFrom(this.active, kind, l);
  }

  private messageFrom(command: ActiveCommand | null, kind: 'info' | 'warn' | 'error', l: L10n | string) {
    this.pushLog(kind, typeof l === 'string' ? l : tr(this.editor.lang, l), command);
  }

  /** Un botón de un aviso anterior nunca debe descartar un error más reciente. */
  dismissFeedback(entry: CommandLogEntry) {
    if (this.feedback !== entry) return;
    this.feedback = null;
    this.feedbackCommand = null;
    this.emit();
  }

  private acceptFeedbackInput() {
    // Una entrada de ZOOM u otro transparente no corrige el rechazo del comando inferior.
    if (this.feedbackCommand !== this.active) return;
    this.feedback = null;
    this.feedbackCommand = null;
  }

  /** Ejecuta por nombre o alias. */
  async execute(nameOrAlias: string, args?: string[]): Promise<void> {
    const def = findCommand(nameOrAlias);
    if (!def) {
      this.message('error', { es: `Comando desconocido «${nameOrAlias}». Escribe ? o usa la paleta de comandos (Ctrl+K).`, en: `Unknown command "${nameOrAlias}". Type ? or open the command palette (Ctrl+K).` });
      return;
    }
    return this.run(def, args, nameOrAlias.trim().replace(/^[_.'-]+/, '').toUpperCase());
  }

  /** `invokedAs`: nombre o alias escrito (p. ej. DIMSTYLE abre el administrador en su pestaña). */
  async run(def: CommandDef, args?: string[], invokedAs?: string): Promise<void> {
    if (this.busy && !def.transparent) this.cancelAll();
    const doc = this.editor.doc;
    const active: ActiveCommand = {
      def,
      abort: new AbortController(),
      pending: null,
      lastPoint: this.lastPoint,
      doc,
      groupOpen: false,
      modifiers: [],
      snapOverride: null,
      suspendedPreview: def.transparent ? this.editor.preview : null,
    };
    this.stack.push(active);
    if (!def.transparent) {
      this.feedback = null;
      this.feedbackCommand = null;
      this.lastCommand = def;
      this.history = [def.name, ...this.history.filter((h) => h !== def.name)].slice(0, 50);
    }
    this.pushLog('command', `${def.transparent && this.stack.length > 1 ? "'" : ''}${def.name}`);
    if (def.ui) requestUi(def.ui, undefined, invokedAs ?? def.name);
    const grouped = !def.readOnly;
    if (grouped) {
      doc.history.beginGroup(tr(this.editor.lang, def.label));
      active.groupOpen = true;
    }
    let failed = false;
    try {
      await def.run(this.api(active), args);
    } catch (err) {
      const abortedByCommand =
        active.abort.signal.aborted &&
        ((err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError'));
      if (err instanceof CancelError || abortedByCommand || active.abort.signal.aborted) {
        this.pushLog('info', this.editor.lang === 'es' ? '*Cancelar*' : '*Cancel*');
      } else {
        failed = true;
        if (doc.activeTransaction) doc.activeTransaction.rollback();
        const msg = err instanceof CommandError ? tr(this.editor.lang, err.l10n) : err instanceof Error ? err.message : String(err);
        this.pushLog('error', `${def.name}: ${msg}`, active);
        console.error(err);
      }
    } finally {
      this.finishGroup(active, failed);
      const i = this.stack.indexOf(active);
      if (i >= 0) {
        this.stack.splice(i, 1);
        if (active.lastPoint && (!def.transparent || !this.active)) this.lastPoint = active.lastPoint;
        if (def.transparent && this.active) {
          this.editor.setPreview(active.suspendedPreview);
          if (this.pending) this.editor.onRequest(this.pending.req);
          this.editor.pointerMove(this.editor.hover.screen);
        } else {
          this.editor.setPreview(null);
          this.editor.onCommandEnd(def);
        }
      }
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
    const p = a.modifiers[0]?.parent ?? a.pending;
    a.modifiers = [];
    a.pending = null;
    p?.reject(new CancelError());
    this.finishGroup(a, false);
    this.emit();
  }

  private finishGroup(active: ActiveCommand, abort: boolean) {
    if (!active.groupOpen) return;
    active.groupOpen = false;
    if (abort) active.doc.history.abortGroup();
    else active.doc.history.endGroup();
  }

  cancelAll() {
    while (this.stack.length) {
      const active = this.active!;
      const before = this.stack.length;
      this.cancel();
      // el finally de run() retira el comando; si el comando no estaba esperando, sácalo
      if (this.stack.length === before) {
        this.stack.pop();
        if (active.lastPoint) this.lastPoint = active.lastPoint;
        this.editor.setPreview(null);
        this.editor.onCommandEnd(active.def);
      }
    }
  }

  /** Modificadores acotados del punto actual; no son comandos ni escriben en el dibujo. */
  beginPointModifier(kind: PointModifierKind): boolean {
    const active = this.active, parent = this.pending;
    if (!active || !parent || !isPointRequest(parent.req)) return false;
    if (active.modifiers.length >= 8) {
      this.message('error', { es: 'Máximo de 8 modificadores de punto anidados.', en: 'A maximum of 8 nested point modifiers is allowed.' });
      return false;
    }
    const frame: PointModifierFrame = { kind, parent, preview: this.editor.preview, first: null };
    active.modifiers.push(frame);
    this.editor.setPreview(null);
    this.installModifierInput(active, frame);
    return true;
  }

  private installModifierInput(active: ActiveCommand, frame: PointModifierFrame) {
    const from = frame.kind === 'from', first = frame.first;
    const prompt = first
      ? from ? { es: 'FROM: desplazamiento desde la base (@ relativo, # absoluto)', en: 'FROM: offset from base (@ relative, # absolute)' }
        : { es: 'M2P: segundo punto', en: 'M2P: second point' }
      : from ? { es: 'FROM: precise el punto base', en: 'FROM: specify base point' }
        : { es: 'M2P: primer punto', en: 'M2P: first point' };
    const req: InputRequest = { kind: 'point', prompt, base: first, noOrtho: !from || !first, rubber: first ? 'line' : 'none' };
    active.pending = {
      req,
      reject: frame.parent.reject,
      resolve: response => {
        if (response.kind !== 'point') return;
        if (!frame.first) {
          frame.first = response.p;
          this.installModifierInput(active, frame);
          return;
        }
        const result = from ? response.p : { x: frame.first.x / 2 + response.p.x / 2, y: frame.first.y / 2 + response.p.y / 2 };
        active.modifiers.pop();
        active.pending = frame.parent;
        this.editor.setPreview(frame.preview);
        this.editor.onRequest(frame.parent.req);
        this.submitPoint(result);
      },
    };
    this.pushLog('prompt', this.promptText(req));
    this.editor.onRequest(req);
    this.emit();
  }

  cancelPointModifier(): boolean {
    const active = this.active, frame = active?.modifiers.pop();
    if (!active || !frame) return false;
    active.pending = frame.parent;
    this.editor.osnapOverride = null;
    this.editor.setPreview(frame.preview);
    this.editor.onRequest(frame.parent.req);
    this.emit();
    return true;
  }

  private api(active: ActiveCommand): CommandApi {
    const fallbackLastPoint = () => this.lastPoint;
    const editor = this.editor;
    const request = (req: InputRequest) =>
      new Promise<InputResponse>((resolve, reject) => {
        if (active.abort.signal.aborted) {
          reject(new CancelError());
          return;
        }
        active.pending = { req, resolve, reject };
        this.pushLog('prompt', this.promptText(req));
        editor.onRequest(req);
        this.emit();
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
        if (active.abort.signal.aborted) throw new CancelError();
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
      info: (m) => this.messageFrom(active, 'info', m),
      warn: (m) => this.messageFrom(active, 'warn', m),
      get lastPoint() {
        return active.lastPoint ?? fallbackLastPoint();
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
    const finitePoint = (value: Vec2) => Number.isFinite(value.x) && Number.isFinite(value.y);
    if ((res.kind === 'point' && !finitePoint(res.p)) || (res.kind === 'value' && (!Number.isFinite(res.value) || (res.p && !finitePoint(res.p))))) {
      this.message('error', { es: 'El resultado debe ser finito.', en: 'The result must be finite.' });
      return;
    }
    this.acceptFeedbackInput();
    if (isPointRequest(p.req) && (res.kind === 'point' || res.kind === 'value')) this.editor.osnapOverride = null;
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
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      this.message('error', { es: 'El punto debe tener coordenadas finitas.', en: 'Point coordinates must be finite.' });
      return;
    }
    const echo = `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
    switch (req.kind) {
      case 'point':
        this.resolve({ kind: 'point', p }, echo);
        break;
      case 'distance': {
        if (!req.base) {
          this.acceptFeedbackInput();
          this.editor.osnapOverride = null;
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
          this.acceptFeedbackInput();
          this.editor.osnapOverride = null;
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
      this.resolve({ kind: 'string', value: text }, req.inputLabel ? tr(lang, req.inputLabel) : text);
      return;
    }
    const kw = this.matchKeyword(raw, req.keywords);
    if (kw) {
      this.resolve({ kind: 'keyword', key: kw }, raw);
      return;
    }
    if (isPointRequest(req)) {
      const precision = precisionToken(raw);
      if (precision) {
        if ('snap' in precision) this.editor.setPointSnapOverride(precision.snap);
        else this.beginPointModifier(precision.modifier);
        return;
      }
    }
    const fail = (l: L10n) => this.message('error', l);
    try {
      switch (req.kind) {
        case 'point': {
          const last = req.base ?? this.active?.lastPoint ?? this.lastPoint;
          const parsed = parseCoordinateInput(raw, { lastPoint: last, dynamicRelative: this.active?.modifiers.at(-1)?.kind === 'from' && !!this.active.modifiers.at(-1)?.first ? true : opts.dynamicRelative, angleBase: this.editor.doc.settings.angleBase });
          if (parsed.kind === 'point') {
            if (!Number.isFinite(parsed.p.x) || !Number.isFinite(parsed.p.y)) throw new Error('non-finite point');
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
