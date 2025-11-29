import { SlashCommandBuilder } from 'discord.js';

/**
 * Base class for all slash commands
 */
export class Command {
  /**
   * Returns the SlashCommandBuilder for this command
   * @returns {SlashCommandBuilder}
   */
  getData() {
    throw new Error('getData() must be implemented by command class');
  }

  /**
   * Executes the command
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction object
   */
  async execute(interaction) {
    throw new Error('execute() must be implemented by command class');
  }
}

