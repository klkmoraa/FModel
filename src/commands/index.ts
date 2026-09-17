import { BLOCK_COMMANDS } from './blocks';
import { DRAW_COMMANDS } from './draw';
import { FILE_COMMANDS } from './file';
import { GRIP } from './grips';
import { MODIFY_COMMANDS } from './modify';
import { registerCommands } from './registry';
import { VIEW_COMMANDS } from './view';

let done = false;

export function registerAllCommands() {
  if (done) return;
  done = true;
  registerCommands(DRAW_COMMANDS);
  registerCommands(VIEW_COMMANDS);
  registerCommands(FILE_COMMANDS);
  registerCommands(BLOCK_COMMANDS);
  registerCommands(MODIFY_COMMANDS);
  registerCommands([GRIP]);
}
