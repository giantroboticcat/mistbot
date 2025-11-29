import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';

/**
 * List all scene information (tags, statuses, limits)
 */
export class ListSceneStatusCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('scene-status')
      .setDescription('List all tags, statuses, and limits in the current scene')
      .addBooleanOption(option =>
        option
          .setName('ephemeral')
          .setDescription('Only show the response to you (default: false)')
          .setRequired(false));
  }

  async execute(interaction) {
    const sceneId = interaction.channelId;
    const tags = StoryTagStorage.getTags(sceneId);
    const statuses = StoryTagStorage.getStatuses(sceneId);
    const limits = StoryTagStorage.getLimits(sceneId);
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;

    if (tags.length === 0 && statuses.length === 0 && limits.length === 0) {
      await interaction.reply({
        content: 'No tags, statuses, or limits are set for this scene.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const totalCount = tags.length + statuses.length + limits.length;
    const counts = [];
    if (tags.length > 0) counts.push(`${tags.length} tag${tags.length !== 1 ? 's' : ''}`);
    if (statuses.length > 0) counts.push(`${statuses.length} status${statuses.length !== 1 ? 'es' : ''}`);
    if (limits.length > 0) counts.push(`${limits.length} limit${limits.length !== 1 ? 's' : ''}`);
    
    const formatted = TagFormatter.formatSceneStatusInCodeBlock(tags, statuses, limits);
    const content = `**Scene Status (${totalCount} total: ${counts.join(', ')})**\n${formatted}`;

    await interaction.reply({
      content,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
    });
  }
}

