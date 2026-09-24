import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity } from '../document/types';
import { Editor } from '../editor/editor';
import { writePackage } from '../io/native';
import { attachXref, readXrefSource } from '../xref/xref';
import { registerAllCommands } from './index';
import { decodeImageSize, reloadReference } from './references';
import type { CommandApi } from './types';

beforeAll(() => registerAllCommands());
afterEach(() => vi.unstubAllGlobals());

function createHostWithXref() {
  const src = createDocument({ title: 'Planta' });
  src.transact('seed', (tx) => {
    tx.addEntity<LineEntity>({
      ...entityDefaults(src),
      type: 'line',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
    });
  });

  const hostDoc = createDocument();
  const editor = new Editor(hostDoc);
  let xrefId = '';
  hostDoc.transact('XATTACH', (tx) => {
    const b = attachXref(tx, hostDoc, readXrefSource(writePackage(src.data, src.id), 'planta.fmodel'), {
      fileName: 'planta.fmodel',
      path: 'planta.fmodel',
      mode: 'attach',
      source: 'file',
    });
    xrefId = b.id;
  });

  return { editor, doc: hostDoc, xrefId };
}

describe('referencias commands', () => {
  it('rechaza imágenes sin dimensiones utilizables y cancela una decodificación pendiente', async () => {
    class ZeroImage {
      src = '';
      naturalWidth = 0;
      naturalHeight = 20;
      decode = async () => undefined;
    }
    vi.stubGlobal('Image', ZeroImage);
    await expect(decodeImageSize('data:image/svg+xml;base64,PHN2Zy8+')).rejects.toThrow(/dimensions/i);

    class PendingImage {
      src = '';
      naturalWidth = 20;
      naturalHeight = 20;
      decode = () => new Promise<void>(() => undefined);
    }
    vi.stubGlobal('Image', PendingImage);
    const controller = new AbortController();
    const decoding = decodeImageSize('data:image/png;base64,eA==', controller.signal);
    controller.abort();
    await expect(decoding).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reloadReference sin acceso al archivo marca status not-found pero conserva snapshot intacto', async () => {
    const { editor, doc, xrefId } = createHostWithXref();
    const block = doc.data.blocks.get(xrefId)!;

    expect(doc.entitiesOf(xrefId)).toHaveLength(1);

    const api = {
      editor,
      apply: (name: string, fn: (tx: any) => void) => doc.transact(name, fn),
      warn: () => {},
      info: () => {},
    } as unknown as CommandApi;

    const ok = await reloadReference(api, block, false);
    expect(ok).toBe(false);

    const updated = doc.data.blocks.get(xrefId)!;
    expect(updated.xref?.status).toBe('not-found');
    expect(updated.xref?.error).toContain('sin acceso al archivo');

    // ¡El snapshot sigue presente en el dibujo!
    expect(doc.entitiesOf(xrefId)).toHaveLength(1);
  });

  it('XUNLOAD y XBIND mediante el ejecutor de comandos', async () => {
    const { editor, doc, xrefId } = createHostWithXref();

    // XUNLOAD retira el contenido
    await editor.runner.script('XUNLOAD', [], ['planta']);
    expect(doc.entitiesOf(xrefId)).toHaveLength(0);
    expect(doc.data.blocks.get(xrefId)?.xref?.status).toBe('unloaded');

    // XBIND falla si está descargada (registra error en el log)
    await editor.runner.script('XBIND', [], ['planta']);
    expect(editor.runner.log.some((l) => l.kind === 'error' && /Carga la referencia|Load the reference/i.test(l.text))).toBe(true);

    // Restauramos snapshot cargado
    doc.transact('restore', (tx) => {
      const b = doc.data.blocks.get(xrefId)!;
      tx.update('blocks', xrefId, {
        xref: { ...b.xref!, status: 'loaded' },
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(doc, xrefId),
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });
    });

    // Ahora XBIND convierte en bloque normal
    await editor.runner.script('XBIND', [], ['planta']);
    expect(doc.data.blocks.get(xrefId)?.kind).toBe('normal');
  });
});
