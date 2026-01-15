import { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { RollStorage } from '../utils/RollStorage.js';
import { RollView } from '../utils/RollView.js';
import { combineRollComponents } from '../handlers/RollHandler.js';
import RollStatus from '../constants/RollStatus.js';
import { requireGuildId } from '../utils/GuildUtils.js';

/**
 * Amend an existing roll (change tags)
 */
export class RollAmendCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('roll-amend')
      .setDescription('Amend an existing roll to change its tags')
      .addIntegerOption(option =>
        option
          .setName('roll-id')
          .setDescription('The roll ID to amend')
          .setRequired(true));
  }

  async execute(interaction) {
    const guildId = requireGuildId(interaction);
    const userId = interaction.user.id;
    const sceneId = interaction.channelId;
    const rollId = interaction.options.getInteger('roll-id', true);
    
    // Get the roll
    const roll = RollStorage.getRoll(guildId, rollId);
    if (!roll) {
      await interaction.reply({
        content: `Roll #${rollId} not found.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if user is the creator
    if (roll.creatorId !== userId) {
      await interaction.reply({
        content: `Only the creator of roll #${rollId} can amend it.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if roll can be amended (only PROPOSED or CONFIRMED)
    if (roll.status === RollStatus.EXECUTED) {
      await interaction.reply({
        content: `Cannot amend roll #${rollId} because it has already been executed.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (roll.status !== RollStatus.PROPOSED && roll.status !== RollStatus.CONFIRMED) {
      await interaction.reply({
        content: `Roll #${rollId} is in an invalid state for amending. Current status: ${roll.status}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get the character
    const character = CharacterStorage.getCharacter(guildId, roll.creatorId, roll.characterId);
    if (!character) {
      await interaction.reply({
        content: 'Character not found for this roll.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Initialize roll state if needed
    if (!interaction.client.rollStates) {
      interaction.client.rollStates = new Map();
    }

    // Create roll key for amendment (use amend_ prefix to distinguish from new rolls)
    const rollKey = `amend_${rollId}`;
    
    // Exclude burned tags from roll selection (they can't be used until refreshed)
    // Collect all available tags for help dropdown (exclude burned tags)
    const helpOptions = RollView.collectTags(character, roll.sceneId, StoryTagStorage, false, guildId);
    
    // Collect all available tags + weaknesses for hinder dropdown (exclude burned tags)
    const hinderOptions = RollView.collectTags(character, roll.sceneId, StoryTagStorage, false, guildId, false);
    
    // Pre-populate with existing tags
    const initialHelpTags = new Set(roll.helpTags || []);
    const initialHinderTags = new Set(roll.hinderTags || []);
    const initialBurnedTags = new Set(roll.burnedTags || []);
    
    interaction.client.rollStates.set(rollKey, {
      rollId: rollId, // Store roll ID for amendment
      creatorId: roll.creatorId,
      characterId: roll.characterId,
      helpTags: initialHelpTags,
      hinderTags: initialHinderTags,
      burnedTags: initialBurnedTags,
      description: roll.description,
      narrationLink: roll.narrationLink || null,
      justificationNotes: roll.justificationNotes || null,
      showJustificationButton: true,
      helpOptions: helpOptions,
      hinderOptions: hinderOptions,
      helpPage: 0,
      hinderPage: 0,
      buttons: {submit: true, cancel: true},
      isReaction: roll.isReaction || false,
      reactionToRollId: roll.reactionToRollId || null,
      originalStatus: roll.status, // Store original status to reset if needed
      helpFromCharacterIdMap: roll.helpFromCharacterIdMap || new Map(),
      hinderFromCharacterIdMap: roll.hinderFromCharacterIdMap || new Map(),
      mightModifier: roll.mightModifier !== undefined && roll.mightModifier !== null ? roll.mightModifier : 0,
    });

    const interactiveComponents = RollView.buildRollInteractives(rollKey, helpOptions, hinderOptions, 0, 0, initialHelpTags, initialHinderTags, {submit: true, cancel: true}, initialBurnedTags, roll.justificationNotes || "", true, roll.helpFromCharacterIdMap || new Map(), roll.hinderFromCharacterIdMap || new Map(), roll.mightModifier || 0);
   const tempRollState = {
      helpTags: initialHelpTags,
      hinderTags: initialHinderTags,
      description: roll.description,
      burnedTags: initialBurnedTags,
      characterId: roll.characterId,
      sceneId: roll.sceneId,
      mightModifier: roll.mightModifier !== undefined && roll.mightModifier !== null ? roll.mightModifier : 0
    };
    const displayData = RollView.buildRollDisplays(tempRollState, { showJustificationPlaceholder: true, guildId: guildId });
    const allComponents = combineRollComponents(displayData, interactiveComponents);
    
    // Add header message as a container component (required when using IsComponentsV2)
    const headerMessage = `**Amending Roll #${rollId}**\n\nModify the tags below and submit to update the roll.${roll.status === RollStatus.CONFIRMED ? '\n\n⚠️ This roll will return to proposed status after amendment.' : ''}`;
    const headerContainer = new ContainerBuilder();
    headerContainer.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(headerMessage)
    );
    
    await interaction.reply({
      components: [headerContainer, ...allComponents],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  }
}

