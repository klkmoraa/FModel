import type { Vec2 } from '../geometry/vec';
import type { Transaction } from '../document/document';
import type { Entity, EntityType, Id } from '../document/types';
import type { DisplayItem } from '../model/graphics';
import type { Editor } from '../editor/editor';

export type Lang = 'es' | 'en';
export type L10n = { es: string; en: string };

export class CancelError extends Error {
  constructor() {
    super('cancel');
  }
}

/** Error de comando con explicación para la persona usuaria. */
export class CommandError extends Error {
  constructor(
    public readonly l10n: L10n,
  ) {
    super(l10n.es);
  }
}

export interface Keyword {
  key: string;
  label: L10n;
  /** alias adicionales aceptados al escribir (sin distinguir mayúsculas) */
  aliases?: string[];
}

export interface PreviewSpec {
  entities?: Entity[];
  items?: DisplayItem[];
  /** texto a mostrar junto al cursor */
  hint?: string;
}

interface BaseRequest {
  prompt: L10n;
  keywords?: Keyword[];
  /** Enter vacío devuelve 'none' */
  allowNone?: boolean;
  preview?: (p: Vec2) => PreviewSpec | null;
}

export type InputRequest =
  | (BaseRequest & { kind: 'point'; base?: Vec2 | null; rubber?: 'line' | 'rect' | 'none'; defaultValue?: Vec2; noSnap?: boolean; noOrtho?: boolean })
  | (BaseRequest & { kind: 'distance'; base?: Vec2 | null; defaultValue?: number; allowNegative?: boolean; allowZero?: boolean })
  | (BaseRequest & { kind: 'angle'; base?: Vec2 | null; defaultValue?: number })
  | (BaseRequest & { kind: 'number'; defaultValue?: number; integer?: boolean; min?: number; max?: number })
  | (BaseRequest & { kind: 'string'; defaultValue?: string; allowSpaces?: boolean; multiline?: boolean })
  | (BaseRequest & { kind: 'keyword'; defaultValue?: string })
  | (BaseRequest & { kind: 'selection'; types?: EntityType[]; single?: boolean; allowLocked?: boolean })
  | (BaseRequest & { kind: 'entity'; types?: EntityType[]; allowLocked?: boolean; highlight?: boolean });

export type InputResponse =
  | { kind: 'point'; p: Vec2 }
  | { kind: 'value'; value: number; p?: Vec2 }
  | { kind: 'string'; value: string }
  | { kind: 'keyword'; key: string }
  | { kind: 'none' }
  | { kind: 'selection'; ids: Id[] }
  | { kind: 'entity'; id: Id; p: Vec2 };

export interface CommandApi {
  editor: Editor;
  lang: Lang;
  t(l: L10n): string;
  /** Aplica cambios al documento como un paso visible; todo el comando se deshace de una vez. */
  apply<T>(label: string, fn: (tx: Transaction) => T): T;
  request(req: InputRequest): Promise<InputResponse>;
  getPoint(req: Omit<Extract<InputRequest, { kind: 'point' }>, 'kind'>): Promise<Extract<InputResponse, { kind: 'point' | 'keyword' | 'none' }>>;
  getDistance(req: Omit<Extract<InputRequest, { kind: 'distance' }>, 'kind'>): Promise<Extract<InputResponse, { kind: 'value' | 'keyword' | 'none' }>>;
  getAngle(req: Omit<Extract<InputRequest, { kind: 'angle' }>, 'kind'>): Promise<Extract<InputResponse, { kind: 'value' | 'keyword' | 'none' }>>;
  getNumber(req: Omit<Extract<InputRequest, { kind: 'number' }>, 'kind'>): Promise<Extract<InputResponse, { kind: 'value' | 'keyword' | 'none' }>>;
  getString(req: Omit<Extract<InputRequest, { kind: 'string' }>, 'kind'>): Promise<Extract<InputResponse, { kind: 'string' | 'keyword' | 'none' }>>;
  getKeyword(req: Omit<Extract<InputRequest, { kind: 'keyword' }>, 'kind'>): Promise<Extract<InputResponse, { kind: 'keyword' | 'none' }>>;
  /** Usa la preselección si existe; si no, pide objetos. */
  getSelection(req: Omit<Extract<InputRequest, { kind: 'selection' }>, 'kind'> & { usePreselection?: boolean }): Promise<Id[]>;
  getEntity(req: Omit<Extract<InputRequest, { kind: 'entity' }>, 'kind'>): Promise<Extract<InputResponse, { kind: 'entity' | 'keyword' | 'none' }>>;
  setPreview(p: PreviewSpec | null): void;
  info(msg: L10n): void;
  warn(msg: L10n): void;
  /** último punto usado (para @ y rastreo) */
  lastPoint: Vec2 | null;
  signal: AbortSignal;
}

export type CommandCategory = 'draw' | 'modify' | 'annotate' | 'block' | 'layer' | 'view' | 'layout' | 'insert' | 'inquiry' | 'manage' | 'file' | 'utility' | 'constraint' | 'output';

export interface CommandDef {
  name: string;
  aliases: string[];
  category: CommandCategory;
  label: L10n;
  description: L10n;
  /** ayuda contextual: pasos y opciones */
  help?: L10n;
  icon?: string;
  /** puede ejecutarse dentro de otro comando (ZOOM, PAN, capas) */
  transparent?: boolean;
  /** no modifica el documento */
  readOnly?: boolean;
  /** abre un panel/diálogo en lugar de pedir datos */
  ui?: string;
  run(api: CommandApi, args?: string[]): Promise<void> | void;
}
