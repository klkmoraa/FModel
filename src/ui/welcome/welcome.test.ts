import { describe, expect, it, vi } from 'vitest';
import { FILE_COMMANDS } from '../../commands/file';

describe('Pantalla de bienvenida FModel (FS-M01)', () => {
  it('el comando HOME/INICIO está registrado en FILE_COMMANDS y dispara la interfaz de bienvenida', async () => {
    const homeCmd = FILE_COMMANDS.find((c) => c.name === 'HOME');
    expect(homeCmd).toBeDefined();
    expect(homeCmd?.aliases).toContain('INICIO');
    expect(homeCmd?.aliases).toContain('BIENVENIDA');
    expect(homeCmd?.aliases).toContain('START');

    const target = new EventTarget();
    (globalThis as any).window = target;
    (globalThis as any).CustomEvent = class CustomEvent extends Event {
      detail: any;
      constructor(type: string, params: any = {}) {
        super(type, params);
        this.detail = params.detail;
      }
    };

    const handler = vi.fn();
    target.addEventListener('fmodel:ui', handler);
    await homeCmd?.run({} as any);
    expect(handler).toHaveBeenCalled();
    const eventDetail = (handler.mock.calls[0][0] as any).detail;
    expect(eventDetail.ui).toBe('welcome');
    delete (globalThis as any).window;
  });
});
