import { ANNOTATE_COMMANDS } from './annotate';
import { AUDIT_COMMANDS } from './audit';
import { BLOCK_COMMANDS } from './blocks';
import { BLOCK_EDITOR_COMMANDS } from './blockEditor';
import { DRAW_COMMANDS } from './draw';
import { FILE_COMMANDS } from './file';
import { GRIP } from './grips';
import { LAYOUT_COMMANDS } from './layout';
import { LIBRARY_COMMANDS } from './library';
import { MODIFY_COMMANDS } from './modify';
import { OUTPUT_COMMANDS } from './output';
import { REFERENCE_COMMANDS } from './references';
import { registerCommands } from './registry';
import { UTILITY_COMMANDS } from './utility';
import { VIEW_COMMANDS } from './view';
import { GEOTECH_COMMANDS } from './geotech';
import { CONSTRAINT_COMMANDS } from './constraints';
import { PRODUCTION_COMMANDS } from './production';

let done = false;

export function registerAllCommands() {
  if (done) return;
  done = true;
  registerCommands(DRAW_COMMANDS);
  registerCommands(VIEW_COMMANDS);
  registerCommands(FILE_COMMANDS);
  registerCommands(BLOCK_COMMANDS);
  registerCommands(LIBRARY_COMMANDS);
  registerCommands(BLOCK_EDITOR_COMMANDS);
  registerCommands(MODIFY_COMMANDS);
  registerCommands(ANNOTATE_COMMANDS);
  registerCommands(UTILITY_COMMANDS);
  registerCommands(LAYOUT_COMMANDS);
  registerCommands(OUTPUT_COMMANDS);
  registerCommands(REFERENCE_COMMANDS);
  registerCommands(AUDIT_COMMANDS);
  registerCommands(GEOTECH_COMMANDS);
  registerCommands(CONSTRAINT_COMMANDS);
  registerCommands(PRODUCTION_COMMANDS);
  registerCommands([GRIP]);
}
