import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';

/**
 * Clear all scene data (tags, statuses, and limits)
 */
export class ClearSceneCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('clear-scene')
      .setDescription('Clear all tags, statuses, and limits from the current scene')
      .addBooleanOption(option =>
        option
          .setName('ephemeral')
          .setDescription('Only show the response to you (default: false)')
          .setRequired(false));
  }

  async execute(interaction) {
    const sceneId = interaction.channelId;
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;
    const tags = StoryTagStorage.getTags(sceneId);
    const statuses = StoryTagStorage.getStatuses(sceneId);
    const limits = StoryTagStorage.getLimits(sceneId);
    
    const totalCount = tags.length + statuses.length + limits.length;

    if (totalCount === 0) {
      await interaction.reply({
        content: 'This scene has no tags, statuses, or limits to clear.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    StoryTagStorage.clearScene(sceneId);

    const parts = [];
    if (tags.length > 0) parts.push(`${tags.length} tag(s)`);
    if (statuses.length > 0) parts.push(`${statuses.length} status(es)`);
    if (limits.length > 0) parts.push(`${limits.length} limit(s)`);

    await interaction.reply({
      content: `Cleared ${parts.join(', ')} from this scene.`,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
    });
  }
}

