import { describe, expect, it } from 'vitest';
import { assertAssetRecord, AssetValidationError } from './assets';

const asset = (mime: string, bytes: string) => ({
  id: 'resource', name: 'resource.bin', mime, size: bytes.length,
  dataUrl: `data:${mime};base64,${btoa(bytes)}`,
});

describe('firmas de recursos incrustados', () => {
  it('acepta cabeceras correspondientes a los formatos binarios admitidos', () => {
    const signatures = [
      ['image/png', '\x89PNG\r\n\x1a\n'],
      ['image/jpeg', '\xff\xd8\xff\xe0'],
      ['image/gif', 'GIF89a'],
      ['image/webp', 'RIFF\x00\x00\x00\x00WEBP'],
      ['application/pdf', 'prefijo%PDF-1.7\n'],
    ];
    for (const [mime, bytes] of signatures) expect(() => assertAssetRecord(asset(mime, bytes))).not.toThrow();
  });

  it('rechaza bytes incompatibles con el MIME con un error bilingüe', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']) {
      try {
        assertAssetRecord(asset(mime, 'contenido ajeno'));
        throw new Error(`Accepted ${mime}`);
      } catch (error) {
        expect(error).toBeInstanceOf(AssetValidationError);
        expect((error as AssetValidationError).l10n.en).toContain('binary signature');
      }
    }
  });
});
