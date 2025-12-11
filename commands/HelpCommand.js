import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from './Command.js';

/**
 * Commands command - shows all available commands organized by category
 */
export class HelpCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('commands')
      .setDescription('Show all available commands and how to use them');
  }

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🤖 Mistbot Commands')
      .setDescription('Here are all available commands organized by category:')
      .setColor(0x5865F2);

    // Character Management
    embed.addFields({
      name: '👤 Character Management',
      value: 
        '`/char-create` - Create a new character by importing from Google Sheets\n' +
        '`/char-edit` - Edit your active character (name, themes, backpack, statuses)\n' +
        '`/char-select` - Switch between your characters\n' +
        '`/char-lookup` - View any character by name (yours or others)\n' +
        '  • Use autocomplete to search by character name\n' +
        '`/fellowship-lookup` - View a fellowship by name\n' +
        '  • Shows fellowship tags and weaknesses',
      inline: false,
    });

    // Google Sheets Integration
    embed.addFields({
      name: '📊 Google Sheets Sync',
      value:
        'When viewing your character (`/char-edit`):\n' +
        '🔗 **Set Sheet URL** - Link a Google Sheet to your character\n' +
        '📤 **Sync to Sheet** - Push character data from bot to Google Sheets\n' +
        '📥 **Sync from Sheet** - Pull character data from Google Sheets to bot',
      inline: false,
    });

    // Roll System
    embed.addFields({
      name: '🎲 Roll System',
      value:
        '`/roll-propose` - Propose a roll with help/hinder tags\n' +
        '  • Select from your character tags, statuses, scene tags, and fellowship tags\n' +
        '  • Can burn tags for extra power\n' +
        '`/roll-confirm` - Confirm/edit a proposed roll (narrator only)\n' +
        '`/roll-execute` - Execute a confirmed roll and roll the dice',
      inline: false,
    });

    // Scene Management
    embed.addFields({
      name: '🎬 Scene Management',
      value:
        '`/scene-add-tags` - Add tags, statuses, or limits to the current scene\n' +
        '`/scene-remove-tags` - Remove tags, statuses, or limits from the scene\n' +
        '`/scene-status` - View all tags, statuses, and limits in the scene\n' +
        '`/scene-clear` - Clear all scene data (use with caution!)',
      inline: false,
    });

    // Additional Info
    embed.addFields({
      name: '💡 Tips',
      value:
        '• Each user can have multiple characters, but only one active at a time\n' +
        '• Burned tags show as 🔥tag🔥 and can\'t be used until refreshed\n' +
        '• Scene tags/statuses persist per channel/thread',
      inline: false,
    });

    embed.setFooter({ 
      text: 'For Questions, Comments, or Concerns: please reach out to @GiantRoboticCat on Discord\n' +
        '`/get-started` to learn how to get started with the bot as a player.\n' + 
        '`/narrator-guide` to learn more about how to use the bot as a narrator.'
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}