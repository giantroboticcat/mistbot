import { AddTagsCommand } from './AddTagsCommand.js';
import { RemoveTagsCommand } from './RemoveTagsCommand.js';
import { AddStatusCommand } from './AddStatusCommand.js';
import { RemoveStatusCommand } from './RemoveStatusCommand.js';
import { AddLimitCommand } from './AddLimitCommand.js';
import { RemoveLimitCommand } from './RemoveLimitCommand.js';
import { ListSceneStatusCommand } from './ListSceneStatusCommand.js';
import { ClearSceneCommand } from './ClearSceneCommand.js';

/**
 * Array of all command classes
 * Add new commands here to register them
 */
export const commands = [
  new AddTagsCommand(),
  new RemoveTagsCommand(),
  new AddStatusCommand(),
  new RemoveStatusCommand(),
  new AddLimitCommand(),
  new RemoveLimitCommand(),
  new ListSceneStatusCommand(),
  new ClearSceneCommand(),
];

