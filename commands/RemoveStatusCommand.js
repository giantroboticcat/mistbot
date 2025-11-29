import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';

/**
 * Remove statuses from a scene
 */
export class RemoveStatusCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('remove-status')
      .setDescription('Remove statuses from the current scene')
      .addStringOption(option =>
        option
          .setName('statuses')
          .setDescription('Comma-separated list of statuses to remove')
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

    const existingStatuses = StoryTagStorage.getStatuses(sceneId);
    const updatedStatuses = StoryTagStorage.removeStatuses(sceneId, statuses);
    const removedCount = existingStatuses.length - updatedStatuses.length;

    if (removedCount === 0) {
      await interaction.reply({
        content: 'None of the specified statuses were found in this scene.',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      const removedStatuses = statuses.filter(status =>
        existingStatuses.some(existing => existing.toLowerCase() === status.toLowerCase())
      );
      
      const removedStatusesFormatted = TagFormatter.formatStatusesInCodeBlock(removedStatuses);
      const remainingStatusesFormatted = TagFormatter.formatStatusesInCodeBlock(updatedStatuses);
      
      const content = `**Removed ${removedCount} status(es)**\n\n` +
        `**Removed:**\n${removedStatusesFormatted}\n\n` +
        `**Remaining Statuses (${updatedStatuses.length}):**\n${remainingStatusesFormatted}`;

      await interaction.reply({
        content,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    }
  }
}

