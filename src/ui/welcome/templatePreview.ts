import { useEffect, useState } from 'react';
import { CadDocument } from '../../document/document';
import type { TemplateDefinition } from '../../templates';
import { createContext, type ModelContext } from '../../model/context';
import { documentThumbnail } from '../../render/thumbnail';
import { installDynamicBlocks } from '../../blocks/install';
import { readPackage } from '../../io/native';
import type { StoredDrawing } from '../../storage/persistence';

const built = new Map<string, { doc: CadDocument; ctx: ModelContext }>();

function builtTemplate(tpl: TemplateDefinition): { doc: CadDocument; ctx: ModelContext } {
  let entry = built.get(tpl.id);
  if (!entry) {
    const doc = new CadDocument(tpl.createDocument());
    const ctx = createContext(doc);
    installDynamicBlocks(ctx); // sin esto los bloques dinámicos se verían con su tamaño por defecto
    entry = { doc, ctx };
    built.set(tpl.id, entry);
  }
  return entry;
}

export interface TemplateStats {
  layers: number;
  dimensions: number;
  blocks: number;
  layouts: string[];
}

/** Lo que trae de verdad la plantilla, contado sobre su documento. */
export function templateStats(tpl: TemplateDefinition): TemplateStats {
  const { doc } = builtTemplate(tpl);
  const entities = [...doc.data.entities.values()];
  return {
    layers: doc.data.layers.size,
    dimensions: entities.filter((e) => e.type === 'dimension').length,
    blocks: [...doc.data.blocks.values()].filter((b) => b.kind === 'normal').length,
    layouts: [...doc.data.layouts.values()].filter((l) => doc.entitiesOf(l.id).length > 0).map((l) => l.name),
  };
}

/** Miniatura renderizada con la geometría real de la plantilla (la misma que se abre). */
export function templatePreview(tpl: TemplateDefinition, dark: boolean, width = 480, height = 360): string | null {
  const entry = builtTemplate(tpl);
  return documentThumbnail(entry.doc, entry.ctx, tpl.id, width, height, dark);
}

/**
 * Miniatura del espacio modelo del dibujo activo, cacheada por documento y versión: solo se
 * vuelve a dibujar si el dibujo cambió desde la última vez que se abrió el inicio.
 */
export function useDocumentPreview(doc: CadDocument, ctx: ModelContext, dark: boolean, enabled: boolean): string | null {
  const [src, setSrc] = useState<string | null>(null);
  const key = `${doc.id}@${doc.version}`;
  useEffect(() => {
    if (!enabled) {
      setSrc(null);
      return;
    }
    let alive = true;
    const id = window.setTimeout(() => {
      try {
        const url = documentThumbnail(doc, ctx, key, 960, 600, dark);
        if (alive) setSrc(url);
      } catch {
        if (alive) setSrc(null);
      }
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [doc, ctx, key, dark, enabled]);
  return src;
}

/** Genera la miniatura tras el primer pintado para no bloquear la entrada de la vista. */
export function useTemplatePreview(tpl: TemplateDefinition, dark: boolean, width = 480, height = 360): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(() => {
      try {
        const url = templatePreview(tpl, dark, width, height);
        if (alive) setSrc(url);
      } catch {
        if (alive) setSrc(null);
      }
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [tpl, dark, width, height]);
  return src;
}

export interface StoredPreview {
  src: string | null;
  /** el paquete no se pudo leer: la tarjeta lo avisa antes de intentar abrirlo */
  broken: boolean;
}

/** Miniatura de un dibujo guardado en el navegador, cacheada por id y fecha de guardado. */
export function useStoredDrawingPreview(drawing: StoredDrawing, dark: boolean): StoredPreview {
  const [state, setState] = useState<StoredPreview>({ src: null, broken: false });
  const key = `stored|${drawing.id}@${drawing.savedAt}`;
  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(() => {
      try {
        const res = readPackage(drawing.bytes);
        const doc = new CadDocument(res.data, res.documentId);
        const ctx = createContext(doc);
        installDynamicBlocks(ctx);
        const src = documentThumbnail(doc, ctx, key, 480, 300, dark);
        if (alive) setState({ src, broken: false });
      } catch {
        if (alive) setState({ src: null, broken: true });
      }
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [drawing, key, dark]);
  return state;
}
