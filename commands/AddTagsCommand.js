import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';
import { Validation } from '../utils/Validation.js';
import { requireGuildId } from '../utils/GuildUtils.js';

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
    const guildId = requireGuildId(interaction);
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

    // Get existing items to check for duplicates
    const existingTags = StoryTagStorage.getTags(guildId, sceneId);
    const existingStatuses = StoryTagStorage.getStatuses(guildId, sceneId);
    const existingLimits = StoryTagStorage.getLimits(guildId, sceneId);

    // Filter out duplicates (case-insensitive comparison)
    const duplicateTags = [];
    const duplicateStatuses = [];
    const duplicateLimits = [];
    
    const newTags = tags.filter(tag => {
      const isDuplicate = existingTags.some(existing => existing.toLowerCase() === tag.toLowerCase());
      if (isDuplicate) {
        duplicateTags.push(tag);
        return false;
      }
      return true;
    });

    const newStatuses = statuses.filter(status => {
      const isDuplicate = existingStatuses.some(existing => existing.toLowerCase() === status.toLowerCase());
      if (isDuplicate) {
        duplicateStatuses.push(status);
        return false;
      }
      return true;
    });

    const newLimits = limits.filter(limit => {
      const isDuplicate = existingLimits.some(existing => existing.toLowerCase() === limit.toLowerCase());
      if (isDuplicate) {
        duplicateLimits.push(limit);
        return false;
      }
      return true;
    });

    // Check if all items are duplicates
    const totalDuplicates = duplicateTags.length + duplicateStatuses.length + duplicateLimits.length;
    const totalNew = newTags.length + newStatuses.length + newLimits.length;

    if (totalNew === 0) {
      const duplicateMessages = [];
      if (duplicateTags.length > 0) {
        duplicateMessages.push(`**Tags:** ${duplicateTags.join(', ')}`);
      }
      if (duplicateStatuses.length > 0) {
        duplicateMessages.push(`**Statuses:** ${duplicateStatuses.join(', ')}`);
      }
      if (duplicateLimits.length > 0) {
        duplicateMessages.push(`**Limits:** ${duplicateLimits.join(', ')}`);
      }
      
      await interaction.reply({
        content: `❌ All items already exist in this scene:\n${duplicateMessages.join('\n')}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Add only non-duplicate items to storage
    const addedCounts = {};
    const allItems = { tags: [], statuses: [], limits: [] };

    if (newTags.length > 0) {
      const updatedTags = StoryTagStorage.addTags(guildId, sceneId, newTags);
      addedCounts.tags = newTags.length;
      allItems.tags = updatedTags;
    } else {
      allItems.tags = existingTags;
    }

    if (newStatuses.length > 0) {
      const updatedStatuses = StoryTagStorage.addStatuses(guildId, sceneId, newStatuses);
      addedCounts.statuses = newStatuses.length;
      allItems.statuses = updatedStatuses;
    } else {
      allItems.statuses = existingStatuses;
    }

    if (newLimits.length > 0) {
      const updatedLimits = StoryTagStorage.addLimits(guildId, sceneId, newLimits);
      addedCounts.limits = newLimits.length;
      allItems.limits = updatedLimits;
    } else {
      allItems.limits = existingLimits;
    }

    // Build response with added items and duplicate warnings
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

    const duplicateWarnings = [];
    if (duplicateTags.length > 0) {
      duplicateWarnings.push(`⚠️ **Tags already exist:** ${duplicateTags.join(', ')}`);
    }
    if (duplicateStatuses.length > 0) {
      duplicateWarnings.push(`⚠️ **Statuses already exist:** ${duplicateStatuses.join(', ')}`);
    }
    if (duplicateLimits.length > 0) {
      duplicateWarnings.push(`⚠️ **Limits already exist:** ${duplicateLimits.join(', ')}`);
    }

    const totalCount = allItems.tags.length + allItems.statuses.length + allItems.limits.length;
    const counts = [];
    if (allItems.tags.length > 0) counts.push(`${allItems.tags.length} tag${allItems.tags.length !== 1 ? 's' : ''}`);
    if (allItems.statuses.length > 0) counts.push(`${allItems.statuses.length} status${allItems.statuses.length !== 1 ? 'es' : ''}`);
    if (allItems.limits.length > 0) counts.push(`${allItems.limits.length} limit${allItems.limits.length !== 1 ? 's' : ''}`);

    const formatted = TagFormatter.formatSceneStatusInCodeBlock(allItems.tags, allItems.statuses, allItems.limits);
    let content = `**Added ${addedSummary.join(', ')}**`;
    if (duplicateWarnings.length > 0) {
      content += `\n\n${duplicateWarnings.join('\n')}`;
    }
    content += `\n\n**Scene Status (${totalCount} total${counts.length > 0 ? ': ' + counts.join(', ') : ''})**\n${formatted}`;

    await interaction.reply({
      content,
      flags: ephemeral ? MessageFlags.Ephemeral : undefined,
    });
  }
}

