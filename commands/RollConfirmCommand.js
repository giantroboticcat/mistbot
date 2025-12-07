import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from './Command.js';
import { RollStorage } from '../utils/RollStorage.js';
import RollStatus from '../constants/RollStatus.js';
import { RollView } from '../utils/RollView.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { combineRollComponents } from '../handlers/RollHandler.js';

/**
 * Confirm a roll proposal (narrator only)
 */
export class RollConfirmCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('roll-confirm')
      .setDescription('Review and confirm a roll proposal (narrator only)')
      .addIntegerOption(option =>
        option
          .setName('id')
          .setDescription('The roll proposal ID to confirm')
          .setRequired(true));
  }

  async execute(interaction) {
    const rollId = interaction.options.getInteger('id', true);
    
    // Check narrator permissions
    const ROLL_EDITOR_ROLE_ID = process.env.ROLL_EDITOR_ROLE_ID || null;
    if (!ROLL_EDITOR_ROLE_ID) {
      await interaction.reply({
        content: 'Roll confirmation is not configured. Please set ROLL_EDITOR_ROLE_ID.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      if (!interaction.member.roles.includes(ROLL_EDITOR_ROLE_ID)) {
        await interaction.reply({
          content: 'Only narrators can confirm roll proposals.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    } catch (error) {
      await interaction.reply({
        content: 'Error checking permissions.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get the roll proposal
    const roll = RollStorage.getRoll(rollId);
    if (!roll) {
      await interaction.reply({
        content: `Roll proposal #${rollId} not found.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (roll.status !== RollStatus.PROPOSED) {
      await interaction.reply({
        content: `Roll proposal #${rollId} has already been ${roll.status}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get the character to rebuild options
    const character = CharacterStorage.getCharacter(roll.creatorId, roll.characterId);
    if (!character) {
      await interaction.reply({
        content: 'Character not found for this roll proposal.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Initialize roll state for editing
    if (!interaction.client.rollStates) {
      interaction.client.rollStates = new Map();
    }

    const rollKey = `confirm_${rollId}`;
    
    // Collect all available tags (exclude burned tags - they can't be used until refreshed)
    const helpOptions = RollView.collectHelpTags(character, roll.sceneId, StoryTagStorage, false);
    const hinderOptions = RollView.collectHinderTags(character, roll.sceneId, StoryTagStorage, false);
    
    // Store the roll state for editing
    const burnedTags = roll.burnedTags || new Set();
    interaction.client.rollStates.set(rollKey, {
      rollId: rollId,
      creatorId: roll.creatorId,
      characterId: roll.characterId,
      sceneId: roll.sceneId,
      helpTags: roll.helpTags,
      hinderTags: roll.hinderTags,
      burnedTags: burnedTags,
      description: roll.description,
      narrationLink: roll.narrationLink,
      justificationNotes: roll.justificationNotes,
      showJustificationButton: false,
      helpOptions: helpOptions,
      hinderOptions: hinderOptions,
      helpPage: 0,
      hinderPage: 0,
      buttons: {confirm: true, cancel: true}
    });

    // Build components for editing (don't show justification button in confirm view)
    const interactiveComponents = RollView.buildRollInteractives(rollKey, helpOptions, hinderOptions, 0, 0, roll.helpTags, roll.hinderTags, {confirm: true, cancel: true}, burnedTags, roll.justificationNotes, false);

    const displayData = RollView.buildRollDisplays(
      roll.helpTags, 
      roll.hinderTags, 
      roll.description, 
      true, 
      burnedTags,
      {
        title: `Reviewing Roll Proposal #${rollId}`,
        descriptionText: `**Player:** <@${roll.creatorId}>`,
        narrationLink: roll.narrationLink,
        justificationNotes: roll.justificationNotes,
      }
    );

    // Combine Components V2 display components with interactive components in the right order
    const allComponents = combineRollComponents(displayData, interactiveComponents);

    await interaction.reply({
      components: allComponents,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  }
}

