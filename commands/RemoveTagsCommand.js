import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';

/**
 * Remove story tags from a scene
 */
export class RemoveTagsCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('remove-tags')
      .setDescription('Remove story tags from the current scene')
      .addStringOption(option =>
        option
          .setName('tags')
          .setDescription('Comma-separated list of tags to remove')
          .setRequired(true))
      .addBooleanOption(option =>
        option
          .setName('ephemeral')
          .setDescription('Only show the response to you (default: false)')
          .setRequired(false));
  }

  async execute(interaction) {
    const tagsInput = interaction.options.getString('tags', true);
    const sceneId = interaction.channelId;
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;

    // Parse tags from comma-separated string
    const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

    if (tags.length === 0) {
      await interaction.reply({
        content: 'Please provide at least one valid tag.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existingTags = StoryTagStorage.getTags(sceneId);
    const updatedTags = StoryTagStorage.removeTags(sceneId, tags);
    const removedCount = existingTags.length - updatedTags.length;

    if (removedCount === 0) {
      await interaction.reply({
        content: 'None of the specified tags were found in this scene.',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      const removedTags = tags.filter(tag =>
        existingTags.some(existing => existing.toLowerCase() === tag.toLowerCase())
      );
      
      const removedTagsFormatted = TagFormatter.formatTagsInCodeBlock(removedTags);
      const remainingTagsFormatted = TagFormatter.formatTagsInCodeBlock(updatedTags);
      
      const content = `**Removed ${removedCount} tag(s)**\n\n` +
        `**Removed:**\n${removedTagsFormatted}\n\n` +
        `**Remaining Tags (${updatedTags.length}):**\n${remainingTagsFormatted}`;

      await interaction.reply({
        content,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    }
  }
}

