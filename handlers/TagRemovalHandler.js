import { MessageFlags } from 'discord.js';
import { TagFormatter } from '../utils/TagFormatter.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { requireGuildId } from '../utils/GuildUtils.js';

/**
 * Handle select menu interactions for item removal (tags, statuses, limits)
 */
export async function handleTagRemovalSelect(interaction, client) {
  const customId = interaction.customId;

  if (customId.startsWith('select_items_to_remove_')) {
    const sceneId = customId.split('_').slice(4).join('_');
    const selectionKey = `${interaction.user.id}-${sceneId}`;

    if (!client.tagRemovalSelections.has(selectionKey)) {
      await interaction.reply({
        content: 'This selection session has expired. Please run /scene-remove again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Update selected items from the select menu values
    const selectedItems = interaction.values;
    const selectedSet = new Set(selectedItems);
    client.tagRemovalSelections.set(selectionKey, selectedSet);

    // Get item type mapping for this scene
    const itemTypeMap = client.tagRemovalItemTypes?.get(selectionKey) || new Map();

    // Separate selected items by type using the mapping
    const selectedTags = [];
    const selectedStatuses = [];
    const selectedLimits = [];

    selectedItems.forEach(item => {
      const type = itemTypeMap.get(item);
      if (type === 'tag') {
        selectedTags.push(item);
      } else if (type === 'status') {
        selectedStatuses.push(item);
      } else if (type === 'limit') {
        selectedLimits.push(item);
      }
    });

    // Build display of selected items in a single code block
    const totalSelected = selectedTags.length + selectedStatuses.length + selectedLimits.length;
    const selectedText = totalSelected > 0
      ? `\n\n**Selected items:**\n${TagFormatter.formatSceneStatusInCodeBlock(selectedTags, selectedStatuses, selectedLimits)}`
      : '\n\n*No items selected*';

    const content = '**Select items to remove:**\n' +
      'Use the dropdown below to select multiple tags, statuses, or limits. Then click "Confirm Removal" to remove them.' +
      selectedText;

    await interaction.update({
      content,
    });
  }
}

/**
 * Handle button interactions for tag removal
 */
export async function handleTagRemovalButton(interaction, client) {
  const customId = interaction.customId;

  // Handle confirm button
  if (customId.startsWith('confirm_remove_tags_')) {
    const guildId = requireGuildId(interaction);
    const sceneId = customId.split('_').slice(3).join('_');
    const selectionKey = `${interaction.user.id}-${sceneId}`;

    if (!client.tagRemovalSelections.has(selectionKey)) {
      await interaction.reply({
        content: 'This selection session has expired. Please run /scene-remove again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const selectedSet = client.tagRemovalSelections.get(selectionKey);
    const selectedItems = Array.from(selectedSet);

    if (selectedItems.length === 0) {
      await interaction.reply({
        content: 'No items were selected for removal.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get item type mapping for this scene
    const itemTypeMap = client.tagRemovalItemTypes?.get(selectionKey) || new Map();

    // Separate items by type using the mapping
    const tagsToRemove = [];
    const statusesToRemove = [];
    const limitsToRemove = [];

    selectedItems.forEach(item => {
      const type = itemTypeMap.get(item);
      if (type === 'tag') {
        tagsToRemove.push(item);
      } else if (type === 'status') {
        statusesToRemove.push(item);
      } else if (type === 'limit') {
        limitsToRemove.push(item);
      }
    });

    // Remove items from storage
    const removedCounts = {};
    const remainingCounts = {};

    if (tagsToRemove.length > 0) {
      const existingTags = StoryTagStorage.getTags(guildId, sceneId);
      const updatedTags = StoryTagStorage.removeTags(guildId, sceneId, tagsToRemove);
      removedCounts.tags = existingTags.length - updatedTags.length;
      remainingCounts.tags = updatedTags.length;
    }

    if (statusesToRemove.length > 0) {
      const existingStatuses = StoryTagStorage.getStatuses(guildId, sceneId);
      const updatedStatuses = StoryTagStorage.removeStatuses(guildId, sceneId, statusesToRemove);
      removedCounts.statuses = existingStatuses.length - updatedStatuses.length;
      remainingCounts.statuses = updatedStatuses.length;
    }

    if (limitsToRemove.length > 0) {
      const existingLimits = StoryTagStorage.getLimits(guildId, sceneId);
      const updatedLimits = StoryTagStorage.removeLimits(guildId, sceneId, limitsToRemove);
      removedCounts.limits = existingLimits.length - updatedLimits.length;
      remainingCounts.limits = updatedLimits.length;
    }

    // Build response content
    const totalRemoved = (removedCounts.tags || 0) + (removedCounts.statuses || 0) + (removedCounts.limits || 0);
    const removedParts = [];
    const remainingParts = [];

    if (tagsToRemove.length > 0) {
      removedParts.push(`**Tags Removed:**\n${TagFormatter.formatTagsInCodeBlock(tagsToRemove)}`);
      if (remainingCounts.tags !== undefined) {
        const remainingTags = StoryTagStorage.getTags(guildId, sceneId);
        remainingParts.push(`**Remaining Tags (${remainingCounts.tags}):**\n${TagFormatter.formatTagsInCodeBlock(remainingTags)}`);
      }
    }

    if (statusesToRemove.length > 0) {
      removedParts.push(`**Statuses Removed:**\n${TagFormatter.formatStatusesInCodeBlock(statusesToRemove)}`);
      if (remainingCounts.statuses !== undefined) {
        const remainingStatuses = StoryTagStorage.getStatuses(guildId, sceneId);
        remainingParts.push(`**Remaining Statuses (${remainingCounts.statuses}):**\n${TagFormatter.formatStatusesInCodeBlock(remainingStatuses)}`);
      }
    }

    if (limitsToRemove.length > 0) {
      removedParts.push(`**Limits Removed:**\n${TagFormatter.formatLimitsInCodeBlock(limitsToRemove)}`);
      if (remainingCounts.limits !== undefined) {
        const remainingLimits = StoryTagStorage.getLimits(guildId, sceneId);
        remainingParts.push(`**Remaining Limits (${remainingCounts.limits}):**\n${TagFormatter.formatLimitsInCodeBlock(remainingLimits)}`);
      }
    }

    // Clean up selection and type mapping
    client.tagRemovalSelections.delete(selectionKey);
    client.tagRemovalItemTypes?.delete(selectionKey);

    // Clean up the ephemeral message by removing all components
    await interaction.update({
      content: `**Removed ${totalRemoved} item${totalRemoved !== 1 ? 's' : ''}**`,
      components: [],
    });

    // Get updated scene data for public message
    const updatedTags = StoryTagStorage.getTags(guildId, sceneId);
    const updatedStatuses = StoryTagStorage.getStatuses(guildId, sceneId);
    const updatedLimits = StoryTagStorage.getLimits(guildId, sceneId);

    // Post public message with updated scene status
    const totalCount = updatedTags.length + updatedStatuses.length + updatedLimits.length;
    const counts = [];
    if (updatedTags.length > 0) counts.push(`${updatedTags.length} tag${updatedTags.length !== 1 ? 's' : ''}`);
    if (updatedStatuses.length > 0) counts.push(`${updatedStatuses.length} status${updatedStatuses.length !== 1 ? 'es' : ''}`);
    if (updatedLimits.length > 0) counts.push(`${updatedLimits.length} limit${updatedLimits.length !== 1 ? 's' : ''}`);
    
    const formatted = TagFormatter.formatSceneStatusInCodeBlock(updatedTags, updatedStatuses, updatedLimits);
    const publicContent = `**Scene Status (${totalCount} total${counts.length > 0 ? ': ' + counts.join(', ') : ''})**\n${formatted}`;

    await interaction.followUp({
      content: publicContent,
      flags: undefined, // Public message
    });
  }
  // Handle cancel button
  else if (customId.startsWith('cancel_remove_tags_')) {
    const sceneId = customId.split('_').slice(3).join('_');
    const selectionKey = `${interaction.user.id}-${sceneId}`;

    client.tagRemovalSelections.delete(selectionKey);
    client.tagRemovalItemTypes?.delete(selectionKey);

    // Clean up the ephemeral message by removing all components
    await interaction.update({
      content: 'Tag removal cancelled.',
      components: [],
    });
  }
}

