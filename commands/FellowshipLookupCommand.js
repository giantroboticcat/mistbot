import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { FellowshipStorage } from '../utils/FellowshipStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';

/**
 * View a fellowship sheet
 */
export class FellowshipLookupCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('fellowship-lookup')
      .setDescription('View a fellowship sheet')
      .addStringOption(option =>
        option
          .setName('fellowship')
          .setDescription('Search for a fellowship by name')
          .setRequired(true)
          .setAutocomplete(true));
  }

  async execute(interaction) {
    const value = interaction.options.getString('fellowship', true);
    
    // Get the fellowship
    const fellowship = FellowshipStorage.getFellowshipByName(value);
    
    if (!fellowship) {
      await interaction.reply({
        content: 'Fellowship not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Display fellowship information
    await FellowshipLookupCommand.displayFellowship(interaction, fellowship);
  }

  /**
   * Display fellowship information
   * @param {import('discord.js').Interaction} interaction - The interaction
   * @param {Object} fellowship - The fellowship to display
   */
  static async displayFellowship(interaction, fellowship) {
    // Build response showing the fellowship
    const formatted = TagFormatter.formatTagsAndWeaknessesInCodeBlock(
      fellowship.tags || [],
      fellowship.weaknesses || []
    );
    
    const content = `**Fellowship: ${fellowship.name}**\n\n${formatted}`;

    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
    });
  }
}

