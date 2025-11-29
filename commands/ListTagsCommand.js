import { SlashCommandBuilder } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';

/**
 * List story tags in a scene
 */
export class ListTagsCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('list-tags')
      .setDescription('List all story tags in the current scene')
      .addBooleanOption(option =>
        option
          .setName('ephemeral')
          .setDescription('Only show the response to you (default: false)')
          .setRequired(false));
  }

  async execute(interaction) {
    const sceneId = interaction.channelId;
    const tags = StoryTagStorage.getTags(sceneId);
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;

    if (tags.length === 0) {
      await interaction.reply({
        content: 'No story tags are set for this scene.',
        ephemeral: true,
      });
    } else {
      const tagsFormatted = TagFormatter.formatTagsInCodeBlock(tags);
      const content = `**Story Tags (${tags.length}):**\n${tagsFormatted}`;

      await interaction.reply({
        content,
        ephemeral,
      });
    }
  }
}

