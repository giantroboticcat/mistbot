import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { RollStorage } from '../utils/RollStorage.js';
import { RollView } from '../utils/RollView.js';

/**
 * Propose a roll for narrator approval
 */
export class RollProposeCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('roll-propose')
      .setDescription('Propose a roll for narrator approval')
      .addStringOption(option =>
        option
          .setName('description')
          .setDescription('What this roll is for')
          .setRequired(true));
  }

  async execute(interaction) {
    const userId = interaction.user.id;
    const sceneId = interaction.channelId;
    
    // Get active character
    const character = CharacterStorage.getActiveCharacter(userId);
    if (!character) {
      await interaction.reply({
        content: 'You don\'t have an active character. Use `/char-create` to create one.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Initialize roll state if needed
    if (!interaction.client.rollStates) {
      interaction.client.rollStates = new Map();
    }

    const description = interaction.options.getString('description', true);
    
    // Exclude burned tags from roll selection (they can't be used until refreshed)
    // Collect all available tags for help dropdown (exclude burned tags)
    const helpOptions = RollView.collectHelpTags(character, sceneId, StoryTagStorage, false);
    
    // Collect all available tags + weaknesses for hinder dropdown (exclude burned tags)
    const hinderOptions = RollView.collectHinderTags(character, sceneId, StoryTagStorage, false);
    
    const initialHelpTags = new Set();
    const initialHinderTags = new Set();
    const initialBurnedTags = new Set();
    
    // Create a temporary roll key for the interaction
    const tempRollKey = `temp_${userId}_${Date.now()}`;
    
    interaction.client.rollStates.set(tempRollKey, {
      creatorId: userId,
      characterId: character.id,
      helpTags: initialHelpTags,
      hinderTags: initialHinderTags,
      burnedTags: initialBurnedTags,
      description: description,
      helpOptions: helpOptions,
      hinderOptions: hinderOptions,
      helpPage: 0,
      hinderPage: 0,
    });

    const components = RollView.buildRollComponents(tempRollKey, helpOptions, hinderOptions, 0, 0, initialHelpTags, initialHinderTags, false, initialBurnedTags);

    // Add a "Submit Proposal" button instead of "Roll Now"
    const submitButton = new ButtonBuilder()
      .setCustomId(`roll_submit_${tempRollKey}`)
      .setLabel('Submit Proposal')
      .setStyle(ButtonStyle.Primary);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId(`roll_cancel_${tempRollKey}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);
    
    components.push(new ActionRowBuilder().setComponents([submitButton, cancelButton]));

    const displayData = RollView.formatRollProposalContent(initialHelpTags, initialHinderTags, description, true, initialBurnedTags);

    // Combine Components V2 display components with interactive components
    const allComponents = [...(displayData.components || []), ...components];

    await interaction.reply({
      components: allComponents,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  }
}

