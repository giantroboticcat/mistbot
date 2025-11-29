import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';

/**
 * Remove limits from a scene
 */
export class RemoveLimitCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('remove-limit')
      .setDescription('Remove limits from the current scene')
      .addStringOption(option =>
        option
          .setName('limits')
          .setDescription('Comma-separated list of limits to remove')
          .setRequired(true))
      .addBooleanOption(option =>
        option
          .setName('ephemeral')
          .setDescription('Only show the response to you (default: false)')
          .setRequired(false));
  }

  async execute(interaction) {
    const limitsInput = interaction.options.getString('limits', true);
    const sceneId = interaction.channelId;
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;

    // Parse limits from comma-separated string
    const limits = limitsInput.split(',').map(l => l.trim()).filter(l => l.length > 0);

    if (limits.length === 0) {
      await interaction.reply({
        content: 'Please provide at least one valid limit.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existingLimits = StoryTagStorage.getLimits(sceneId);
    const updatedLimits = StoryTagStorage.removeLimits(sceneId, limits);
    const removedCount = existingLimits.length - updatedLimits.length;

    if (removedCount === 0) {
      await interaction.reply({
        content: 'None of the specified limits were found in this scene.',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      const removedLimits = limits.filter(limit =>
        existingLimits.some(existing => existing.toLowerCase() === limit.toLowerCase())
      );
      
      const removedLimitsFormatted = TagFormatter.formatLimitsInCodeBlock(removedLimits);
      const remainingLimitsFormatted = TagFormatter.formatLimitsInCodeBlock(updatedLimits);
      
      const content = `**Removed ${removedCount} limit(s)**\n\n` +
        `**Removed:**\n${removedLimitsFormatted}\n\n` +
        `**Remaining Limits (${updatedLimits.length}):**\n${remainingLimitsFormatted}`;

      await interaction.reply({
        content,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    }
  }
}

