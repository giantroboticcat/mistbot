import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';
import { Validation } from '../utils/Validation.js';

/**
 * Add limits to a scene
 */
export class AddLimitCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('add-limit')
      .setDescription('Add limits to the current scene')
      .addStringOption(option =>
        option
          .setName('limits')
          .setDescription('Comma-separated list of limits (format: hyphenated, ends with (number), e.g., "harm(4)")')
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

    // Validate limits
    const validation = Validation.validateLimits(limits);
    if (!validation.valid) {
      await interaction.reply({
        content: `**Validation Error:**\n${validation.errors.join('\n')}\n\n`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existingLimits = StoryTagStorage.getLimits(sceneId);
    const updatedLimits = StoryTagStorage.addLimits(sceneId, limits);
    const addedCount = updatedLimits.length - existingLimits.length;

    if (addedCount === 0) {
      await interaction.reply({
        content: 'All limits already exist in this scene.',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      const addedLimits = limits.filter(limit => 
        !existingLimits.some(existing => existing.toLowerCase() === limit.toLowerCase())
      );
      
      const addedLimitsFormatted = TagFormatter.formatLimitsInCodeBlock(addedLimits);
      const allLimitsFormatted = TagFormatter.formatLimitsInCodeBlock(updatedLimits);
      
      const content = `**Added ${addedCount} limit(s)**\n\n` +
        `**Added:**\n${addedLimitsFormatted}\n\n` +
        `**All Limits (${updatedLimits.length}):**\n${allLimitsFormatted}`;

      await interaction.reply({
        content,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    }
  }
}

