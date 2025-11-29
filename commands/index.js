import { AddTagsCommand } from './AddTagsCommand.js';
import { RemoveTagsCommand } from './RemoveTagsCommand.js';
import { ListTagsCommand } from './ListTagsCommand.js';
import { ClearTagsCommand } from './ClearTagsCommand.js';

/**
 * Array of all command classes
 * Add new commands here to register them
 */
export const commands = [
  new AddTagsCommand(),
  new RemoveTagsCommand(),
  new ListTagsCommand(),
  new ClearTagsCommand(),
];

