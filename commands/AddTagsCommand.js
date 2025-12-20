import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';
import { Validation } from '../utils/Validation.js';

/**
 * Add tags, statuses, or limits to a scene (auto-detects type from format)
 */
export class AddTagsCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('scene-add')
      .setDescription('Add tags, statuses, and/or limits to the current scene (auto-detects type from format)')
      .addStringOption(option =>
        option
          .setName('tags')
          .setDescription('Comma-separated list of tags.')
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
    const items = tagsInput.split(',').map(item => item.trim()).filter(item => item.length > 0);

    if (items.length === 0) {
      await interaction.reply({
        content: 'Please provide at least one valid tag.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Categorize items by type based on format
    const tags = [];
    const statuses = [];
    const limits = [];

    for (const item of items) {
      // Check if it's a limit (ends with (number))
      if (Validation.validateLimit(item).valid) {
        limits.push(item);
      }
      // Check if it's a status (ends with -number)
      else if (Validation.validateStatus(item).valid) {
        statuses.push(item);
      }
      // Otherwise it's a tag
      else {
        tags.push(item);
      }
    }

    // Validate statuses and limits (tags have no validation)
    const statusValidation = Validation.validateStatuses(statuses);
    const limitValidation = Validation.validateLimits(limits);

    // Collect all validation errors
    const validationErrors = [];
    if (!statusValidation.valid && statusValidation.errors) {
      validationErrors.push(...statusValidation.errors);
    }
    if (!limitValidation.valid && limitValidation.errors) {
      validationErrors.push(...limitValidation.errors);
    }

    if (validationErrors.length > 0) {
      await interaction.reply({
        content: `**Validation Error:**\n${validationErrors.join('\n')}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Add items to storage
    const addedCounts = {};
    const addedItems = { tags: [], statuses: [], limits: [] };
    const allItems = { tags: [], statuses: [], limits: [] };

    if (tags.length > 0) {
      const existingTags = StoryTagStorage.getTags(sceneId);
      const updatedTags = StoryTagStorage.addTags(sceneId, tags);
      addedCounts.tags = updatedTags.length - existingTags.length;
      addedItems.tags = tags.filter(tag => 
        !existingTags.some(existing => existing.toLowerCase() === tag.toLowerCase())
      );
      allItems.tags = updatedTags;
    }

    if (statuses.length > 0) {
      const existingStatuses = StoryTagStorage.getStatuses(sceneId);
      const updatedStatuses = StoryTagStorage.addStatuses(sceneId, statuses);
      addedCounts.statuses = updatedStatuses.length - existingStatuses.length;
      addedItems.statuses = statuses.filter(status => 
        !existingStatuses.some(existing => existing.toLowerCase() === status.toLowerCase())
      );
      allItems.statuses = updatedStatuses;
    }

    if (limits.length > 0) {
      const existingLimits = StoryTagStorage.getLimits(sceneId);
      const updatedLimits = StoryTagStorage.addLimits(sceneId, limits);
      addedCounts.limits = updatedLimits.length - existingLimits.length;
      addedItems.limits = limits.filter(limit => 
        !existingLimits.some(existing => existing.toLowerCase() === limit.toLowerCase())
      );
      allItems.limits = updatedLimits;
    }

    // Check if anything was actually added
    const totalAdded = (addedCounts.tags || 0) + (addedCounts.statuses || 0) + (addedCounts.limits || 0);

    if (totalAdded === 0) {
      await interaction.reply({
        content: 'All tags already exist in this scene.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get all current items after adding
    const currentTags = StoryTagStorage.getTags(sceneId);
    const currentStatuses = StoryTagStorage.getStatuses(sceneId);
    const currentLimits = StoryTagStorage.getLimits(sceneId);

    // Build summary of what was added
    const addedSummary = [];
    if (addedCounts.tags > 0) {
      addedSummary.push(`${addedCounts.tags} tag${addedCounts.tags !== 1 ? 's' : ''}`);
    }
    if (addedCounts.statuses > 0) {
      addedSummary.push(`${addedCounts.statuses} status${addedCounts.statuses !== 1 ? 'es' : ''}`);
    }
    if (addedCounts.limits > 0) {
      addedSummary.push(`${addedCounts.limits} limit${addedCounts.limits !== 1 ? 's' : ''}`);
    }

    const totalCount = currentTags.length + currentStatuses.length + currentLimits.length;
    const counts = [];
    if (currentTags.length > 0) counts.push(`${currentTags.length} tag${currentTags.length !== 1 ? 's' : ''}`);
    if (currentStatuses.length > 0) counts.push(`${currentStatuses.length} status${currentStatuses.length !== 1 ? 'es' : ''}`);
    if (currentLimits.length > 0) counts.push(`${currentLimits.length} limit${currentLimits.length !== 1 ? 's' : ''}`);

    const formatted = TagFormatter.formatSceneStatusInCodeBlock(currentTags, currentStatuses, currentLimits);
    const content = `**Added ${addedSummary.join(', ')}**\n\n` +
      `**Scene Status (${totalCount} total${counts.length > 0 ? ': ' + counts.join(', ') : ''})**\n${formatted}`;

    await interaction.reply({
      content,
      flags: ephemeral ? MessageFlags.Ephemeral : undefined,
    });
  }
}

