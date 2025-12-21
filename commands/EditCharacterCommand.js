import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { CharacterView } from '../utils/CharacterView.js';
import { EditThemesModal } from '../utils/modals/EditThemesModal.js';
import { EditBackpackModal } from '../utils/modals/EditBackpackModal.js';
import { EditStatusesModal } from '../utils/modals/EditStatusesModal.js';
import { requireGuildId } from '../utils/GuildUtils.js';


/**
 * Edit an existing character
 */
export class EditCharacterCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('char-edit')
      .setDescription('Edit one of your existing characters');
  }

  async execute(interaction) {
    const guildId = requireGuildId(interaction);
    const userId = interaction.user.id;
    const activeCharacter = CharacterStorage.getActiveCharacter(guildId, userId);

    if (!activeCharacter) {
      await interaction.reply({
        content: 'You don\'t have an active character. Use `/char-create` to import from Google Sheets, or `/char-select` to select an active character.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Display character with edit button (pass userId as ownerId)
    await EditCharacterCommand.displayCharacter(interaction, activeCharacter, true, userId);
  }

  /**
   * Display character information with an edit button
   * @param {import('discord.js').Interaction} interaction - The interaction
   * @param {Object} character - The character to display
   * @param {boolean} showEditButtons - Whether to show edit buttons (default: true)
   * @param {string} ownerId - Optional owner ID to display owner information
   */
  static async displayCharacter(interaction, character, showEditButtons = true) {
    // Build character displays
    const displayData = await CharacterView.buildCharacterDisplays(character, interaction);

    const allComponents = CharacterView.combineCharacterComponents(displayData, showEditButtons ? CharacterView.buildCharacterButtons(character) : { buttonRows: [] });

    await interaction.reply({
      components: allComponents,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  }

  /**
   * Show edit modal for a character with pre-filled data
   * @param {import('discord.js').Interaction} interaction - The interaction
   * @param {Object} character - The character to edit
   */
  static async showEditModal(interaction, character) {
    const modal = EditThemesModal.build(character);
    await interaction.showModal(modal);
  }

  /**
   * Show edit backpack modal for a character
   * @param {import('discord.js').Interaction} interaction - The interaction
   * @param {Object} character - The character to edit
   */
  static async showEditBackpackModal(interaction, character) {
    const modal = EditBackpackModal.build(character);
    await interaction.showModal(modal);
  }

  /**
   * Show edit statuses modal for a character
   * @param {import('discord.js').Interaction} interaction - The interaction
   * @param {Object} character - The character to edit
   */
  static async showEditStatusesModal(interaction, character) {
    const modal = EditStatusesModal.build(character);
    await interaction.showModal(modal);
  }
}

