import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from './Command.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';

/**
 * Remove story tags, statuses, and limits from a scene using interactive multiselect dropdown
 */
export class RemoveTagsCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('scene-remove')
      .setDescription('Remove story tags, statuses, or limits from the current scene (interactive)');
  }

  async execute(interaction) {
    const sceneId = interaction.channelId;
    const existingTags = StoryTagStorage.getTags(sceneId);
    const existingStatuses = StoryTagStorage.getStatuses(sceneId);
    const existingLimits = StoryTagStorage.getLimits(sceneId);

    const totalItems = existingTags.length + existingStatuses.length + existingLimits.length;

    if (totalItems === 0) {
      await interaction.reply({
        content: 'No tags, statuses, or limits are set for this scene.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Store selected items in interaction metadata (using customId pattern)
    // We'll use a Map to track selections per user
    if (!interaction.client.tagRemovalSelections) {
      interaction.client.tagRemovalSelections = new Map();
    }
    // Store item type mapping (item name -> type) to identify types without prefixes
    if (!interaction.client.tagRemovalItemTypes) {
      interaction.client.tagRemovalItemTypes = new Map();
    }

    const selectionKey = `${interaction.user.id}-${sceneId}`;
    interaction.client.tagRemovalSelections.set(selectionKey, new Set());

    // Create a map of item name to type for this scene
    const itemTypeMap = new Map();
    existingTags.forEach(tag => itemTypeMap.set(tag, 'tag'));
    existingStatuses.forEach(status => itemTypeMap.set(status, 'status'));
    existingLimits.forEach(limit => itemTypeMap.set(limit, 'limit'));
    interaction.client.tagRemovalItemTypes.set(selectionKey, itemTypeMap);

    // Create multiselect dropdown options for all items
    // Use plain item names as values, but show type emoji in labels
    const options = [];

    // Add tags with yellow emoji prefix in label only
    existingTags.forEach(tag => {
      const label = tag.length > 100 ? tag.substring(0, 97) + '...' : tag;
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`🏷️ ${label}`)
          .setValue(tag)
      );
    });

    // Add statuses with green emoji prefix in label only
    existingStatuses.forEach(status => {
      const label = status.length > 100 ? status.substring(0, 97) + '...' : status;
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`✅ ${label}`)
          .setValue(status)
      );
    });

    // Add limits with red emoji prefix in label only
    existingLimits.forEach(limit => {
      const label = limit.length > 100 ? limit.substring(0, 97) + '...' : limit;
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`🔴 ${label}`)
          .setValue(limit)
      );
    });

    // Discord limits select menus to 25 options
    const optionsToShow = options.slice(0, 25);

    // Create the multiselect menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`select_items_to_remove_${sceneId}`)
      .setPlaceholder('Select tags, statuses, or limits to remove...')
      .setMinValues(0)
      .setMaxValues(optionsToShow.length)
      .addOptions(optionsToShow);

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    // Add confirm and cancel buttons
    const confirmRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_remove_tags_${sceneId}`)
          .setLabel('Confirm Removal')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`cancel_remove_tags_${sceneId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger)
      );

    const content = '**Select items to remove:**\n' +
      'Use the dropdown below to select multiple tags, statuses, or limits. Then click "Confirm Removal" to remove them.' +
      (totalItems > 25 ? `\n\n*Showing first 25 of ${totalItems} items*` : '');

    await interaction.reply({
      content,
      components: [selectRow, confirmRow],
      flags: MessageFlags.Ephemeral,
    });
  }
}

