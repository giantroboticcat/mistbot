import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { RollStorage } from '../utils/RollStorage.js';
import { RollView } from '../utils/RollView.js';
import { Validation } from '../utils/Validation.js';
import { combineRollComponents } from '../handlers/RollHandler.js';
import { requireGuildId } from '../utils/GuildUtils.js';

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
          .setRequired(true))
      .addStringOption(option =>
        option
          .setName('narration-link')
          .setDescription('Discord link to narration describing why this roll is being made')
          .setRequired(true));
  }

  async execute(interaction) {
    const guildId = requireGuildId(interaction);
    const userId = interaction.user.id;
    const sceneId = interaction.channelId;
    
    // Get active character
    const character = CharacterStorage.getActiveCharacter(guildId, userId);
    if (!character) {
      await interaction.reply({
        content: 'You don\'t have an active character. Use `/char-create` to import from Google Sheets, or `/char-select` to select an active character.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Initialize roll state if needed
    if (!interaction.client.rollStates) {
      interaction.client.rollStates = new Map();
    }

    const description = interaction.options.getString('description', true);
    const narrationLink = interaction.options.getString('narration-link');
    
    // Validate narration link if provided
    if (narrationLink) {
      const linkValidation = Validation.validateDiscordMessageLink(narrationLink);
      if (!linkValidation.valid) {
        await interaction.reply({
          content: `❌ Invalid narration link\n\nPlease provide a valid Discord message link in the format:\n\`https://discord.com/channels/{guild_id}/{channel_id}/{message_id}\``,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }
    
    // Exclude burned tags from roll selection (they can't be used until refreshed)
    // Collect all available tags for help dropdown (exclude burned tags)
    const helpOptions = RollView.collectHelpTags(character, sceneId, StoryTagStorage, false, guildId);
    
    // Collect all available tags + weaknesses for hinder dropdown (exclude burned tags)
    const hinderOptions = RollView.collectHinderTags(character, sceneId, StoryTagStorage, false, guildId);
    
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
      narrationLink: narrationLink || null,
      justificationNotes: null,
      showJustificationButton: true,
      helpOptions: helpOptions,
      hinderOptions: hinderOptions,
      helpPage: 0,
      hinderPage: 0,
      buttons: {submit: true, cancel: true},
      isReaction: false,
      reactionToRollId: null
    });

    const interactiveComponents = RollView.buildRollInteractives(tempRollKey, helpOptions, hinderOptions, 0, 0, initialHelpTags, initialHinderTags, {submit: true, cancel: true}, initialBurnedTags, "", true);
    const displayData = RollView.buildRollDisplays(initialHelpTags, initialHinderTags, description, true, initialBurnedTags, { narrationLink, showJustificationPlaceholder: true });
    const allComponents = combineRollComponents(displayData, interactiveComponents);
    await interaction.reply({
      components: allComponents,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  }
}

