import { describe, expect, it } from 'vitest';
import { FILE_COMMANDS } from './file';
import { findCommand, registerCommands } from './registry';

describe('búsqueda de comandos', () => {
  registerCommands(FILE_COMMANDS);

  it('encuentra los comandos internos registrados con «_» (abrir archivos recibidos del sistema)', () => {
    expect(findCommand('_OPENLAUNCHED')?.name).toBe('_OPENLAUNCHED');
  });

  it('el prefijo «_» sigue significando «nombre sin traducir» para el resto', () => {
    expect(findCommand('_OPEN')?.name).toBe('OPEN');
    expect(findCommand('_abrir')?.name).toBe('OPEN');
    expect(findCommand('OPENLAUNCHED')).toBeUndefined();
  });
});
