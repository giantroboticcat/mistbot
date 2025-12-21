import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { EditCharacterCommand } from './EditCharacterCommand.js';
import { requireGuildId } from '../utils/GuildUtils.js';

/**
 * View a character sheet (your own or another player's)
 */
export class ViewCharacterCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('char-lookup')
      .setDescription('View a character sheet')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('Search for a character by name')
          .setRequired(true)
          .setAutocomplete(true));
  }

  async execute(interaction) {
    const guildId = requireGuildId(interaction);
    const value = interaction.options.getString('character', true);
    const userId = interaction.user.id;
    
    // Decode ownerId:characterId from autocomplete value
    const parts = value.split(':');
    if (parts.length !== 2) {
      await interaction.reply({
        content: 'Invalid character selection.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    
    const ownerId = parts[0];
    const characterId = parseInt(parts[1]);
    
    // Get the character directly from the owner's data
    const character = CharacterStorage.getCharacter(guildId, ownerId, characterId);
    
    if (!character) {
      await interaction.reply({
        content: 'Character not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if this is the user's own character
    const isOwner = ownerId === userId;
    
    // Display character (with edit buttons only if owner, and show owner info)
    await EditCharacterCommand.displayCharacter(interaction, character, isOwner, ownerId);
  }
}

