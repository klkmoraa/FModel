import type { AssetRecord } from '../document/types';
import { INPUT_LIMITS } from './limits';

export const EMBEDDED_ASSET_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
]);

export class AssetValidationError extends Error {
  constructor(readonly l10n: { es: string; en: string }) {
    super(l10n.es);
    this.name = 'AssetValidationError';
  }
}

export function assertAssetBytes(bytes: Uint8Array, name?: string): void {
  if (bytes.byteLength > INPUT_LIMITS.maxEntryBytes) {
    invalidAsset(name, 'el archivo es demasiado grande para incrustarlo', 'the file is too large to embed');
  }
}

const invalidAsset = (name: unknown, detailEs: string, detailEn: string): never => {
  const label = typeof name === 'string' && name.trim() ? ` «${name}»` : '';
  throw new AssetValidationError({
    es: `El recurso${label} no es válido: ${detailEs}.`,
    en: `Asset${label} is invalid: ${detailEn}.`,
  });
};

function assertSafeSvg(svg: string, name: unknown): void {
  if (/<\s*!doctype|<\s*(?:script|foreignObject|iframe|object|embed)\b|\bon[a-z]+\s*=|javascript\s*:|@import\b/i.test(svg)) {
    invalidAsset(name, 'el SVG contiene contenido activo', 'the SVG contains active content');
  }

  const hrefPattern = /\b(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi;
  let withoutQuotedHrefs = svg;
  for (const match of svg.matchAll(hrefPattern)) {
    const value = match[2].trim();
    if (!value.startsWith('#') && !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) {
      invalidAsset(name, 'el SVG intenta cargar un recurso externo', 'the SVG attempts to load an external resource');
    }
    withoutQuotedHrefs = withoutQuotedHrefs.replace(match[0], '');
  }
  if (/\b(?:xlink:)?href\s*=|\bsrc\s*=/i.test(withoutQuotedHrefs)) {
    invalidAsset(name, 'el SVG contiene una referencia no permitida', 'the SVG contains a disallowed reference');
  }

  for (const match of svg.matchAll(/url\s*\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    if (!match[2].trim().startsWith('#')) {
      invalidAsset(name, 'el SVG intenta cargar un recurso externo', 'the SVG attempts to load an external resource');
    }
  }
}

function assertAssetSignature(payload: string, mime: string, name: unknown): void {
  if (mime === 'image/svg+xml') return;
  const prefixChars = Math.min(payload.length, mime === 'application/pdf' ? 1368 : 32);
  let prefix = '';
  try {
    prefix = globalThis.atob(payload.slice(0, prefixChars));
  } catch {
    invalidAsset(name, 'los datos base64 no se pueden decodificar', 'the base64 data cannot be decoded');
  }
  const matches = (() => {
    switch (mime) {
      case 'image/png':
        return prefix.startsWith('\x89PNG\r\n\x1a\n');
      case 'image/jpeg':
        return prefix.charCodeAt(0) === 0xff && prefix.charCodeAt(1) === 0xd8 && prefix.charCodeAt(2) === 0xff;
      case 'image/gif':
        return prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a');
      case 'image/webp':
        return prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP';
      case 'application/pdf':
        return prefix.slice(0, 1024).includes('%PDF-');
      default:
        return false;
    }
  })();
  if (!matches) invalidAsset(name, 'la firma binaria no corresponde al tipo declarado', 'the binary signature does not match the declared type');
}

/** Valida recursos incrustados antes de incorporarlos al documento local. */
export function assertAssetRecord(value: unknown): asserts value is AssetRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidAsset(undefined, 'la estructura no es un objeto', 'the structure is not an object');
  }
  const asset = value as Record<string, unknown>;
  if (typeof asset.id !== 'string' || !asset.id.trim() || typeof asset.name !== 'string' || !asset.name.trim()) {
    invalidAsset(asset.name, 'faltan el identificador o el nombre', 'the identifier or name is missing');
  }
  const mime = asset.mime;
  if (typeof mime !== 'string' || !EMBEDDED_ASSET_MIME_TYPES.has(mime.toLowerCase())) {
    invalidAsset(asset.name, 'el tipo de archivo no está admitido', 'the file type is unsupported');
  }
  const normalizedMime = mime as string;
  if (!Number.isInteger(asset.size) || (asset.size as number) < 0 || (asset.size as number) > INPUT_LIMITS.maxEntryBytes) {
    invalidAsset(asset.name, 'el tamaño declarado está fuera de límites', 'the declared size is outside allowed limits');
  }
  for (const key of ['width', 'height'] as const) {
    const dimension = asset[key];
    if (dimension !== undefined && (typeof dimension !== 'number' || !Number.isFinite(dimension) || dimension <= 0)) {
      invalidAsset(asset.name, `la dimensión ${key} no es válida`, `${key} is invalid`);
    }
  }
  if (asset.pages !== undefined && (!Number.isInteger(asset.pages) || (asset.pages as number) <= 0)) {
    invalidAsset(asset.name, 'el número de páginas no es válido', 'the page count is invalid');
  }
  if (asset.path !== undefined && typeof asset.path !== 'string') {
    invalidAsset(asset.name, 'la ruta no es válida', 'the path is invalid');
  }
  const dataUrl = asset.dataUrl;
  if (dataUrl === undefined) return;
  if (typeof dataUrl !== 'string') {
    invalidAsset(asset.name, 'los datos incrustados no son texto', 'embedded data is not text');
  }
  const normalizedDataUrl = dataUrl as string;

  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(normalizedDataUrl);
  if (!match || match[1].toLowerCase() !== normalizedMime.toLowerCase() || match[2].length % 4 !== 0) {
    invalidAsset(asset.name, 'los datos incrustados no son una URL base64 local del tipo declarado', 'embedded data is not a local base64 URL of the declared type');
  }
  const payload = (match as RegExpExecArray)[2];
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const decodedSize = (payload.length / 4) * 3 - padding;
  if (decodedSize > INPUT_LIMITS.maxEntryBytes) {
    invalidAsset(asset.name, 'los datos incrustados son demasiado grandes', 'embedded data is too large');
  }

  assertAssetSignature(payload, normalizedMime.toLowerCase(), asset.name);

  if (normalizedMime.toLowerCase() === 'image/svg+xml') {
    try {
      const binary = globalThis.atob(payload);
      const svg = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
      assertSafeSvg(svg, asset.name);
    } catch (error) {
      if (error instanceof AssetValidationError) throw error;
      invalidAsset(asset.name, 'el SVG base64 no se puede decodificar', 'the base64 SVG cannot be decoded');
    }
  }
}
