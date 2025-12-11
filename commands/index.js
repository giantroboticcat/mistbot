import { HelpCommand } from './HelpCommand.js';
import { GetStartedCommand } from './GetStartedCommand.js';
import { NarratorGuideCommand } from './NarratorGuideCommand.js';
import { AddTagsCommand } from './AddTagsCommand.js';
import { RemoveTagsCommand } from './RemoveTagsCommand.js';
import { ListSceneStatusCommand } from './ListSceneStatusCommand.js';
import { ClearSceneCommand } from './ClearSceneCommand.js';
import { CreateCharacterCommand } from './CreateCharacterCommand.js';
import { EditCharacterCommand } from './EditCharacterCommand.js';
import { SelectCharacterCommand } from './SelectCharacterCommand.js';
import { ViewCharacterCommand } from './ViewCharacterCommand.js';
import { FellowshipLookupCommand } from './FellowshipLookupCommand.js';
import { RollProposeCommand } from './RollProposeCommand.js';
import { RollConfirmCommand } from './RollConfirmCommand.js';
import { RollExecuteCommand } from './RollExecuteCommand.js';

/**
 * Array of all command classes
 * Add new commands here to register them
 */
export const commands = [
  new HelpCommand(),
  new GetStartedCommand(),
  new NarratorGuideCommand(),
  new AddTagsCommand(),
  new RemoveTagsCommand(),
  new ListSceneStatusCommand(),
  new ClearSceneCommand(),
  new CreateCharacterCommand(),
  new EditCharacterCommand(),
  new SelectCharacterCommand(),
  new ViewCharacterCommand(),
  new FellowshipLookupCommand(),
  new RollProposeCommand(),
  new RollConfirmCommand(),
  new RollExecuteCommand(),
];

