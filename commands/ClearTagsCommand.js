import { SlashCommandBuilder } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';

/**
 * Clear all story tags from a scene
 */
export class ClearTagsCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('clear-tags')
      .setDescription('Clear all story tags from the current scene')
      .addBooleanOption(option =>
        option
          .setName('ephemeral')
          .setDescription('Only show the response to you (default: false)')
          .setRequired(false));
  }

  async execute(interaction) {
    const sceneId = interaction.channelId;
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;
    const existingTags = StoryTagStorage.getTags(sceneId);

    if (existingTags.length === 0) {
      await interaction.reply({
        content: 'This scene has no tags to clear.',
        ephemeral: true,
      });
      return;
    }

    StoryTagStorage.clearTags(sceneId);

    await interaction.reply({
      content: `Cleared ${existingTags.length} tag(s) from this scene.`,
      ephemeral,
    });
  }
}

