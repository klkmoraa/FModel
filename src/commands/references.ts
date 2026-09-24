import { getServices } from '../app/services';
import { insertBlock } from '../blocks/blockOps';
import { applyToPoint, invert } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec';
import { boxFromCorners } from '../geometry/bbox';
import { newId } from '../document/ids';
import type { AssetRecord, BlockRecord, Id, ImageEntity, PdfUnderlayEntity } from '../document/types';
import { unitConversion } from '../document/defaults';
import { assertInputBytes, INPUT_LIMITS } from '../io/limits';
import { assertAssetBytes, assertAssetRecord, AssetValidationError } from '../io/assets';
import { underlaySize } from '../model/kinds/media';
import { openFile } from '../storage/fileAccess';
import { forgetXrefHandle, LIBRARY_PREFIX, readXrefBytes, rememberXrefHandle } from '../xref/sources';
import type { XrefSource } from '../xref/xref';
import { attachXref, bindXref, detachXref, markXrefUnavailable, readXrefSource, reloadXref, repathXref, unloadXref, XrefError } from '../xref/xref';
import { confirmDiscard, openBytes } from './file';
import { add, K, L } from './helpers';
import type { CommandApi, CommandDef } from './types';
import { CommandError } from './types';

const XREF_ACCEPT = { 'application/x-fmodel': ['.fmodel'], 'application/json': ['.json'], 'application/dxf': ['.dxf'] };

function asCommandError(err: unknown): never {
  if (err instanceof XrefError) throw new CommandError(err.l10n);
  throw err;
}

function readSource(bytes: Uint8Array, name: string): XrefSource {
  try {
    assertInputBytes(bytes);
    return readXrefSource(bytes, name);
  } catch (err) {
    throw new CommandError(L(`No se pudo leer «${name}»: ${err instanceof Error ? err.message : String(err)}`, `Could not read "${name}": ${err instanceof Error ? err.message : String(err)}`));
  }
}

function validateAttachmentBytes(bytes: Uint8Array, name: string): void {
  try {
    assertAssetBytes(bytes, name);
  } catch (error) {
    if (error instanceof AssetValidationError) throw new CommandError(error.l10n);
    throw error;
  }
}

function validateAttachmentRecord(asset: AssetRecord): void {
  try {
    assertAssetRecord(asset);
  } catch (error) {
    if (error instanceof AssetValidationError) throw new CommandError(error.l10n);
    throw error;
  }
}

async function pickXref(api: CommandApi, name?: string): Promise<BlockRecord> {
  const doc = api.editor.doc;
  const xrefs = [...doc.data.blocks.values()].filter((b) => b.kind === 'xref');
  if (!xrefs.length) throw new CommandError(L('El dibujo no tiene referencias externas.', 'The drawing has no external references.'));
  if (name) {
    const b = xrefs.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!b) throw new CommandError(L(`No existe la referencia «${name}».`, `Reference "${name}" not found.`));
    return b;
  }
  if (xrefs.length === 1) return xrefs[0];
  const r = await api.getKeyword({ prompt: L('Referencia', 'Reference'), keywords: xrefs.map((x) => K(x.id, x.name, x.name, [x.name.toLowerCase()])) });
  if (r.kind !== 'keyword') throw new CommandError(L('Cancelado.', 'Cancelled.'));
  return doc.data.blocks.get(r.key)!;
}

/** Recarga una referencia; con `interactive` puede pedir permiso o el archivo. Devuelve si se cargó. */
export async function reloadReference(api: CommandApi, block: BlockRecord, interactive: boolean): Promise<boolean> {
  const doc = api.editor.doc;
  const path = block.xref!.path;
  let res = await readXrefBytes(block.id, path, interactive);
  if (!res && interactive && !path.startsWith(LIBRARY_PREFIX)) {
    api.info(L(`Designa de nuevo el archivo de «${block.name}» (${path}).`, `Pick the file for "${block.name}" again (${path}).`));
    const f = await openFile(XREF_ACCEPT, 'FModel / DXF');
    if (f) {
      if (api.signal.aborted) return false;
      res = { bytes: f.bytes, name: f.name };
      await rememberXrefHandle(block.id, f.handle, f.name);
    }
  }
  if (!res) {
    api.apply('XRELOAD', (tx) => markXrefUnavailable(tx, doc, block.id, 'not-found', 'sin acceso al archivo'));
    api.warn(L(`«${block.name}»: no se encontró el origen (${path}). Usa XREPATH para designarlo.`, `"${block.name}": source not found (${path}). Use XREPATH to pick it.`));
    return false;
  }
  let source: XrefSource;
  try {
    source = readSource(res.bytes, res.name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    api.apply('XRELOAD', (tx) => markXrefUnavailable(tx, doc, block.id, 'unresolved', msg));
    api.warn(L(`«${block.name}»: no se pudo leer el archivo de referencia (${msg}).`, `"${block.name}": could not read reference file (${msg}).`));
    return false;
  }
  try {
    api.apply('XRELOAD', (tx) => reloadXref(tx, doc, block.id, source));
  } catch (err) {
    asCommandError(err);
  }
  for (const w of source.warnings) api.warn(L(w, w));
  return true;
}

const XATTACH: CommandDef = {
  name: 'XATTACH',
  aliases: ['XA', 'REFX', 'ENLAZAR'],
  category: 'insert',
  icon: 'xref',
  label: L('Enlazar dibujo', 'Attach drawing'),
  description: L('Referencia otro dibujo FModel o DXF (enlazar o superponer); se detectan referencias circulares y sus capas se prefijan con el nombre.', 'References another FModel or DXF drawing (attach or overlay); circular references are detected and its layers get a name prefix.'),
  async run(api) {
    const doc = api.editor.doc;
    const drawings = await getServices()
      .persistence.drawings()
      .catch(() => []);
    const from = drawings.length
      ? await api.getKeyword({ prompt: L('Origen', 'Source'), keywords: [K('File', 'Archivo', 'File', ['a', 'f']), K('Library', 'Biblioteca local', 'Local library', ['b', 'l'])], defaultValue: 'File' })
      : ({ kind: 'keyword', key: 'File' } as const);
    if (from.kind !== 'keyword') return;
    let bytes: Uint8Array;
    let fileName: string;
    let path: string;
    let handle: unknown;
    if (from.key === 'Library') {
      const pick = await api.getKeyword({ prompt: L('Dibujo guardado', 'Stored drawing'), keywords: drawings.map((d) => K(d.id, d.name, d.name, [d.name.toLowerCase()])) });
      if (pick.kind !== 'keyword') return;
      const d = drawings.find((x) => x.id === pick.key)!;
      bytes = d.bytes;
      fileName = d.name;
      path = `${LIBRARY_PREFIX}${d.id}`;
    } else {
      const f = await openFile(XREF_ACCEPT, 'FModel / DXF');
      if (!f) return;
      bytes = f.bytes;
      fileName = f.name;
      path = f.name;
      handle = f.handle;
    }
    const source = readSource(bytes, fileName);
    const mode = await api.getKeyword({ prompt: L('Tipo de referencia', 'Reference type'), keywords: [K('attach', 'Enlazar', 'Attach', ['e', 'a']), K('overlay', 'Superponer', 'Overlay', ['s', 'o'])], defaultValue: 'attach' });
    if (mode.kind !== 'keyword') return;
    const pt = await api.getPoint({ prompt: L('Punto de inserción', 'Insertion point'), defaultValue: { x: 0, y: 0 } });
    if (pt.kind !== 'point') return;
    const k = unitConversion(source.data.settings.units, doc.settings.units);
    let block: BlockRecord | undefined;
    try {
      api.apply('XATTACH', (tx) => {
        block = attachXref(tx, doc, source, { fileName, path, mode: mode.key as 'attach' | 'overlay', source: from.key === 'Library' ? 'library' : 'file' });
        insertBlock(tx, doc, block.id, api.editor.inputOwner, pt.p);
      });
    } catch (err) {
      asCommandError(err);
    }
    if (block && handle) await rememberXrefHandle(block.id, handle, fileName);
    for (const w of source.warnings) api.warn(L(w, w));
    api.info(
      L(
        `«${block!.name}» enlazado (${source.data.entities.size} objetos${k !== 1 ? `, escala de unidades ×${k}` : ''}). Sus capas aparecen como «${block!.name}|capa».`,
        `"${block!.name}" attached (${source.data.entities.size} objects${k !== 1 ? `, unit scale ×${k}` : ''}). Its layers appear as "${block!.name}|layer".`,
      ),
    );
  },
};

const XREFMANAGER: CommandDef = {
  name: 'XREFMANAGER',
  aliases: ['XREF', 'EXTERNALREFERENCES', 'ER', 'REFERENCIAS'],
  category: 'insert',
  readOnly: true,
  icon: 'xref',
  ui: 'references',
  label: L('Referencias externas', 'External references'),
  description: L('Gestor de dibujos referenciados, imágenes y calcos PDF: estado, recarga, descarga, desenlace, unión y cambio de ruta.', 'Manager for referenced drawings, images and PDF underlays: status, reload, unload, detach, bind and repath.'),
  run() {},
};

const XOPEN: CommandDef = {
  name: 'XOPEN',
  aliases: ['ABRIRREF'],
  category: 'insert',
  readOnly: true,
  label: L('Abrir referencia', 'Open reference'),
  description: L('Abre el dibujo de origen de una referencia para editarlo (sustituye al dibujo actual tras confirmar).', 'Opens the source drawing of a reference for editing (replaces the current drawing after confirming).'),
  async run(api, args) {
    const b = await pickXref(api, args?.join(' '));
    const res = await readXrefBytes(b.id, b.xref!.path, true);
    if (!res) throw new CommandError(L(`No hay acceso al origen de «${b.name}» (${b.xref!.path}). Usa XREPATH para designarlo.`, `No access to the source of "${b.name}" (${b.xref!.path}). Use XREPATH to pick it.`));
    if (!(await confirmDiscard(api))) return;
    const opened = await openBytes(api, res.name, res.bytes);
    if (!opened) return;
    getServices().fileHandle = null;
    api.info(L(`Abierto «${res.name}». Al volver al dibujo anfitrión, recarga la referencia con XRELOAD.`, `Opened "${res.name}". Back in the host drawing, reload the reference with XRELOAD.`));
  },
};

const XRELOAD: CommandDef = {
  name: 'XRELOAD',
  aliases: ['RECARGARREF'],
  category: 'insert',
  label: L('Recargar referencia', 'Reload reference'),
  description: L('Vuelve a leer una referencia (o todas) conservando los cambios locales de sus capas.', 'Re-reads one reference (or all) keeping local layer changes.'),
  async run(api, args) {
    if (args?.[0] && /^(\*|todas|all)$/i.test(args[0])) {
      let n = 0;
      for (const b of [...api.editor.doc.data.blocks.values()].filter((x) => x.kind === 'xref')) if (await reloadReference(api, b, true)) n++;
      api.info(L(`${n} referencia(s) recargada(s).`, `${n} reference(s) reloaded.`));
      return;
    }
    const b = await pickXref(api, args?.join(' '));
    if (await reloadReference(api, b, true)) api.info(L(`«${b.name}» recargada.`, `"${b.name}" reloaded.`));
  },
};

const XUNLOAD: CommandDef = {
  name: 'XUNLOAD',
  aliases: ['DESCARGARREF'],
  category: 'insert',
  label: L('Descargar referencia', 'Unload reference'),
  description: L('Quita el contenido de una referencia sin eliminarla; se recupera con XRELOAD.', 'Removes a reference content without deleting it; restore with XRELOAD.'),
  async run(api, args) {
    const b = await pickXref(api, args?.join(' '));
    api.apply('XUNLOAD', (tx) => unloadXref(tx, api.editor.doc, b.id));
  },
};

const XDETACH: CommandDef = {
  name: 'XDETACH',
  aliases: ['DESENLAZAR'],
  category: 'insert',
  label: L('Desenlazar referencia', 'Detach reference'),
  description: L('Elimina la referencia, todas sus inserciones y sus capas sin uso.', 'Deletes the reference, all its insertions and its unused layers.'),
  async run(api, args) {
    const b = await pickXref(api, args?.join(' '));
    api.apply('XDETACH', (tx) => detachXref(tx, api.editor.doc, b.id));
    await forgetXrefHandle(b.id);
  },
};

const XBIND: CommandDef = {
  name: 'XBIND',
  aliases: ['UNIRREF'],
  category: 'insert',
  label: L('Unir referencia', 'Bind reference'),
  description: L('Convierte la referencia en un bloque normal del dibujo (capas «ref$0$capa»).', 'Converts the reference into a normal block (layers "ref$0$layer").'),
  async run(api, args) {
    const b = await pickXref(api, args?.join(' '));
    try {
      api.apply('XBIND', (tx) => bindXref(tx, api.editor.doc, b.id));
    } catch (err) {
      asCommandError(err);
    }
    await forgetXrefHandle(b.id);
  },
};

const XREPATH: CommandDef = {
  name: 'XREPATH',
  aliases: ['RUTAREF'],
  category: 'insert',
  label: L('Cambiar ruta de referencia', 'Repath reference'),
  description: L('Designa el archivo de origen de una referencia no encontrada o movida y la recarga.', 'Picks the source file of a missing or moved reference and reloads it.'),
  async run(api, args) {
    const b = await pickXref(api, args?.join(' '));
    const f = await openFile(XREF_ACCEPT, 'FModel / DXF');
    if (!f) return;
    const source = readSource(f.bytes, f.name);
    try {
      api.apply('XREPATH', (tx) => {
        repathXref(tx, api.editor.doc, b.id, f.name, source, 'file');
      });
    } catch (err) {
      asCommandError(err);
    }
    await rememberXrefHandle(b.id, f.handle, f.name);
    api.info(L(`«${b.name}» apunta ahora a «${f.name}».`, `"${b.name}" now points to "${f.name}".`));
  },
};

// ------------------------------------------------------------------ imágenes y PDF

function readAsDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

export async function decodeImageSize(dataUrl: string, signal?: AbortSignal): Promise<{ w: number; h: number }> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const img = new Image();
  img.src = dataUrl;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      img.src = 'data:,';
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  try {
    await (signal ? Promise.race([img.decode(), aborted]) : img.decode());
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error('Invalid image dimensions');
  return { w, h };
}

const IMAGEATTACH: CommandDef = {
  name: 'IMAGEATTACH',
  aliases: ['IAT', 'IMAGEN'],
  category: 'insert',
  icon: 'image',
  label: L('Enlazar imagen', 'Attach image'),
  description: L('Inserta una imagen PNG, JPEG, WebP, GIF o SVG incrustada en el dibujo, con escala y rotación.', 'Inserts an embedded PNG, JPEG, WebP, GIF or SVG image with scale and rotation.'),
  async run(api) {
    const f = await openFile({ 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'], 'image/gif': ['.gif'], 'image/svg+xml': ['.svg'] }, 'Imagen', INPUT_LIMITS.maxEntryBytes);
    if (!f) return;
    validateAttachmentBytes(f.bytes, f.name);
    const mime = /\.svg$/i.test(f.name) ? 'image/svg+xml' : /\.jpe?g$/i.test(f.name) ? 'image/jpeg' : /\.webp$/i.test(f.name) ? 'image/webp' : /\.gif$/i.test(f.name) ? 'image/gif' : 'image/png';
    const dataUrl = readAsDataUrl(f.bytes, mime);
    const assetBase: AssetRecord = { id: newId('asset'), name: f.name, mime, size: f.bytes.length, dataUrl };
    validateAttachmentRecord(assetBase);
    let size: { w: number; h: number };
    try {
      size = await decodeImageSize(dataUrl, api.signal);
    } catch (error) {
      if (api.signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
      throw new CommandError(L('El navegador no pudo decodificar la imagen.', 'The browser could not decode the image.'));
    }
    const pt = await api.getPoint({ prompt: L('Punto de inserción (esquina inferior izquierda)', 'Insertion point (lower-left corner)') });
    if (pt.kind !== 'point') return;
    const wr = await api.getDistance({ prompt: L(`Ancho en unidades de dibujo (imagen de ${size.w}×${size.h} px)`, `Width in drawing units (image is ${size.w}×${size.h} px)`), base: pt.p, defaultValue: size.w });
    if (wr.kind !== 'value') return;
    const rot = await api.getAngle({ prompt: L('Rotación', 'Rotation'), base: pt.p, defaultValue: 0 });
    const a = rot.kind === 'value' ? rot.value : 0;
    const width = wr.value;
    const height = (width * size.h) / size.w;
    const asset: AssetRecord = { ...assetBase, width: size.w, height: size.h };
    api.apply('IMAGEATTACH', (tx) => tx.add('assets', asset));
    add<ImageEntity>(api, 'IMAGEATTACH', {
      type: 'image',
      assetId: asset.id,
      position: pt.p,
      u: { x: width * Math.cos(a), y: width * Math.sin(a) },
      v: { x: -height * Math.sin(a), y: height * Math.cos(a) },
      clipEnabled: false,
      opacity: 1,
      fade: 0,
      brightness: 50,
      contrast: 50,
    });
  },
};

const PDFATTACH: CommandDef = {
  name: 'PDFATTACH',
  aliases: ['CALCOPDF', 'PDFUNDERLAY'],
  category: 'insert',
  icon: 'pdf',
  label: L('Calco PDF', 'PDF underlay'),
  description: L('Inserta una página de un PDF como calco a escala real (1 pt = 1/72 in), con recorte, atenuación y bloqueo.', 'Inserts a PDF page as a true-scale underlay (1 pt = 1/72 in), with clipping, fade and lock.'),
  async run(api) {
    const f = await openFile({ 'application/pdf': ['.pdf'] }, 'PDF', INPUT_LIMITS.maxEntryBytes);
    if (!f) return;
    validateAttachmentBytes(f.bytes, f.name);
    const dataUrl = readAsDataUrl(f.bytes, 'application/pdf');
    const assetBase: AssetRecord = { id: newId('asset'), name: f.name, mime: 'application/pdf', size: f.bytes.length, dataUrl };
    validateAttachmentRecord(assetBase);
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    if (api.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const loadingTask = pdfjs.getDocument({ data: f.bytes.slice() });
    const abortLoading = () => void loadingTask.destroy();
    api.signal.addEventListener('abort', abortLoading, { once: true });
    let page = 1;
    let pdfInfo: { pages: number; width: number; height: number };
    let pdf: Awaited<typeof loadingTask.promise> | undefined;
    try {
      pdf = await loadingTask.promise;
      if (api.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) throw new Error('Invalid PDF page count');
      if (pdf.numPages > 1) {
        const r = await api.getNumber({ prompt: L(`Página (1–${pdf.numPages})`, `Page (1–${pdf.numPages})`), integer: true, min: 1, max: pdf.numPages, defaultValue: 1 });
        if (r.kind !== 'value') return;
        page = r.value;
      }
      const vp = (await pdf.getPage(page)).getViewport({ scale: 1 });
      if (!Number.isFinite(vp.width) || !Number.isFinite(vp.height) || vp.width <= 0 || vp.height <= 0) throw new Error('Invalid PDF page dimensions');
      pdfInfo = { pages: pdf.numPages, width: vp.width, height: vp.height };
    } catch (error) {
      if (api.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      throw error;
    } finally {
      api.signal.removeEventListener('abort', abortLoading);
      await (pdf ? pdf.destroy() : loadingTask.destroy()).catch(() => undefined);
    }
    const pt = await api.getPoint({ prompt: L('Punto de inserción (esquina inferior izquierda)', 'Insertion point (lower-left corner)') });
    if (pt.kind !== 'point') return;
    const real = unitConversion('in', api.editor.doc.settings.units) / 72;
    const sc = await api.getNumber({ prompt: L('Factor de escala (1 = tamaño real)', 'Scale factor (1 = real size)'), defaultValue: 1, min: 1e-9 });
    if (sc.kind !== 'value') return;
    const asset: AssetRecord = { ...assetBase, width: pdfInfo.width, height: pdfInfo.height, pages: pdfInfo.pages };
    api.apply('PDFATTACH', (tx) => tx.add('assets', asset));
    add<PdfUnderlayEntity>(api, 'PDFATTACH', { type: 'pdfunderlay', assetId: asset.id, page, position: pt.p, scale: real * sc.value, rotation: 0, clipEnabled: false, opacity: 1, fade: 0, monochrome: false });
  },
};

/** Matriz del cuadrado unidad al dibujo para imagen o calco. */
function unitMatrix(api: CommandApi, e: ImageEntity | PdfUnderlayEntity) {
  if (e.type === 'image') return { a: e.u.x, b: e.u.y, c: e.v.x, d: e.v.y, e: e.position.x, f: e.position.y };
  const { w, h } = underlaySize(e, api.editor.ctx);
  const c = Math.cos(e.rotation);
  const s = Math.sin(e.rotation);
  return { a: w * c, b: w * s, c: -h * s, d: h * c, e: e.position.x, f: e.position.y };
}

const IMAGECLIP: CommandDef = {
  name: 'IMAGECLIP',
  aliases: ['CLIP', 'PDFCLIP', 'RECORTARIMAGEN'],
  category: 'modify',
  icon: 'clip',
  label: L('Recortar imagen o calco', 'Clip image or underlay'),
  description: L('Contorno de recorte rectangular o poligonal para imágenes y calcos PDF; también activa, desactiva o elimina el recorte.', 'Rectangular or polygonal clipping boundary for images and PDF underlays; also turns clipping on/off or deletes it.'),
  async run(api) {
    const r = await api.getEntity({ prompt: L('Designe una imagen o calco PDF', 'Select an image or PDF underlay'), types: ['image', 'pdfunderlay'] });
    if (r.kind !== 'entity') return;
    const id: Id = r.id;
    const e = api.editor.doc.entity(id) as ImageEntity | PdfUnderlayEntity;
    const k = await api.getKeyword({ prompt: L('Recorte', 'Clip'), keywords: [K('New', 'Nuevo contorno', 'New boundary', ['n']), K('On', 'Act', 'On', ['on']), K('Off', 'Desact', 'Off', ['off']), K('Delete', 'Suprimir', 'Delete', ['s', 'd'])], defaultValue: 'New' });
    if (k.kind !== 'keyword') return;
    if (k.key !== 'New') {
      api.apply('IMAGECLIP', (tx) => tx.updateEntity(id, (cur) => ({ ...(cur as ImageEntity), clipEnabled: k.key === 'On' && !!(cur as ImageEntity).clip, clip: k.key === 'Delete' ? undefined : (cur as ImageEntity).clip })));
      return;
    }
    const shape = await api.getKeyword({ prompt: L('Tipo de contorno', 'Boundary type'), keywords: [K('Rect', 'Rectangular', 'Rectangular', ['r']), K('Polygon', 'Poligonal', 'Polygonal', ['p'])], defaultValue: 'Rect' });
    if (shape.kind !== 'keyword') return;
    let pts: Vec2[] = [];
    if (shape.key === 'Rect') {
      const a = await api.getPoint({ prompt: L('Primera esquina', 'First corner') });
      if (a.kind !== 'point') return;
      const b = await api.getPoint({ prompt: L('Esquina opuesta', 'Opposite corner'), base: a.p, rubber: 'rect' });
      if (b.kind !== 'point') return;
      const box = boxFromCorners(a.p, b.p);
      pts = [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }];
    } else {
      for (;;) {
        const p = await api.getPoint({ prompt: L('Siguiente vértice (Intro para terminar)', 'Next vertex (Enter to finish)'), base: pts[pts.length - 1] ?? null, rubber: pts.length ? 'line' : 'none', allowNone: pts.length >= 3 });
        if (p.kind !== 'point') break;
        pts.push(p.p);
      }
      if (pts.length < 3) throw new CommandError(L('El contorno necesita al menos tres vértices.', 'The boundary needs at least three vertices.'));
    }
    const inv = invert(unitMatrix(api, e));
    const clip = pts.map((p) => applyToPoint(inv, p));
    api.apply('IMAGECLIP', (tx) => tx.updateEntity(id, { clip, clipEnabled: true } as Partial<ImageEntity>));
  },
};

const IMAGEADJUST: CommandDef = {
  name: 'IMAGEADJUST',
  aliases: ['IAD', 'PDFADJUST', 'AJUSTARIMAGEN'],
  category: 'modify',
  label: L('Ajustar imagen o calco', 'Adjust image or underlay'),
  description: L('Opacidad, atenuación, contraste y monocromo de imágenes y calcos PDF.', 'Opacity, fade, contrast and monochrome for images and PDF underlays.'),
  async run(api) {
    const ids = await api.getSelection({ prompt: L('Designe imágenes o calcos', 'Select images or underlays'), types: ['image', 'pdfunderlay'] });
    if (!ids.length) return;
    const first = api.editor.doc.entity(ids[0]) as ImageEntity | PdfUnderlayEntity;
    const fade = await api.getNumber({ prompt: L('Atenuación (0–80)', 'Fade (0–80)'), min: 0, max: 80, defaultValue: first.fade });
    const opacity = await api.getNumber({ prompt: L('Opacidad (0–1)', 'Opacity (0–1)'), min: 0, max: 1, defaultValue: first.opacity });
    const mono = await api.getKeyword({ prompt: L('¿Monocromo?', 'Monochrome?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: first.monochrome ? 'Yes' : 'No' });
    api.apply('IMAGEADJUST', (tx) => {
      for (const id of ids)
        tx.updateEntity(id, (cur) => ({
          ...(cur as ImageEntity),
          fade: fade.kind === 'value' ? fade.value : (cur as ImageEntity).fade,
          opacity: opacity.kind === 'value' ? opacity.value : (cur as ImageEntity).opacity,
          monochrome: mono.kind === 'keyword' ? mono.key === 'Yes' : (cur as ImageEntity).monochrome,
        }));
    });
  },
};

export const REFERENCE_COMMANDS: CommandDef[] = [XATTACH, XREFMANAGER, XOPEN, XRELOAD, XUNLOAD, XDETACH, XBIND, XREPATH, IMAGEATTACH, PDFATTACH, IMAGECLIP, IMAGEADJUST];
