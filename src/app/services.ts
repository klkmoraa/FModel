import type { Editor } from '../editor/editor';
import type { FileHandle } from '../storage/fileAccess';
import type { Persistence } from '../storage/persistence';

/** Servicios de aplicación compartidos por comandos que interactúan con el entorno (archivos, UI). */
export interface AppServices {
  editor: Editor;
  persistence: Persistence;
  fileHandle: FileHandle | null;
  /** abre un panel o diálogo de la interfaz */
  openUi(ui: string, payload?: unknown): void;
  toast(kind: 'info' | 'warn' | 'error', text: string): void;
}

let services: AppServices | null = null;

export function setServices(s: AppServices) {
  services = s;
}

export function getServices(): AppServices {
  if (!services) throw new Error('Servicios de aplicación no inicializados');
  return services;
}

export function hasServices(): boolean {
  return !!services;
}

/** Solicita a la interfaz abrir un panel/diálogo (desacoplado de React). */
export function requestUi(ui: string, payload?: unknown) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('fmodel:ui', { detail: { ui, payload } }));
}
