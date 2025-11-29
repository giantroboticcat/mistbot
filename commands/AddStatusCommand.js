import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';
import { Validation } from '../utils/Validation.js';

/**
 * Add statuses to a scene
 */
export class AddStatusCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('add-status')
      .setDescription('Add statuses to the current scene')
      .addStringOption(option =>
        option
          .setName('statuses')
          .setDescription('Comma-separated list of statuses (format: hyphenated, ends with -number, e.g., "concerned-5")')
          .setRequired(true))
      .addBooleanOption(option =>
        option
          .setName('ephemeral')
          .setDescription('Only show the response to you (default: false)')
          .setRequired(false));
  }

  async execute(interaction) {
    const statusesInput = interaction.options.getString('statuses', true);
    const sceneId = interaction.channelId;
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;

    // Parse statuses from comma-separated string
    const statuses = statusesInput.split(',').map(s => s.trim()).filter(s => s.length > 0);

    if (statuses.length === 0) {
      await interaction.reply({
        content: 'Please provide at least one valid status.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Validate statuses
    const validation = Validation.validateStatuses(statuses);
    if (!validation.valid) {
      await interaction.reply({
        content: `**Validation Error:**\n${validation.errors.join('\n')}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existingStatuses = StoryTagStorage.getStatuses(sceneId);
    const updatedStatuses = StoryTagStorage.addStatuses(sceneId, statuses);
    const addedCount = updatedStatuses.length - existingStatuses.length;

    if (addedCount === 0) {
      await interaction.reply({
        content: 'All statuses already exist in this scene.',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      const addedStatuses = statuses.filter(status => 
        !existingStatuses.some(existing => existing.toLowerCase() === status.toLowerCase())
      );
      
      const addedStatusesFormatted = TagFormatter.formatStatusesInCodeBlock(addedStatuses);
      const allStatusesFormatted = TagFormatter.formatStatusesInCodeBlock(updatedStatuses);
      
      const content = `**Added ${addedCount} status(es)**\n\n` +
        `**Added:**\n${addedStatusesFormatted}\n\n` +
        `**All Statuses (${updatedStatuses.length}):**\n${allStatusesFormatted}`;

      await interaction.reply({
        content,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    }
  }
}

