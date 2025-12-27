import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { RollStorage } from '../utils/RollStorage.js';
import { RollView } from '../utils/RollView.js';
import { combineRollComponents } from '../handlers/RollHandler.js';
import RollStatus from '../constants/RollStatus.js';
import { requireGuildId } from '../utils/GuildUtils.js';

/**
 * Propose a reaction roll for narrator approval
 */
export class RollReactionCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('roll-reaction')
      .setDescription('Propose a reaction roll for narrator approval')
      .addStringOption(option =>
        option
          .setName('description')
          .setDescription('What this reaction roll is for')
          .setRequired(true))
      .addIntegerOption(option =>
        option
          .setName('roll-id')
          .setDescription('The original roll ID this is reacting to (optional)')
          .setRequired(false));
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
    const originalRollId = interaction.options.getInteger('roll-id');
    
    // If roll-id is provided, validate it exists, is executed, and get its tags to exclude
    let originalRoll = null;
    let excludedTags = new Set();
    if (originalRollId) {
      originalRoll = RollStorage.getRoll(guildId, originalRollId);
      if (!originalRoll) {
        await interaction.reply({
          content: `Roll #${originalRollId} not found.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      
      // Check if the original roll has been executed
      if (originalRoll.status !== RollStatus.EXECUTED) {
        await interaction.reply({
          content: `You can only react to rolls that have been executed. Roll #${originalRollId} is currently ${originalRoll.status}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      
      // Collect all tags from original roll to exclude
      excludedTags = new Set([
        ...(originalRoll.helpTags || []),
        ...(originalRoll.hinderTags || [])
      ]);
    }
    
    // Exclude burned tags from roll selection (they can't be used until refreshed)
    // Also exclude tags from original roll if roll-id was provided
    // Collect all available tags for help dropdown (exclude burned tags and original roll tags)
    const helpOptions = RollView.collectTags(character, sceneId, StoryTagStorage, false, guildId, false);
    const filteredHelpOptions = originalRollId 
      ? helpOptions.filter(opt => !excludedTags.has(opt.data.value))
      : helpOptions;
    
    // Collect all available tags + weaknesses for hinder dropdown (exclude burned tags and original roll tags)
    const hinderOptions = RollView.collectTags(character, sceneId, StoryTagStorage, false, guildId, true);
    const filteredHinderOptions = originalRollId
      ? hinderOptions.filter(opt => !excludedTags.has(opt.data.value))
      : hinderOptions;
    
    const initialHelpTags = new Set();
    const initialHinderTags = new Set();
    const initialBurnedTags = new Set();
    
    // Create a temporary roll key for the interaction
    const tempRollKey = `temp_reaction_${userId}_${Date.now()}`;
    
    interaction.client.rollStates.set(tempRollKey, {
      creatorId: userId,
      characterId: character.id,
      sceneId: interaction.channelId,
      helpTags: initialHelpTags,
      hinderTags: initialHinderTags,
      burnedTags: initialBurnedTags,
      helpFromCharacterIdMap: new Map(),
      hinderFromCharacterIdMap: new Map(),
      description: description,
      narrationLink: null,
      justificationNotes: null,
      showJustificationButton: true,
      helpOptions: filteredHelpOptions,
      hinderOptions: filteredHinderOptions,
      helpPage: 0,
      hinderPage: 0,
      buttons: {submit: true, cancel: true},
      isReaction: true,
      reactionToRollId: originalRollId || null,
    });

    const interactiveComponents = RollView.buildRollInteractives(
      tempRollKey, 
      filteredHelpOptions, 
      filteredHinderOptions, 
      0, 
      0, 
      initialHelpTags, 
      initialHinderTags, 
      {submit: true, cancel: true}, 
      initialBurnedTags, 
      "", 
      true,
      new Map(),
      new Map()
    );
    
    const title = originalRollId 
      ? `Reaction Roll to Roll #${originalRollId}` 
      : 'Reaction Roll';
    
    const tempRollState = {
      helpTags: initialHelpTags,
      hinderTags: initialHinderTags,
      description: description,
      burnedTags: initialBurnedTags,
      characterId: character.id,
      sceneId: sceneId
    };
    const displayData = RollView.buildRollDisplays(
      tempRollState,
      { 
        title: title,
        showJustificationPlaceholder: true,
        guildId: guildId
      }
    );
    
    const allComponents = combineRollComponents(displayData, interactiveComponents);
    await interaction.reply({
      components: allComponents,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  }
}

