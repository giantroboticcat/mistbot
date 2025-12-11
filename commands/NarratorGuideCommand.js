import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } from 'discord.js';
import { Command } from './Command.js';

/**
 * Narrator guide command - provides guides for narrators
 */
export class NarratorGuideCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('narrator-guide')
      .setDescription('View guides for narrators on using the bot');
  }

  async execute(interaction) {
    // Create select menu for guide selection
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`narrator_guide_select_${interaction.user.id}`)
      .setPlaceholder('Select a guide to view...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Confirming a Roll')
          .setValue('confirming_roll')
          .setDescription('Learn how to confirm and review roll proposals'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Managing Scenes')
          .setValue('managing_scenes')
          .setDescription('Learn how to manage scene tags, statuses, and limits')
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      content: '**📚 Narrator Guides**\n\nSelect a guide from the menu below:',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }

  /**
   * Get guide content by guide ID
   * @param {string} guideId - The guide identifier
   * @returns {EmbedBuilder|null} The embed with guide content, or null if not found
   */
  static getGuide(guideId) {
    switch (guideId) {
      case 'confirming_roll':
        return this.getConfirmingRollGuide();
      case 'managing_scenes':
        return this.getManagingScenesGuide();
      default:
        return null;
    }
  }

  /**
   * Get the "Confirming a Roll" guide
   * @returns {EmbedBuilder} The guide embed
   */
  static getConfirmingRollGuide() {
    const embed = new EmbedBuilder()
      .setTitle('✅ Confirming a Roll')
      .setDescription('A guide for narrators on how to review and confirm roll proposals.')
      .setColor(0x5865F2);

    embed.addFields({
      name: '📋 Overview',
      value:
        'When a player proposes a roll, you\'ll need to review it and confirm it before they can execute it. ' +
        'This ensures the roll is appropriate and the tags are correctly applied.',
      inline: false,
    });

    embed.addFields({
      name: '✅ Confirm the Roll',
      value:
        '1. Use `/roll-confirm {roll-#}` with the roll number from the proposal\n' +
        '2. Review the proposal details\n' +
        '3. You can edit the proposal if needed:\n' +
        '   • Add or remove help/hinder tags\n' +
        '   • Adjust burned tags\n' +
        '4. Click "Confirm" to approve the roll\n' +
        '5. The player can then use `/roll {roll-#}` to roll the dice',
      inline: false,
    });

    embed.addFields({
      name: '💡 Tips for Reviewing',
      value:
        '• **Check tag relevance** - Ensure help/hinder tags make sense for the action\n' +
        '• **Verify burned tags** - Confirm the player wants to burn these tags (they\'ll be marked 🔥)\n' +
        '• **Review justification** - The player\'s notes explain their tag choices\n' +
        '• **Scene context** - Consider scene tags that might affect the roll\n' +
        '• **Power balance** - Very high modifiers might need adjustment',
      inline: false,
    });

    embed.setFooter({ 
      text: 'Use /roll-confirm {roll-#} to confirm a roll proposal' 
    });

    return embed;
  }

  /**
   * Get the "Managing Scenes" guide
   * @returns {EmbedBuilder} The guide embed
   */
  static getManagingScenesGuide() {
    const embed = new EmbedBuilder()
      .setTitle('🎬 Managing Scenes')
      .setDescription('A guide for narrators on how to manage scene tags, statuses, and limits.')
      .setColor(0x5865F2);

    embed.addFields({
      name: '📋 Overview',
      value:
        'Scenes are tracked per channel or thread. Scene tags, statuses, and limits are available ' +
        'to all players when making rolls in that scene. This helps create environmental context for rolls.' +
        'As such scene tags should be tracked in the same ooc-channel as rolls are made for that scene.',
      inline: false,
    });

    embed.addFields({
      name: '🏷️ Adding Scene Elements',
      value:
        '**Using `/scene-add-tags`:**\n' +
        '• Add tags, statuses, or limits to the current scene\n' +
        '• The bot auto-detects the type based on format:\n' +
        '  - **Tags**: Plain text (e.g., `dark, foggy, crowded`)\n' +
        '  - **Statuses**: Format `name-power` (e.g., `raining-2, windy-3`)\n' +
        '  - **Limits**: Format `name(number)` (e.g., `ammo(5), supplies(10)`)\n' +
        '• Separate multiple items with commas\n' +
        '• Use the `ephemeral` option to hide the response',
      inline: false,
    });

    embed.addFields({
      name: '🗑️ Removing Scene Elements',
      value:
        '**Using `/scene-remove-tags`:**\n' +
        '• Opens an interactive menu to select items to remove\n' +
        '• Shows all current tags, statuses, and limits\n' +
        '• Select multiple items to remove at once\n' +
        '• Useful for cleaning up scene data',
      inline: false,
    });

    embed.addFields({
      name: '👀 Viewing Scene Status',
      value:
        '**Using `/scene-status`:**\n' +
        '• View all tags, statuses, and limits in the current scene\n' +
        '• Formatted with color coding:\n' +
        '  - 🟡 **Tags** (yellow)\n' +
        '  - 🟢 **Statuses** (green)\n' +
        '  - 🔴 **Limits** (red)\n' +
        '• Helps you see what\'s currently affecting the scene',
      inline: false,
    });

    embed.addFields({
      name: '🧹 Clearing Scenes',
      value:
        '**Using `/scene-clear`:**\n' +
        '• Removes ALL tags, statuses, and limits from the scene\n' +
        '• Use with caution - this cannot be undone\n' +
        '• Useful when starting a new scene in the same channel',
      inline: false,
    });

    embed.addFields({
      name: '💡 Best Practices',
      value:
        '• **Keep scenes organized** - Clear old scene data when starting new scenes\n' +
        '• **Using limits** - Limits should only be added to a scene if you want to communicate that one exists in the scene.\n' +
        '• **One scene per channel** - Consider using dedicated channels or threads for scenes',
      inline: false,
    });

    return embed;
  }
}

