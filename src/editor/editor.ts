import type { BBox } from '../geometry/bbox';
import { boxFromCorners, emptyBox, expandBox, inflate, isEmptyBox, transformBox } from '../geometry/bbox';
import type { Curve } from '../geometry/curves';
import { distanceToCurve } from '../geometry/curves';
import type { Mat2D } from '../geometry/matrix';
import { applyToPoint, invert } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec';
import { dist } from '../geometry/vec';
import type { DrawingDiff } from '../audit/compare';
import { parameterPoints } from '../blocks/authoring';
import { CancelError, type CommandDef, type InputRequest, type Lang, type PreviewSpec } from '../commands/types';
import { CommandRunner } from '../commands/runner';
import { setUserAliases } from '../commands/registry';
import type { CadDocument } from '../document/document';
import type { Entity, EntityType, Id, ViewportEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { ModelContext } from '../model/context';
import type { GripDef } from '../model/registry';
import { kindOf } from '../model/registry';
import type { VisibilityOptions } from '../model/visibility';
import { entityEditable, entityVisible } from '../model/visibility';
import { viewportMatrix, viewportOutline } from '../model/kinds/media';
import { pointInPolygon } from '../geometry/polyline';
import { VIEWPORT_VIEW_LABEL } from '../history/history';
import { pickAt, selectByFence, selectInBox, selectInPolygon } from '../selection/pick';
import { expandGroups, SelectionSet } from '../selection/selectionSet';
import type { ResolvedPoint } from '../snap/snapEngine';
import { AcquisitionState, resolvePoint } from '../snap/snapEngine';
import type { SnapType } from '../model/registry';
import { SpatialIndex } from '../spatial/spatialIndex';
import { ViewTransform } from '../view/viewTransform';
import type { Preferences } from './preferences';
import { loadPreferences, savePreferences } from './preferences';

export interface HoverState {
  screen: Vec2;
  world: Vec2;
  resolved: ResolvedPoint | null;
  entityId: Id | null;
  grip: { entityId: Id; grip: GripDef } | null;
  inside: boolean;
}

export interface CyclingState {
  hits: Id[];
  screen: Vec2;
  world: Vec2;
  index: number;
  forRequest: 'selection' | 'entity' | 'idle';
}

export interface BlockEditSession {
  blockId: Id;
  previousSpace: Id;
  /** matriz de la instancia cuando se edita en contexto */
  inPlace?: { insertId: Id; matrix: Mat2D };
  testing?: { insertId: Id } | null;
}

export interface WindowState {
  startScreen: Vec2;
  start: Vec2;
  current: Vec2;
  dragging: boolean;
}

export type EditorEvent = 'doc' | 'view' | 'overlay' | 'selection' | 'command' | 'prefs' | 'space';

export interface GripEditContext {
  refs: { entityId: Id; gripId: string; p: Vec2 }[];
  base: Vec2;
}

/**
 * Controlador del editor. No depende de React: la interfaz se suscribe a eventos.
 * Las coordenadas del documento son siempre de mundo; la conversión a pantalla vive
 * en `ViewTransform`.
 */
export class Editor {
  readonly ctx: ModelContext;
  readonly index: SpatialIndex;
  readonly selection: SelectionSet;
  readonly runner: CommandRunner;
  prefs: Preferences;
  space: Id = MODEL_SPACE_ID;
  views = new Map<Id, ViewTransform>();
  activeViewportId: Id | null = null;
  blockEdit: BlockEditSession | null = null;
  /** comparación activa con otra revisión (COMPARE) */
  compare: { diff: DrawingDiff; label: string } | null = null;
    /** estado de autoría del Editor de bloques (estado de visibilidad mostrado) */
  blockEditState: { currentVisibility: string | null } = { currentVisibility: null };
  preview: PreviewSpec | null = null;
  hidden = new Set<Id>();
  isolated: Set<Id> | null = null;
  hover: HoverState = { screen: { x: 0, y: 0 }, world: { x: 0, y: 0 }, resolved: null, entityId: null, grip: null, inside: false };
  /** dedo situando un punto en pantalla táctil: activa la lupa y amplía la apertura de referencia */
  touchPoint: Vec2 | null = null;
  acquisition = new AcquisitionState();
  candidateIndex = 0;
  angleLock: number | null = null;
  osnapOverride: SnapType[] | null = null;
  window: WindowState | null = null;
  fence: Vec2[] | null = null;
  polygonSelect: { points: Vec2[]; crossing: boolean } | null = null;
  selectionMode: 'add' | 'remove' = 'add';
  selectionBoxMode: 'auto' | 'window' | 'crossing' = 'auto';
  requestIds: Id[] = [];
  cycling: CyclingState | null = null;
  gripContext: GripEditContext | null = null;
  /** último punto designado con su referencia a objeto (para asociatividad) */
  lastPick: ResolvedPoint | null = null;
  shiftDown = false;
  lastCreated: Id | null = null;
  fileName = '';
  private listeners = new Map<EditorEvent, Set<() => void>>();
  private panning: { screen: Vec2 } | null = null;
  private downAt: { screen: Vec2; time: number; button: number } | null = null;
  versions: Record<EditorEvent, number> = { doc: 0, view: 0, overlay: 0, selection: 0, command: 0, prefs: 0, space: 0 };

  constructor(public doc: CadDocument, prefs?: Preferences) {
    this.prefs = prefs ?? loadPreferences();
    setUserAliases(this.prefs.aliases);
    this.ctx = new ModelContext(doc);
    this.index = new SpatialIndex(this.ctx);
    this.selection = new SelectionSet(doc);
    this.runner = new CommandRunner(this);
    doc.subscribe((e) => {
      if (e.source === 'load') {
        this.selection.clear();
        this.space = MODEL_SPACE_ID;
        this.views.clear();
        this.hidden.clear();
        this.isolated = null;
      }
      for (const c of e.changes) {
        if (c.coll === 'entities' && !c.before && c.after) this.lastCreated = c.id;
      }
      this.emit('doc');
    });
    this.selection.subscribe(() => this.emit('selection'));
    this.runner.subscribe(() => this.emit('command'));
  }

  // ------------------------------------------------------------------ eventos

  on(ev: EditorEvent, fn: () => void): () => void {
    let set = this.listeners.get(ev);
    if (!set) this.listeners.set(ev, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit(ev: EditorEvent) {
    this.versions[ev]++;
    for (const l of this.listeners.get(ev) ?? []) l();
    if (ev !== 'overlay' && ev !== 'view') for (const l of this.listeners.get('overlay') ?? []) l();
  }

  get lang(): Lang {
    return this.prefs.lang;
  }

  setPrefs(patch: Partial<Preferences>) {
    this.prefs = { ...this.prefs, ...patch };
    if (patch.aliases) setUserAliases(patch.aliases);
    savePreferences(this.prefs);
    this.emit('prefs');
    this.emit('view');
  }

  // ------------------------------------------------------------------ espacios y vistas

  get view(): ViewTransform {
    let v = this.views.get(this.space);
    if (!v) {
      v = new ViewTransform();
      const any = this.views.values().next().value as ViewTransform | undefined;
      if (any) v.setSize(any.width, any.height);
      this.views.set(this.space, v);
      if (this.space !== MODEL_SPACE_ID && !this.doc.data.blocks.has(this.space)) this.fitLayout(v);
      else {
        const ext = this.index.extents(this.space);
        if (!isEmptyBox(ext)) v.fit(inflate(ext, 1));
        else {
          v.scale = 3;
          v.center = { x: 100, y: 70 };
        }
      }
    }
    return v;
  }

  setViewportSize(w: number, h: number) {
    for (const v of this.views.values()) v.setSize(w, h);
    this.view.setSize(w, h);
    this.emit('view');
  }

  get spaceKind(): 'model' | 'layout' | 'block' {
    if (this.space === MODEL_SPACE_ID) return 'model';
    if (this.doc.data.layouts.has(this.space)) return 'layout';
    return 'block';
  }

  setSpace(id: Id) {
    if (this.space === id) return;
    this.runner.cancelAll();
    this.selection.clear();
    this.activeViewportId = null;
    this.space = id;
    const layout = this.doc.data.layouts.get(id);
    this.ctx.sheetName = layout?.name ?? (id === MODEL_SPACE_ID ? (this.lang === 'es' ? 'Modelo' : 'Model') : (this.doc.data.blocks.get(id)?.name ?? ''));
    this.emit('space');
    this.emit('view');
  }

  private fitLayout(v: ViewTransform) {
    const layout = this.doc.data.layouts.get(this.space);
    if (!layout) return;
    const w = layout.page.orientation === 'landscape' ? Math.max(layout.page.width, layout.page.height) : Math.min(layout.page.width, layout.page.height);
    const h = layout.page.orientation === 'landscape' ? Math.min(layout.page.width, layout.page.height) : Math.max(layout.page.width, layout.page.height);
    v.fit({ minX: 0, minY: 0, maxX: w, maxY: h }, 40);
  }

  /** Espacio al que se dirige la entrada (el modelo si se trabaja dentro de un viewport). */
  get inputOwner(): Id {
    return this.activeViewportId ? MODEL_SPACE_ID : this.space;
  }

  get activeViewport(): ViewportEntity | null {
    const e = this.activeViewportId ? this.doc.entity(this.activeViewportId) : null;
    return e && e.type === 'viewport' ? e : null;
  }

  /** Matriz del espacio de entrada → coordenadas de la vista actual. */
  get ownerToSpace(): Mat2D | null {
    const vp = this.activeViewport;
    if (vp) return viewportMatrix(vp);
    if (this.blockEdit?.inPlace && this.space === this.blockEdit.blockId) return null;
    return null;
  }

  screenToOwner(screen: Vec2): Vec2 {
    const w = this.view.toWorld(screen);
    const m = this.ownerToSpace;
    return m ? applyToPoint(invert(m), w) : w;
  }

  ownerToScreen(p: Vec2): Vec2 {
    const m = this.ownerToSpace;
    return this.view.toScreen(m ? applyToPoint(m, p) : p);
  }

  /** Unidades del propietario por píxel de pantalla. */
  get ownerPerPixel(): number {
    const vp = this.activeViewport;
    return this.view.worldPerPixel / (vp ? vp.scale : 1);
  }

  visibility(): VisibilityOptions {
    return { hidden: this.hidden, isolated: this.isolated, viewport: this.activeViewport };
  }

  /**
   * Objetos de la definición en edición que no pertenecen al estado de visibilidad actual.
   * Se dibujan atenuados y siguen siendo designables para poder cambiarlos de estado.
   */
  blockStateHidden(): Set<Id> | null {
    const s = this.blockEdit;
    if (!s || this.space !== s.blockId) return null;
    const vis = this.doc.data.blocks.get(s.blockId)?.dynamic?.parameters.find((p) => p.type === 'visibility');
    if (!vis || vis.type !== 'visibility') return null;
    const name = this.blockEditState.currentVisibility ?? vis.defaultState;
    const state = vis.states.find((x) => x.name === name) ?? vis.states[0];
    if (!state) return null;
    const visible = new Set(state.visible);
    const out = new Set<Id>();
    for (const e of this.doc.entitiesOf(s.blockId)) if (!visible.has(e.id)) out.add(e.id);
    return out;
  }

  // ------------------------------------------------------------------ zoom

  // ------------------------------------------------------------------ viewport activo

  /** Viewport activo con visualización no bloqueada: la navegación cambia su vista del modelo. */
  get navigableViewport(): ViewportEntity | null {
    const vp = this.activeViewport;
    return vp && !vp.displayLocked ? vp : null;
  }

  /** Activa un viewport (trabajo en modelo a través de él) o vuelve al papel con null. */
  activateViewport(id: Id | null) {
    if (this.activeViewportId === id) return;
    this.runner.cancelAll();
    this.selection.clear();
    this.activeViewportId = id;
    this.emit('space');
    this.emit('view');
  }

  /** Doble clic en una presentación: dentro de un viewport lo activa; fuera vuelve al papel. */
  doubleClick(screen: Vec2): boolean {
    if (this.spaceKind !== 'layout' || this.runner.busy) return false;
    const vp = this.viewportAt(this.view.toWorld(screen));
    this.activateViewport(vp ? vp.id : null);
    return true;
  }

  /** Viewport de la presentación actual que contiene un punto de papel. */
  viewportAt(paper: Vec2): ViewportEntity | null {
    if (this.spaceKind !== 'layout') return null;
    const list = this.doc.entitiesOf(this.space).filter((e): e is ViewportEntity => e.type === 'viewport' && e.on && entityVisible(this.doc, e));
    for (let i = list.length - 1; i >= 0; i--) if (pointInPolygon(paper, viewportOutline(list[i]))) return list[i];
    return null;
  }

  private setViewportView(vp: ViewportEntity, viewCenter: Vec2, scale: number) {
    if (!(scale > 0) || !Number.isFinite(scale) || !Number.isFinite(viewCenter.x) || !Number.isFinite(viewCenter.y)) return;
    this.doc.transact(VIEWPORT_VIEW_LABEL, (tx) => tx.updateEntity<ViewportEntity>(vp.id, { viewCenter, scale, scaleName: undefined }));
  }

  /** Vector de papel → vector de modelo del viewport (deshace giro y escala). */
  private paperToModelVector(vp: ViewportEntity, d: Vec2): Vec2 {
    const c = Math.cos(-vp.viewTwist);
    const s = Math.sin(-vp.viewTwist);
    return { x: (c * d.x - s * d.y) / vp.scale, y: (s * d.x + c * d.y) / vp.scale };
  }

  private zoomViewportAt(vp: ViewportEntity, screen: Vec2, factor: number) {
    const pm = this.screenToOwner(screen);
    const pp = applyToPoint(viewportMatrix(vp), pm);
    const scale = vp.scale * factor;
    // pp = centro + R·k'·(pm − vc')  ⇒  vc' = pm − R⁻¹·(pp − centro)/k'
    const d = this.paperToModelVector({ ...vp, scale }, { x: pp.x - vp.center.x, y: pp.y - vp.center.y });
    this.setViewportView(vp, { x: pm.x - d.x, y: pm.y - d.y }, scale);
  }

  private panViewportPixels(vp: ViewportEntity, dx: number, dy: number) {
    const dm = this.paperToModelVector(vp, { x: dx / this.view.scale, y: -dy / this.view.scale });
    this.setViewportView(vp, { x: vp.viewCenter.x - dm.x, y: vp.viewCenter.y - dm.y }, vp.scale);
  }

  zoomExtents() {
    const nvp = this.navigableViewport;
    if (nvp) {
      const ext = this.index.extents(MODEL_SPACE_ID, (id) => {
        const e = this.doc.entity(id);
        return !!e && entityVisible(this.doc, e, { viewport: nvp });
      });
      if (!isEmptyBox(ext)) {
        const k = 0.95 * Math.min(nvp.width / Math.max(ext.maxX - ext.minX, 1e-9), nvp.height / Math.max(ext.maxY - ext.minY, 1e-9));
        this.setViewportView(nvp, { x: (ext.minX + ext.maxX) / 2, y: (ext.minY + ext.maxY) / 2 }, k);
      }
      return;
    }
    const owner = this.space;
    const ext = this.index.extents(owner, (id) => {
      const e = this.doc.entity(id);
      return !!e && entityVisible(this.doc, e, { hidden: this.hidden, isolated: this.isolated });
    });
    // en el Editor de bloques el encuadre incluye los parámetros y sus etiquetas
    const def = this.blockEdit && !this.blockEdit.testing && owner === this.blockEdit.blockId ? this.doc.data.blocks.get(owner)?.dynamic : undefined;
    for (const p of def?.parameters ?? []) for (const q of parameterPoints(p)) expandBox(ext, { minX: q.x, minY: q.y, maxX: q.x, maxY: q.y });
    if (this.spaceKind === 'layout' && isEmptyBox(ext)) this.fitLayout(this.view);
    else if (!isEmptyBox(ext)) {
      const pad = Math.max(ext.maxX - ext.minX, ext.maxY - ext.minY) * (def?.parameters.length ? 0.1 : 0.02) || 1;
      this.view.fit(inflate(ext, pad));
    }
    this.emit('view');
  }

  zoomToBox(box: BBox) {
    if (isEmptyBox(box)) return;
    this.view.fit(box, 24);
    this.emit('view');
  }

  zoomSelection(ids: Id[] = [...this.selection.list]) {
    const b = emptyBox();
    for (const id of ids) {
      const e = this.doc.entity(id);
      if (e) {
        const eb = kindOf(e).bbox(e, this.ctx);
        if (Number.isFinite(eb.minX)) expandBox(b, eb);
      }
    }
    if (isEmptyBox(b)) return;
    const m = this.ownerToSpace;
    const box = m ? transformBox(b, m) : b;
    const pad = Math.max(box.maxX - box.minX, box.maxY - box.minY) * 0.15 || 1;
    this.zoomToBox(inflate(box, pad));
  }

  zoomBy(factor: number, screen?: Vec2) {
    this.view.zoomAt(screen ?? { x: this.view.width / 2, y: this.view.height / 2 }, factor);
    this.emit('view');
  }

  // ------------------------------------------------------------------ selección

  isSelectable(id: Id, types?: EntityType[], allowLocked = false): boolean {
    const e = this.doc.entity(id);
    if (!e) return false;
    if (types && !types.includes(e.type)) return false;
    if (!allowLocked && !entityEditable(this.doc, e)) return false;
    return entityVisible(this.doc, e, this.visibility());
  }

  selectAll() {
    const ids: Id[] = [];
    for (const e of this.doc.data.entities.values()) if (e.owner === this.inputOwner && this.isSelectable(e.id)) ids.push(e.id);
    this.applySelection(ids, 'add');
  }

  private applySelection(ids: Id[], mode: 'add' | 'remove' | 'set') {
    const req = this.runner.pending?.req;
    const types = req?.kind === 'selection' ? req.types : undefined;
    const allowLocked = req?.kind === 'selection' ? req.allowLocked : false;
    let filtered = ids.filter((id) => this.isSelectable(id, types, allowLocked));
    const lockedCount = ids.length - filtered.length;
    if (lockedCount > 0 && !types) this.runner.message('info', { es: `${lockedCount} objeto(s) en capa bloqueada u ocultos se omitieron.`, en: `${lockedCount} object(s) on locked layers or hidden were skipped.` });
    filtered = expandGroups(this.doc, filtered);
    if (req?.kind === 'selection') {
      const set = new Set(this.requestIds);
      if (mode === 'remove') filtered.forEach((id) => set.delete(id));
      else filtered.forEach((id) => set.add(id));
      this.requestIds = [...set];
      if (req.single && this.requestIds.length) {
        this.runner.submitSelection(this.requestIds.slice(0, 1));
        this.requestIds = [];
      }
      this.emit('overlay');
      return;
    }
    if (mode === 'remove') this.selection.remove(filtered);
    else if (mode === 'set') this.selection.set(filtered);
    else this.selection.add(filtered);
  }

  /** Objeto designable más cercano a un punto (unidades del propietario). */
  pickEntityAt(p: Vec2, types?: EntityType[]): Id | null {
    const tol = this.prefs.pickboxPx * this.ownerPerPixel;
    const hits = pickAt(this.ctx, this.index, this.inputOwner, p, tol, types ? { types } : undefined, this.visibility());
    return hits[0]?.id ?? null;
  }

  addToRequestSelection(ids: Id[]) {
    this.applySelection(ids, 'add');
  }

  finishSelectionRequest() {
    const ids = this.requestIds;
    this.requestIds = [];
    this.runner.submitSelection(ids);
  }

  selectionKeyword(raw: string) {
    const t = raw.trim().toLowerCase();
    const set = (ids: Id[]) => this.applySelection(ids, this.selectionMode);
    const m = (es: string, en: string) => this.runner.message('info', { es, en });
    if (['all', 'todo', 'to', 'tod'].includes(t)) {
      const ids: Id[] = [];
      for (const e of this.doc.data.entities.values()) if (e.owner === this.inputOwner) ids.push(e.id);
      set(ids);
    } else if (['l', 'last', 'u', 'ultimo', 'último'].includes(t)) {
      if (this.lastCreated) set([this.lastCreated]);
    } else if (['p', 'previous', 'previo', 'pr'].includes(t)) {
      set([...this.selection.previous]);
    } else if (['w', 'window', 'v', 'ventana'].includes(t)) {
      this.selectionBoxMode = 'window';
      m('Designa la primera esquina de la ventana.', 'Specify first corner of the window.');
    } else if (['c', 'crossing', 'captura'].includes(t)) {
      this.selectionBoxMode = 'crossing';
      m('Designa la primera esquina de la captura.', 'Specify first corner of the crossing window.');
    } else if (['f', 'fence', 'b', 'borde'].includes(t)) {
      this.fence = [];
      m('Designa los puntos del borde; Enter para terminar.', 'Specify fence points; Enter to finish.');
    } else if (['wp', 'vp', 'cp', 'pc'].includes(t)) {
      this.polygonSelect = { points: [], crossing: t === 'cp' || t === 'pc' };
      m('Designa los vértices del polígono; Enter para terminar.', 'Specify polygon vertices; Enter to finish.');
    } else if (['r', 'remove', 'eliminar', 'q', 'quitar'].includes(t)) {
      this.selectionMode = 'remove';
      m('Modo quitar objetos.', 'Remove objects mode.');
    } else if (['a', 'add', 'añadir', 'anadir'].includes(t)) {
      this.selectionMode = 'add';
      m('Modo añadir objetos.', 'Add objects mode.');
    } else {
      this.runner.message('error', { es: `Opción de selección no válida «${raw}». Usa Todo, Último, Previo, Ventana, Captura, Borde, PV/PC, Quitar, Añadir.`, en: `Invalid selection option "${raw}". Use All, Last, Previous, Window, Crossing, Fence, WP/CP, Remove, Add.` });
    }
    this.emit('overlay');
  }

  // ------------------------------------------------------------------ vista previa y comandos

  setPreview(p: PreviewSpec | null) {
    this.preview = p;
    this.emit('overlay');
  }

  onRequest(req: InputRequest) {
    this.candidateIndex = 0;
    this.window = null;
    if (req.kind === 'selection') {
      this.requestIds = [];
      this.selectionMode = 'add';
      this.selectionBoxMode = 'auto';
      this.fence = null;
      this.polygonSelect = null;
    }
    this.updatePreview();
    this.emit('overlay');
  }

  onCommandEnd(_def: CommandDef) {
    this.requestIds = [];
    this.window = null;
    this.fence = null;
    this.polygonSelect = null;
    this.angleLock = null;
    this.osnapOverride = null;
    this.acquisition.clear();
    this.emit('overlay');
  }

  setAngleLock(angle: number | null) {
    this.angleLock = angle;
    this.emit('overlay');
  }

  /** Ejecuta un comando por nombre desde la interfaz. */
  command(name: string, args?: string[]): Promise<void> {
    return this.runner.execute(name, args);
  }

  // ------------------------------------------------------------------ resolución de puntos

  private pendingBase(): Vec2 | null {
    const req = this.runner.pending?.req;
    if (!req) return null;
    if ((req.kind === 'point' || req.kind === 'distance' || req.kind === 'angle') && req.base) return req.base;
    return null;
  }

  /** `force`: aplica referencias a objetos aunque ninguna orden pida un punto (arrastrar y soltar). */
  resolveCursor(screen: Vec2, opts: { force?: boolean } = {}): ResolvedPoint {
    const owner = this.inputOwner;
    const cursor = this.screenToOwner(screen);
    const req = this.runner.pending?.req;
    const pointLike = req && (req.kind === 'point' || req.kind === 'distance' || req.kind === 'angle');
    const gripActive = !!this.gripContext;
    if (!pointLike && !gripActive && !opts.force) {
      return { p: cursor, kind: 'free', guides: [], candidates: [], candidateIndex: 0, acquired: [] };
    }
    const base = this.pendingBase() ?? (gripActive ? this.gripContext!.base : null) ?? this.runner.lastPoint;
    const noSnap = req?.kind === 'point' && req.noSnap;
    const settings = this.touchPoint ? { ...this.prefs.snap, aperturePx: this.prefs.snap.aperturePx * 2 } : this.prefs.snap;
    const exclude = new Set<Id>(this.gripContext?.refs.map((r) => r.entityId) ?? []);
    const extraCurves: Curve[] = [];
    if (this.preview?.entities) for (const pe of this.preview.entities) if (pe.owner === owner) try {
      extraCurves.push(...kindOf(pe).curves(pe, this.ctx));
    } catch {
      /* vista previa sin geometría */
    }
    let resolved = resolvePoint({
      ctx: this.ctx,
      index: this.index,
      owner,
      cursor,
      worldPerPixel: this.ownerPerPixel,
      settings: noSnap ? { ...settings, osnap: false, otrack: false } : { ...settings, ortho: settings.ortho && !(req?.kind === 'point' && req.noOrtho) },
      override: this.osnapOverride,
      lastPoint: this.pendingBase() ?? (gripActive ? this.gripContext!.base : null),
      vis: this.visibility(),
      acquisition: this.acquisition,
      exclude,
      extraCurves: extraCurves.length < 200 ? extraCurves : undefined,
      candidateIndex: this.candidateIndex,
      shiftOrtho: this.shiftDown,
    });
    if (this.angleLock !== null && base) {
      const d = Math.hypot(cursor.x - base.x, cursor.y - base.y);
      const u = { x: Math.cos(this.angleLock), y: Math.sin(this.angleLock) };
      const along = (cursor.x - base.x) * u.x + (cursor.y - base.y) * u.y;
      resolved = { ...resolved, p: { x: base.x + u.x * along, y: base.y + u.y * along }, kind: 'polar', guides: [{ from: base, to: { x: base.x + u.x * along, y: base.y + u.y * along } }] };
      void d;
    }
    return resolved;
  }

  private updatePreview() {
    const req = this.runner.pending?.req;
    const p = this.hover.resolved?.p ?? this.hover.world;
    if (req?.preview) {
      try {
        this.preview = req.preview(p);
      } catch (err) {
        if (!(err instanceof CancelError)) this.preview = null;
      }
    }
  }

  // ------------------------------------------------------------------ grips

  gripsFor(ids: readonly Id[]): { entityId: Id; grip: GripDef }[] {
    const out: { entityId: Id; grip: GripDef }[] = [];
    if (ids.length > 100) return out;
    for (const id of ids) {
      const e = this.doc.entity(id);
      if (!e || !entityEditable(this.doc, e)) continue;
      try {
        for (const g of kindOf(e).grips(e, this.ctx)) out.push({ entityId: id, grip: g });
      } catch {
        /* entidad sin grips */
      }
    }
    return out;
  }

  private gripAt(screen: Vec2): { entityId: Id; grip: GripDef } | null {
    if (this.runner.busy) return null;
    const size = this.prefs.gripSizePx + 3;
    let best: { entityId: Id; grip: GripDef } | null = null;
    let bestD = Infinity;
    for (const g of this.gripsFor(this.selection.list)) {
      const s = this.ownerToScreen(g.grip.p);
      const d = Math.max(Math.abs(s.x - screen.x), Math.abs(s.y - screen.y));
      if (d <= size && d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best;
  }

  private startGripEdit(hit: { entityId: Id; grip: GripDef }) {
    // Todos los grips coincidentes de la selección se mueven juntos
    const refs = this.gripsFor(this.selection.list)
      .filter((g) => dist(g.grip.p, hit.grip.p) <= this.ownerPerPixel * 0.5 && !g.grip.paramId === !hit.grip.paramId)
      .map((g) => ({ entityId: g.entityId, gripId: g.grip.id, p: g.grip.p }));
    this.gripContext = { refs, base: hit.grip.p };
    this.command('_GRIP');
  }

  // ------------------------------------------------------------------ entrada de puntero

  pointerMove(screen: Vec2, mods: { shift?: boolean; buttons?: number } = {}) {
    this.shiftDown = !!mods.shift;
    if (this.panning) {
      const vp = this.navigableViewport;
      if (vp) this.panViewportPixels(vp, screen.x - this.panning.screen.x, screen.y - this.panning.screen.y);
      else {
        this.view.panPixels(screen.x - this.panning.screen.x, screen.y - this.panning.screen.y);
        this.emit('view');
      }
      this.panning = { screen };
    }
    const world = this.screenToOwner(screen);
    const resolved = this.resolveCursor(screen);
    // adquisición por pausa (OTRACK, extensión, paralela)
    const cand = resolved.candidates[resolved.candidateIndex];
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (cand && (this.prefs.snap.otrack || this.prefs.snap.types.includes('extension') || this.prefs.snap.types.includes('parallel'))) {
      const key = `${cand.type}|${cand.p.x.toFixed(6)}|${cand.p.y.toFixed(6)}`;
      this.acquisition.dwell(key, now, 350, () => {
        if (this.prefs.snap.otrack && cand.type !== 'nearest' && cand.type !== 'extension' && cand.type !== 'parallel') this.acquisition.togglePoint(cand.p);
        const e = cand.entityId ? this.doc.entity(cand.entityId) : null;
        if (e) {
          // la curva del objeto que pasa por el punto adquirido (extremo de línea/arco)
          let best: Curve | null = null;
          let bestD = Infinity;
          for (const c of kindOf(e).curves(e, this.ctx)) {
            const d = distanceToCurve(c, cand.p);
            if (d < bestD) {
              bestD = d;
              best = c;
            }
          }
          if (best && bestD <= this.ownerPerPixel * 2) this.acquisition.acquireCurve({ c: best, id: e.id });
        }
        this.emit('overlay');
      });
    } else if (!cand) this.acquisition.dwell('', now, 350, () => undefined);

    let entityId: Id | null = null;
    const req = this.runner.pending?.req;
    const idleOrSelect = !req || req.kind === 'selection' || req.kind === 'entity';
    if (this.prefs.rolloverHighlight && idleOrSelect && !this.window && !this.panning) {
      const tol = this.prefs.pickboxPx * this.ownerPerPixel;
      const hits = pickAt(this.ctx, this.index, this.inputOwner, world, tol, req?.kind === 'entity' || req?.kind === 'selection' ? { types: req.types } : undefined, this.visibility());
      entityId = hits[0]?.id ?? null;
    }
    const grip = !req && this.selection.size ? this.gripAt(screen) : null;
    if (this.window) {
      this.window.current = world;
      if (dist(this.window.startScreen, screen) > 4) this.window.dragging = true;
    }
    if (this.downAt && this.downAt.button === 0 && !this.window && !this.panning && dist(this.downAt.screen, screen) > 6 && idleOrSelect && !grip && !this.cycling) {
      // arrastre para ventana de selección
      const start = this.screenToOwner(this.downAt.screen);
      this.window = { startScreen: this.downAt.screen, start, current: world, dragging: true };
    }
    this.hover = { screen, world, resolved, entityId, grip, inside: true };
    this.updatePreview();
    this.emit('overlay');
  }

  /** Algo arrastrado desde un panel pasa sobre el lienzo: cursor con referencias a objetos. */
  dragHover(screen: Vec2): Vec2 {
    const resolved = this.resolveCursor(screen, { force: true });
    this.hover = { ...this.hover, screen, world: this.screenToOwner(screen), resolved, entityId: null, grip: null, inside: true };
    this.emit('overlay');
    return resolved.p;
  }

  /** Punto (con referencias a objetos) donde se suelta lo arrastrado; limpia el cursor de arrastre. */
  dropAt(screen: Vec2): Vec2 {
    const p = this.resolveCursor(screen, { force: true }).p;
    this.hover = { ...this.hover, resolved: null, inside: false };
    this.emit('overlay');
    return p;
  }

  pointerLeave() {
    this.hover = { ...this.hover, inside: false };
    this.emit('overlay');
  }

  pointerDown(screen: Vec2, button: number, mods: { shift?: boolean; ctrl?: boolean; alt?: boolean } = {}) {
    this.shiftDown = !!mods.shift;
    if (button === 1 || (button === 0 && mods.alt)) {
      this.panning = { screen };
      return;
    }
    this.downAt = { screen, time: Date.now(), button };
  }

  pointerUp(screen: Vec2, button: number, mods: { shift?: boolean; ctrl?: boolean } = {}) {
    const wasPanning = this.panning;
    this.panning = null;
    const down = this.downAt;
    this.downAt = null;
    if (wasPanning) return;
    if (button === 2) {
      // clic derecho = Intro (repetir si está inactivo)
      if (this.runner.pending?.req.kind === 'selection') this.finishSelectionRequest();
      else if (this.runner.pending) this.runner.submitText('');
      return;
    }
    if (button !== 0) return;
    const world = this.screenToOwner(screen);
    const req = this.runner.pending?.req;

    // ventana en curso
    if (this.window) {
      const w = this.window;
      const released = w.dragging || dist(w.startScreen, screen) > 4;
      if (released) {
        this.window = null;
        const leftToRight = screen.x >= w.startScreen.x;
        const crossing = this.selectionBoxMode === 'crossing' || (this.selectionBoxMode === 'auto' && !leftToRight);
        const ids = selectInBox(this.ctx, this.index, this.inputOwner, boxFromCorners(w.start, world), crossing, req?.kind === 'selection' ? { types: req.types } : undefined, this.visibility());
        this.applySelection(ids, mods.shift || this.selectionMode === 'remove' ? 'remove' : 'add');
        this.selectionBoxMode = 'auto';
        this.emit('overlay');
        return;
      }
      if (!down) return;
    }

    if (req && (req.kind === 'point' || req.kind === 'distance' || req.kind === 'angle')) {
      const r = this.resolveCursor(screen);
      this.lastPick = r;
      this.runner.submitPoint(r.p);
      this.acquisition.points = [];
      return;
    }

    if (this.gripContext) return;

    // selección / designación de entidad
    if (this.fence && req?.kind === 'selection') {
      this.fence.push(world);
      this.emit('overlay');
      return;
    }
    if (this.polygonSelect && req?.kind === 'selection') {
      this.polygonSelect.points.push(world);
      this.emit('overlay');
      return;
    }

    if (!req) {
      const grip = this.selection.size ? this.gripAt(screen) : null;
      if (grip) {
        this.startGripEdit(grip);
        return;
      }
    }

    const tol = this.prefs.pickboxPx * this.ownerPerPixel;
    const filter = req?.kind === 'selection' || req?.kind === 'entity' ? { types: req.types, includeLocked: req.allowLocked } : undefined;
    const hits = pickAt(this.ctx, this.index, this.inputOwner, world, tol, filter, this.visibility()).filter((h) => req?.kind === 'entity' ? true : this.isSelectable(h.id, filter?.types, filter?.includeLocked));

    if (req?.kind === 'entity') {
      if (!hits.length) {
        this.runner.message('warn', { es: 'No se encontró ningún objeto válido en ese punto.', en: 'No valid object found at that point.' });
        return;
      }
      if (hits.length > 1 && this.prefs.selectionCycling && this.cycling === null && mods.shift) {
        this.cycling = { hits: hits.map((h) => h.id), screen, world, index: 0, forRequest: 'entity' };
        this.emit('overlay');
        return;
      }
      this.runner.submitEntity(hits[0].id, world);
      return;
    }

    if (!hits.length) {
      if (this.selectionBoxMode !== 'auto' || !req || req.kind === 'selection') {
        this.window = { startScreen: screen, start: world, current: world, dragging: false };
        this.emit('overlay');
      }
      if (!req && !mods.shift) this.selection.clear();
      return;
    }

    if (hits.length > 1 && this.prefs.selectionCycling) {
      // clics repetidos en el mismo lugar alternan entre objetos superpuestos
      const prev = this.cycling;
      if (prev && dist(prev.screen, screen) < 4) {
        const next = (prev.index + 1) % prev.hits.length;
        this.cycling = { ...prev, index: next };
        this.applyCycled(prev.hits[prev.index], prev.hits[next], mods.shift);
        return;
      }
      this.cycling = { hits: hits.map((h) => h.id), screen, world, index: 0, forRequest: req ? 'selection' : 'idle' };
    } else this.cycling = null;

    const id = hits[0].id;
    if (!req && !mods.shift) this.applySelection([id], this.selection.has(id) ? 'add' : 'add');
    else this.applySelection([id], mods.shift || this.selectionMode === 'remove' ? 'remove' : 'add');
  }

  private applyCycled(previous: Id, next: Id, shift?: boolean) {
    const req = this.runner.pending?.req;
    if (req?.kind === 'selection') {
      this.requestIds = this.requestIds.filter((i) => i !== previous);
      this.applySelection([next], shift ? 'remove' : 'add');
    } else {
      this.selection.remove([previous]);
      this.applySelection([next], 'add');
    }
    this.emit('overlay');
  }

  /** Elección explícita desde la lista de ciclo de selección. */
  chooseCycled(id: Id) {
    const c = this.cycling;
    this.cycling = null;
    if (!c) return;
    if (c.forRequest === 'entity') this.runner.submitEntity(id, c.world);
    else {
      if (c.forRequest === 'idle') this.selection.remove(c.hits);
      else this.requestIds = this.requestIds.filter((i) => !c.hits.includes(i));
      this.applySelection([id], 'add');
    }
    this.emit('overlay');
  }

  dismissCycling() {
    this.cycling = null;
    this.emit('overlay');
  }

  wheel(screen: Vec2, deltaY: number) {
    const factor = Math.exp(-deltaY * 0.0015);
    const vp = this.navigableViewport;
    if (vp) this.zoomViewportAt(vp, screen, factor);
    else {
      this.view.zoomAt(screen, factor);
      this.emit('view');
    }
    this.pointerMove(screen);
  }

  /** Encuadre en píxeles de pantalla (rueda, panel táctil o dos dedos), respetando el viewport activo. */
  panView(dx: number, dy: number) {
    if (dx === 0 && dy === 0) return;
    const vp = this.navigableViewport;
    if (vp) this.panViewportPixels(vp, dx, dy);
    else {
      this.view.panPixels(dx, dy);
      this.emit('view');
    }
  }

  pinch(center: Vec2, factor: number, pan: Vec2) {
    const vp = this.navigableViewport;
    if (vp) {
      this.panViewportPixels(vp, pan.x, pan.y);
      const cur = this.activeViewport;
      if (cur) this.zoomViewportAt(cur, center, factor);
      return;
    }
    this.view.panPixels(pan.x, pan.y);
    this.view.zoomAt(center, factor);
    this.emit('view');
  }

  /** Teclas con significado en el lienzo. Devuelve true si se consumió. */
  key(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): boolean {
    this.shiftDown = !!mods.shift;
    if (key === 'Escape') {
      if (this.cycling) {
        this.cycling = null;
        this.emit('overlay');
        return true;
      }
      if (this.window) {
        this.window = null;
        this.emit('overlay');
        return true;
      }
      if (this.runner.busy) {
        this.runner.cancel();
        return true;
      }
      this.selection.clear();
      this.acquisition.clear();
      this.emit('overlay');
      return true;
    }
    if (key === 'Tab') {
      const r = this.hover.resolved;
      if (r && r.candidates.length > 1) {
        this.candidateIndex = (this.candidateIndex + (mods.shift ? -1 : 1) + r.candidates.length) % r.candidates.length;
        this.pointerMove(this.hover.screen, { shift: mods.shift });
        return true;
      }
      return false;
    }
    if (key === 'Enter' || key === ' ') {
      const req = this.runner.pending?.req;
      if (req?.kind === 'selection') {
        if (this.fence) {
          const ids = selectByFence(this.ctx, this.index, this.inputOwner, this.fence, { types: req.types }, this.visibility());
          this.fence = null;
          this.applySelection(ids, this.selectionMode);
          return true;
        }
        if (this.polygonSelect) {
          const ps = this.polygonSelect;
          this.polygonSelect = null;
          if (ps.points.length > 2) this.applySelection(selectInPolygon(this.ctx, this.index, this.inputOwner, ps.points, ps.crossing, { types: req.types }, this.visibility()), this.selectionMode);
          return true;
        }
        this.finishSelectionRequest();
        return true;
      }
      this.runner.submitText('', { cursorPoint: this.hover.resolved?.p });
      return true;
    }
    return false;
  }

  toggleSnapSetting(k: 'osnap' | 'otrack' | 'polar' | 'ortho' | 'gridSnap') {
    const snap = { ...this.prefs.snap, [k]: !this.prefs.snap[k] };
    if (k === 'ortho' && snap.ortho) snap.polar = false;
    if (k === 'polar' && snap.polar) snap.ortho = false;
    this.setPrefs({ snap });
  }

  /** Aplica una transformación a entidades en una transacción (con actualización asociativa por reactores). */
  transformEntities(ids: Id[], m: Mat2D, label: string, copy = false): Id[] {
    const created: Id[] = [];
    this.doc.transact(label, (tx) => {
      for (const id of ids) {
        const e = this.doc.entity(id);
        if (!e) continue;
        const t = kindOf(e).transform(e, m, this.ctx);
        if (!t) continue;
        if (copy) {
          const { id: _old, order: _o, ...rest } = t as Entity;
          created.push(tx.addEntity(rest as Entity).id);
        } else tx.put('entities', t as Entity);
      }
    });
    return created;
  }
}
