import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';
import { Validation } from '../utils/Validation.js';

/**
 * Roll dice with tag modifiers
 */
export class RollCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('roll')
      .setDescription('Roll 2d6 with tag modifiers (default: 2d6)');
  }

  async execute(interaction) {
    const userId = interaction.user.id;
    const sceneId = interaction.channelId;
    
    // Get active character
    const character = CharacterStorage.getActiveCharacter(userId);
    if (!character) {
      await interaction.reply({
        content: 'You don\'t have an active character. Use `/create-character` to create one.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Initialize roll state if needed
    if (!interaction.client.rollStates) {
      interaction.client.rollStates = new Map();
    }

    const rollKey = `${userId}-${sceneId}`;
    interaction.client.rollStates.set(rollKey, {
      creatorId: userId,
      characterId: character.id,
      helpTags: new Set(),
      hinderTags: new Set(),
      rolled: false,
    });

    // Collect all available tags for help dropdown
    const helpOptions = this.collectHelpTags(character, sceneId);
    
    // Collect all available tags + weaknesses for hinder dropdown
    const hinderOptions = this.collectHinderTags(character, sceneId);

    // Create help select menu
    const helpSelect = new StringSelectMenuBuilder()
      .setCustomId(`roll_help_${rollKey}`)
      .setPlaceholder('Select tags that help the roll...')
      .setMinValues(0)
      .setMaxValues(Math.min(helpOptions.length, 25))
      .addOptions(helpOptions.slice(0, 25));

    // Create hinder select menu
    const hinderSelect = new StringSelectMenuBuilder()
      .setCustomId(`roll_hinder_${rollKey}`)
      .setPlaceholder('Select tags that hinder the roll...')
      .setMinValues(0)
      .setMaxValues(Math.min(hinderOptions.length, 25))
      .addOptions(hinderOptions.slice(0, 25));

    // Create roll button
    const rollButton = new ButtonBuilder()
      .setCustomId(`roll_now_${rollKey}`)
      .setLabel('Roll Now')
      .setStyle(ButtonStyle.Primary);

    const helpRow = new ActionRowBuilder().setComponents([helpSelect]);
    const hinderRow = new ActionRowBuilder().setComponents([hinderSelect]);
    const buttonRow = new ActionRowBuilder().setComponents([rollButton]);

    const content = RollCommand.formatRollProposalContent(new Set(), new Set());

    await interaction.reply({
      content,
      components: [helpRow, hinderRow, buttonRow],
    });
  }

  /**
   * Collect all tags available for helping a roll
   * Includes: theme tags, theme names, backpack, storyTags, tempStatuses, scene tags, scene statuses
   */
  collectHelpTags(character, sceneId) {
    const options = [];
    const seen = new Set();

    // Theme names (as tags)
    character.themes.forEach(theme => {
      if (theme.name && !seen.has(`theme:${theme.name}`)) {
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`🏷️ ${theme.name}`)
          .setValue(`theme:${theme.name}`)
          .setDescription('Theme name'));
        seen.add(`theme:${theme.name}`);
      }
    });

    // Theme tags
    character.themes.forEach(theme => {
      theme.tags.forEach(tag => {
        if (!seen.has(`tag:${tag}`)) {
          options.push(new StringSelectMenuOptionBuilder()
            .setLabel(`🏷️ ${tag}`)
            .setValue(`tag:${tag}`)
            .setDescription('Theme tag'));
          seen.add(`tag:${tag}`);
        }
      });
    });

    // Backpack tags
    character.backpack.forEach(tag => {
      if (!seen.has(`backpack:${tag}`)) {
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`🎒 ${tag}`)
          .setValue(`backpack:${tag}`)
          .setDescription('Backpack'));
        seen.add(`backpack:${tag}`);
      }
    });

    // Character story tags
    character.storyTags.forEach(tag => {
      if (!seen.has(`story:${tag}`)) {
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`⭐ ${tag}`)
          .setValue(`story:${tag}`)
          .setDescription('Story tag'));
        seen.add(`story:${tag}`);
      }
    });

    // Character temp statuses
    character.tempStatuses.forEach(status => {
      if (!seen.has(`tempStatus:${status}`)) {
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`📋 ${status}`)
          .setValue(`tempStatus:${status}`)
          .setDescription('Temporary status'));
        seen.add(`tempStatus:${status}`);
      }
    });

    // Scene tags
    const sceneTags = StoryTagStorage.getTags(sceneId);
    sceneTags.forEach(tag => {
      if (!seen.has(`sceneTag:${tag}`)) {
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`📍 ${tag}`)
          .setValue(`sceneTag:${tag}`)
          .setDescription('Scene tag'));
        seen.add(`sceneTag:${tag}`);
      }
    });

    // Scene statuses
    const sceneStatuses = StoryTagStorage.getStatuses(sceneId);
    sceneStatuses.forEach(status => {
      if (!seen.has(`sceneStatus:${status}`)) {
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`📍 ${status}`)
          .setValue(`sceneStatus:${status}`)
          .setDescription('Scene status'));
        seen.add(`sceneStatus:${status}`);
      }
    });

    return options;
  }

  /**
   * Collect all tags + weaknesses available for hindering a roll
   * Includes: everything from help tags PLUS theme weaknesses
   */
  collectHinderTags(character, sceneId) {
    const options = this.collectHelpTags(character, sceneId);
    const seen = new Set(options.map(opt => opt.data.value));

    // Add theme weaknesses
    character.themes.forEach(theme => {
      theme.weaknesses.forEach(weakness => {
        if (!seen.has(`weakness:${weakness}`)) {
          options.push(new StringSelectMenuOptionBuilder()
            .setLabel(`⚠️ ${weakness}`)
            .setValue(`weakness:${weakness}`)
            .setDescription('Theme weakness'));
          seen.add(`weakness:${weakness}`);
        }
      });
    });

    return options;
  }

  /**
   * Extract numeric value from a status (e.g., "sleeping-3" -> 3)
   * Returns 1 if not a status or no number found
   * @param {string} tagName - The tag/status name
   * @returns {number} The numeric value or 1
   */
  static extractStatusValue(tagName) {
    // Statuses end with -number pattern
    const match = tagName.match(/-(\d+)$/);
    return match ? parseInt(match[1], 10) : 1;
  }

  /**
   * Calculate modifier from selected tags
   * Statuses contribute their numeric value, other tags contribute 1
   * @param {Set<string>} helpTags - Set of help tag values (with prefixes)
   * @param {Set<string>} hinderTags - Set of hinder tag values (with prefixes)
   * @returns {number} The calculated modifier
   */
  static calculateModifier(helpTags, hinderTags) {
    let helpModifier = 0;
    let hinderModifier = 0;

    // Calculate help modifier
    Array.from(helpTags).forEach(value => {
      const parts = value.split(':');
      const tagName = parts.length > 1 ? parts.slice(1).join(':') : value;
      helpModifier += this.extractStatusValue(tagName);
    });

    // Calculate hinder modifier
    Array.from(hinderTags).forEach(value => {
      const parts = value.split(':');
      const tagName = parts.length > 1 ? parts.slice(1).join(':') : value;
      hinderModifier += this.extractStatusValue(tagName);
    });

    return helpModifier - hinderModifier;
  }

  /**
   * Categorize items into tags and statuses based on their format
   * @param {string[]} items - Array of item names
   * @returns {{ tags: string[], statuses: string[] }}
   */
  static categorizeItems(items) {
    const tags = [];
    const statuses = [];

    items.forEach(item => {
      if (Validation.validateStatus(item).valid) {
        statuses.push(item);
      } else {
        tags.push(item);
      }
    });

    return { tags, statuses };
  }

  /**
   * Format roll proposal content with selected tags
   * @param {Set<string>} helpTags - Set of help tag values (with prefixes)
   * @param {Set<string>} hinderTags - Set of hinder tag values (with prefixes)
   * @returns {string} Formatted content string
   */
  static formatRollProposalContent(helpTags, hinderTags) {
    // Parse help tags (extract actual names)
    const helpItemNames = Array.from(helpTags).map(value => {
      // Remove prefix (theme:, tag:, backpack:, etc.)
      const parts = value.split(':');
      return parts.length > 1 ? parts.slice(1).join(':') : value;
    });

    // Parse hinder tags (extract actual names, separate weaknesses)
    const hinderItemNames = [];
    const hinderWeaknesses = [];
    
    Array.from(hinderTags).forEach(value => {
      const parts = value.split(':');
      const name = parts.length > 1 ? parts.slice(1).join(':') : value;
      
      if (value.startsWith('weakness:')) {
        hinderWeaknesses.push(name);
      } else {
        hinderItemNames.push(name);
      }
    });

    // Categorize help items
    const helpCategorized = this.categorizeItems(helpItemNames);
    
    // Categorize hinder items
    const hinderCategorized = this.categorizeItems(hinderItemNames);

    // Calculate modifier using status values
    const modifier = this.calculateModifier(helpTags, hinderTags);
    const modifierText = modifier >= 0 ? `+${modifier}` : `${modifier}`;

    // Format help items (tags, statuses)
    const helpFormatted = (helpCategorized.tags.length > 0 || 
                          helpCategorized.statuses.length > 0)
      ? TagFormatter.formatSceneStatusInCodeBlock(
          helpCategorized.tags,
          helpCategorized.statuses,
          [] // No limits
        )
      : 'None';
    
    // Format hinder items (tags, statuses, plus weaknesses)
    const hinderParts = [];
    if (hinderCategorized.tags.length > 0) {
      hinderParts.push(TagFormatter.formatStoryTags(hinderCategorized.tags));
    }
    if (hinderCategorized.statuses.length > 0) {
      hinderParts.push(TagFormatter.formatStatuses(hinderCategorized.statuses));
    }
    if (hinderWeaknesses.length > 0) {
      hinderParts.push(TagFormatter.formatWeaknesses(hinderWeaknesses));
    }
    
    const hinderFormatted = hinderParts.length > 0
      ? `\`\`\`ansi\n${hinderParts.join(', ')}\n\`\`\``
      : 'None';

    return `**Roll Proposal: 2d6**\n\n` +
      `Select tags that help or hinder your roll.\n` +
      `**Help Tags:**\n${helpFormatted}\n` +
      `**Hinder Tags:**\n${hinderFormatted}\n` +
      `**Power:** ${modifierText}`;
  }
}

