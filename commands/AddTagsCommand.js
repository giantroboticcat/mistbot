import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';

/**
 * Add story tags to a scene
 */
export class AddTagsCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('add-tags')
      .setDescription('Add story tags to the current scene')
      .addStringOption(option =>
        option
          .setName('tags')
          .setDescription('Comma-separated list of tags to add')
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
    const updatedTags = StoryTagStorage.addTags(sceneId, tags);
    const addedCount = updatedTags.length - existingTags.length;

    if (addedCount === 0) {
      await interaction.reply({
        content: 'All tags already exist in this scene.',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      const addedTags = tags.filter(tag => 
        !existingTags.some(existing => existing.toLowerCase() === tag.toLowerCase())
      );
      
      const addedTagsFormatted = TagFormatter.formatTagsInCodeBlock(addedTags);
      const allTagsFormatted = TagFormatter.formatTagsInCodeBlock(updatedTags);
      
      const content = `**Added ${addedCount} tag(s)**\n\n` +
        `**Added:**\n${addedTagsFormatted}\n\n` +
        `**All Tags (${updatedTags.length}):**\n${allTagsFormatted}`;

      await interaction.reply({
        content,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    }
  }
}

