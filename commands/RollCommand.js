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
      .setDescription('Roll 2d6 and apply tag modifiers')
      .addStringOption(option =>
        option
          .setName('description')
          .setDescription('What this roll is for (optional)')
          .setRequired(false));
  }

  async execute(interaction) {
    const userId = interaction.user.id;
    const sceneId = interaction.channelId;
    
    // Get active character
    const character = CharacterStorage.getActiveCharacter(userId);
    if (!character) {
      await interaction.reply({
        content: 'You don\'t have an active character. Use `/char-create` to create one.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Initialize roll state if needed
    if (!interaction.client.rollStates) {
      interaction.client.rollStates = new Map();
    }

    const rollKey = `${userId}-${sceneId}`;
    const description = interaction.options.getString('description') || null;
    
    // Collect all available tags for help dropdown
    const helpOptions = this.collectHelpTags(character, sceneId);
    
    // Collect all available tags + weaknesses for hinder dropdown
    const hinderOptions = this.collectHinderTags(character, sceneId);
    
    const initialHelpTags = new Set();
    const initialHinderTags = new Set();
    
    interaction.client.rollStates.set(rollKey, {
      creatorId: userId,
      characterId: character.id,
      helpTags: initialHelpTags,
      hinderTags: initialHinderTags,
      rolled: false,
      description: description,
      helpOptions: helpOptions,
      hinderOptions: hinderOptions,
      helpPage: 0,
      hinderPage: 0,
      buttons: {roll: true, cancel: true}
    });

    const components = RollCommand.buildRollComponents(rollKey, helpOptions, hinderOptions, 0, 0, initialHelpTags, initialHinderTags);

    const content = RollCommand.formatRollContent(initialHelpTags, initialHinderTags, description);

    await interaction.reply({
      content,
      components,
      flags: MessageFlags.Ephemeral,
    });
  }

  /**
   * Build roll components with pagination support
   * @param {string} rollKey - Unique identifier for this roll
   * @param {Array} helpOptions - All available help tag options
   * @param {Array} hinderOptions - All available hinder tag options
   * @param {number} helpPage - Current help page (0-indexed)
   * @param {number} hinderPage - Current hinder page (0-indexed)
   * @param {Set<string>} selectedHelpTags - Currently selected help tags
   * @param {Set<string>} selectedHinderTags - Currently selected hinder tags
   * @returns {Array} Array of ActionRowBuilder components
   */
  static buildRollComponents(rollKey, helpOptions, hinderOptions, helpPage, hinderPage, selectedHelpTags = new Set(), selectedHinderTags = new Set()) {
    // Show all options, but mark selected ones as default
    const helpPages = Math.ceil(helpOptions.length / 25);
    const hinderPages = Math.ceil(hinderOptions.length / 25);
    
    // Clamp page indices to valid ranges
    const clampedHelpPage = Math.min(helpPage, Math.max(0, helpPages - 1));
    const clampedHinderPage = Math.min(hinderPage, Math.max(0, hinderPages - 1));
    
    const rows = [];
    
    // Help dropdown row
    if (helpPages > 1) {
      // Create help page selector
      const helpPageOptions = [];
      for (let i = 0; i < helpPages; i++) {
        const start = i * 25;
        const end = Math.min(start + 25, helpOptions.length);
        helpPageOptions.push(new StringSelectMenuOptionBuilder()
          .setLabel(`Help Page ${i + 1} (${start + 1}-${end})`)
          .setValue(`${i}`)
          .setDescription(`View options ${start + 1} to ${end}`)
          .setDefault(i === clampedHelpPage));
      }
      const helpPageSelect = new StringSelectMenuBuilder()
        .setCustomId(`roll_help_page_${rollKey}`)
        .setPlaceholder('Select page...')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(helpPageOptions);
      rows.push(new ActionRowBuilder().setComponents([helpPageSelect]));
    }
    
    // Help tag select menu (current page) - show all options, mark selected ones
    const helpStart = clampedHelpPage * 25;
    const helpEnd = Math.min(helpStart + 25, helpOptions.length);
    const helpPageOptions = helpOptions.slice(helpStart, helpEnd).map(opt => {
      const isSelected = selectedHelpTags.has(opt.data.value);
      return new StringSelectMenuOptionBuilder()
        .setLabel(opt.data.label)
        .setValue(opt.data.value)
        .setDescription(opt.data.description)
        .setDefault(isSelected);
    });
    
    const helpSelect = new StringSelectMenuBuilder()
      .setCustomId(`roll_help_${rollKey}`)
      .setPlaceholder('Select tags that help the roll...')
      .setMinValues(0)
      .setMaxValues(Math.min(helpPageOptions.length, 25))
      .addOptions(helpPageOptions);
    rows.push(new ActionRowBuilder().setComponents([helpSelect]));
    
    // Hinder dropdown row
    if (hinderPages > 1) {
      // Create hinder page selector
      const hinderPageOptions = [];
      for (let i = 0; i < hinderPages; i++) {
        const start = i * 25;
        const end = Math.min(start + 25, hinderOptions.length);
        hinderPageOptions.push(new StringSelectMenuOptionBuilder()
          .setLabel(`Hinder Page ${i + 1} (${start + 1}-${end})`)
          .setValue(`${i}`)
          .setDescription(`View options ${start + 1} to ${end}`)
          .setDefault(i === clampedHinderPage));
      }
      const hinderPageSelect = new StringSelectMenuBuilder()
        .setCustomId(`roll_hinder_page_${rollKey}`)
        .setPlaceholder('Select page...')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(hinderPageOptions);
      rows.push(new ActionRowBuilder().setComponents([hinderPageSelect]));
    }
    
    // Hinder tag select menu (current page) - show all options, mark selected ones
    const hinderStart = clampedHinderPage * 25;
    const hinderEnd = Math.min(hinderStart + 25, hinderOptions.length);
    const hinderPageOptions = hinderOptions.slice(hinderStart, hinderEnd).map(opt => {
      const isSelected = selectedHinderTags.has(opt.data.value);
      return new StringSelectMenuOptionBuilder()
        .setLabel(opt.data.label)
        .setValue(opt.data.value)
        .setDescription(opt.data.description)
        .setDefault(isSelected);
    });
    
    const hinderSelect = new StringSelectMenuBuilder()
      .setCustomId(`roll_hinder_${rollKey}`)
      .setPlaceholder('Select tags that hinder the roll...')
      .setMinValues(0)
      .setMaxValues(Math.min(hinderPageOptions.length, 25))
      .addOptions(hinderPageOptions);
    rows.push(new ActionRowBuilder().setComponents([hinderSelect]));
    
    // Button row
    const rollButton = new ButtonBuilder()
      .setCustomId(`roll_now_${rollKey}`)
      .setLabel('Roll Now')
      .setStyle(ButtonStyle.Primary);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId(`roll_cancel_${rollKey}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);
    
    rows.push(new ActionRowBuilder().setComponents([rollButton, cancelButton]));
    
    return rows;
  }

  /**
   * Collect all tags available for helping a roll
   * Includes: theme tags, theme names, backpack, storyTags, tempStatuses, scene tags, scene statuses
   */
  collectHelpTags(character, sceneId) {
    const options = [];
    const seen = new Set();

    // Theme names (as tags) - yellow tag icon
    character.themes.forEach(theme => {
      if (theme.name && !seen.has(`theme:${theme.name}`)) {
        const isStatus = Validation.validateStatus(theme.name).valid;
        const icon = isStatus ? '🟢' : '🟡'; // Green for status, yellow for tag
        const type = isStatus ? 'Status' : 'Tag';
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`${icon} ${theme.name}`)
          .setValue(`theme:${theme.name}`)
          .setDescription(`Theme: ${theme.name}`));
        seen.add(`theme:${theme.name}`);
      }
    });

    // Theme tags - yellow tag icon, show which theme
    character.themes.forEach(theme => {
      theme.tags.forEach(tagObj => {
        const tag = typeof tagObj === 'string' ? tagObj : tagObj.tag;
        if (!seen.has(`tag:${tag}`)) {
          options.push(new StringSelectMenuOptionBuilder()
            .setLabel(`🟡 ${tag}`)
            .setValue(`tag:${tag}`)
            .setDescription(`Theme: ${theme.name}`));
          seen.add(`tag:${tag}`);
        }
      });
    });

    // Backpack tags - yellow tag icon
    character.backpack.forEach(tag => {
      if (!seen.has(`backpack:${tag}`)) {
        const isStatus = Validation.validateStatus(tag).valid;
        const icon = isStatus ? '🟢' : '🟡'; // Green for status, yellow for tag
        const type = isStatus ? 'Status' : 'Tag';
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`${icon} ${tag}`)
          .setValue(`backpack:${tag}`)
          .setDescription('Backpack Item'));
        seen.add(`backpack:${tag}`);
      }
    });

    // Character story tags - yellow tag icon
    character.storyTags.forEach(tag => {
      if (!seen.has(`story:${tag}`)) {
        const isStatus = Validation.validateStatus(tag).valid;
        const icon = isStatus ? '🟢' : '🟡'; // Green for status, yellow for tag
        const type = isStatus ? 'Status' : 'Tag';
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`${icon} ${tag}`)
          .setValue(`story:${tag}`)
          .setDescription('Character Story Tag'));
        seen.add(`story:${tag}`);
      }
    });

    // Character temp statuses - green status icon
    character.tempStatuses.forEach(statusObj => {
      // Extract status name and format with power level
      let statusDisplay;
      if (typeof statusObj === 'string') {
        statusDisplay = statusObj;
      } else {
        // Find highest power level
        let highestPower = 0;
        for (let p = 6; p >= 1; p--) {
          if (statusObj.powerLevels && statusObj.powerLevels[p]) {
            highestPower = p;
            break;
          }
        }
        statusDisplay = highestPower > 0 ? `${statusObj.status}-${highestPower}` : statusObj.status;
      }
      
      if (!seen.has(`tempStatus:${statusDisplay}`)) {
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`🟢 ${statusDisplay}`)
          .setValue(`tempStatus:${statusDisplay}`)
          .setDescription('Character Status'));
        seen.add(`tempStatus:${statusDisplay}`);
      }
    });

    // Scene tags - yellow tag icon
    const sceneTags = StoryTagStorage.getTags(sceneId);
    sceneTags.forEach(tag => {
      if (!seen.has(`sceneTag:${tag}`)) {
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`🟡 ${tag}`)
          .setValue(`sceneTag:${tag}`)
          .setDescription('Scene Tag'));
        seen.add(`sceneTag:${tag}`);
      }
    });

    // Scene statuses - green status icon
    const sceneStatuses = StoryTagStorage.getStatuses(sceneId);
    sceneStatuses.forEach(status => {
      if (!seen.has(`sceneStatus:${status}`)) {
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`🟢 ${status}`)
          .setValue(`sceneStatus:${status}`)
          .setDescription('Scene Status'));
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

    // Add theme weaknesses - orange weakness icon, show which theme
    character.themes.forEach(theme => {
      theme.weaknesses.forEach(weaknessObj => {
        const weakness = typeof weaknessObj === 'string' ? weaknessObj : weaknessObj.tag;
        if (!seen.has(`weakness:${weakness}`)) {
          options.push(new StringSelectMenuOptionBuilder()
            .setLabel(`🟠 ${weakness}`)
            .setValue(`weakness:${weakness}`)
            .setDescription(`Weakness: ${theme.name}`));
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
   * Only the highest status value is used per side, plus all non-status tags count as ±1
   * @param {Set<string>} helpTags - Set of help tag values (with prefixes)
   * @param {Set<string>} hinderTags - Set of hinder tag values (with prefixes)
   * @returns {number} The calculated modifier
   */
  static calculateModifier(helpTags, hinderTags) {
    // Calculate help modifier
    const helpStatuses = [];
    let helpTagCount = 0;

    Array.from(helpTags).forEach(value => {
      const parts = value.split(':');
      const tagName = parts.length > 1 ? parts.slice(1).join(':') : value;
      
      if (Validation.validateStatus(tagName).valid) {
        // It's a status, extract its value
        helpStatuses.push(this.extractStatusValue(tagName));
      } else {
        // It's a non-status tag, count it
        helpTagCount++;
      }
    });

    // Use only the highest status value (or 0 if no statuses)
    const highestHelpStatus = helpStatuses.length > 0 ? Math.max(...helpStatuses) : 0;
    const helpModifier = highestHelpStatus + helpTagCount;

    // Calculate hinder modifier
    const hinderStatuses = [];
    let hinderTagCount = 0;

    Array.from(hinderTags).forEach(value => {
      // Skip weaknesses for modifier calculation (they're just tags)
      if (value.startsWith('weakness:')) {
        hinderTagCount++;
        return;
      }

      const parts = value.split(':');
      const tagName = parts.length > 1 ? parts.slice(1).join(':') : value;
      
      if (Validation.validateStatus(tagName).valid) {
        // It's a status, extract its value
        hinderStatuses.push(this.extractStatusValue(tagName));
      } else {
        // It's a non-status tag, count it
        hinderTagCount++;
      }
    });

    // Use only the highest status value (or 0 if no statuses)
    const highestHinderStatus = hinderStatuses.length > 0 ? Math.max(...hinderStatuses) : 0;
    const hinderModifier = highestHinderStatus + hinderTagCount;

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
   * @param {string|null} description - Optional description of what the roll is for
   * @returns {string} Formatted content string
   */
  static formatRollContent(helpTags, hinderTags, description = null) {
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

    let content = `**Roll Proposal: ${description}**\n\n`;
    
    content += 'Select tags that help or hinder your roll.\n' +
      `**Help Tags:**\n${helpFormatted}\n` +
      `**Hinder Tags:**\n${hinderFormatted}\n` +
      `**Power:** ${modifierText}`;
    
    return content;
  }
}

