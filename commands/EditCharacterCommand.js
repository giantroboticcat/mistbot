import { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { CharacterView } from '../utils/CharacterView.js';
import { Validation } from '../utils/Validation.js';


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
    const userId = interaction.user.id;
    const activeCharacter = CharacterStorage.getActiveCharacter(userId);

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
  static async displayCharacter(interaction, character, showEditButtons = true, ownerId = null) {
    // Fetch owner info if provided
    let ownerInfo = '';
    if (ownerId) {
      try {
        // Try to get guild member first (for display name), fall back to user
        let ownerName = ownerId;
        if (interaction.guild) {
          try {
            const member = await interaction.guild.members.fetch(ownerId);
            ownerName = member.displayName || member.user.username;
          } catch {
            // If member not found, try fetching user
            const user = await interaction.client.users.fetch(ownerId);
            ownerName = user.username;
          }
        } else {
          const user = await interaction.client.users.fetch(ownerId);
          ownerName = user.username;
        }
        ownerInfo = `*Owner: ${ownerName}*`;
      } catch (error) {
        // If we can't fetch user info, just show the ID or skip
        console.error('Error fetching owner info:', error);
      }
    }

    // Add fellowship information if present
    let fellowshipInfo = '';
    if (character.fellowship) {
      fellowshipInfo = `**Fellowship: ${character.fellowship.name}**`;
    }

    // Format character content using CharacterView
    const content = CharacterView.formatCharacterContent(character, {
      ownerInfo,
      fellowshipInfo
    });

    if (showEditButtons) {
      // Build character buttons using CharacterView
      const buttonRows = CharacterView.buildCharacterButtons(character);

      await interaction.reply({
        content,
        components: buttonRows,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      // Display without edit buttons
      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  /**
   * Show edit modal for a character with pre-filled data
   * @param {import('discord.js').Interaction} interaction - The interaction
   * @param {Object} character - The character to edit
   */
  static async showEditModal(interaction, character) {
    const modal = new ModalBuilder()
      .setCustomId(`edit_character_modal_${character.id}`)
      .setTitle(`Edit Character: ${character.name}`);

    // Character name input (pre-filled)
    const nameInput = new TextInputBuilder()
      .setCustomId('character_name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your character\'s name')
      .setValue(character.name)
      .setRequired(true)
      .setMaxLength(100);

    const nameLabel = new LabelBuilder()
      .setLabel('Character Name')
      .setTextInputComponent(nameInput);

    // Theme inputs (4 themes, pre-filled)
    const themeLabels = [];
    
    for (let i = 0; i < 4; i++) {
      const theme = character.themes[i] || { name: '', tags: [], weaknesses: [] };
      
      // Extract tag names from objects
      const tagNames = theme.tags.map(t => typeof t === 'string' ? t : t.tag);
      const weaknessNames = theme.weaknesses.map(w => typeof w === 'string' ? w : w.tag);
      
      // Format theme data: "Name | tag1, tag2 | weakness1, weakness2"
      const themeValue = `${theme.name || ''} | ${tagNames.join(', ')} | ${weaknessNames.join(', ')}`;
      
      const themeInput = new TextInputBuilder()
        .setCustomId(`theme_${i + 1}`)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Theme Name | tag1, tag2 | weakness1, weakness2')
        .setValue(themeValue || '')
        .setRequired(true)
        .setMaxLength(1000);

      const themeLabel = new LabelBuilder()
        .setLabel(`Theme ${i + 1}`)
        .setTextInputComponent(themeInput);

      themeLabels.push(themeLabel);
    }

    modal.addLabelComponents(nameLabel, ...themeLabels);
    await interaction.showModal(modal);
  }

  /**
   * Show edit backpack modal for a character
   * @param {import('discord.js').Interaction} interaction - The interaction
   * @param {Object} character - The character to edit
   */
  static async showEditBackpackModal(interaction, character) {
    const modal = new ModalBuilder()
      .setCustomId(`edit_backpack_modal_${character.id}`)
      .setTitle('Edit Backpack, Story Tags & Statuses');

    // Backpack items input (pre-filled with current items)
    const backpackValue = character.backpack.join(', ');
    
    const backpackInput = new TextInputBuilder()
      .setCustomId('backpack_items')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter backpack items separated by commas (e.g., item1, item2, item3)')
      .setValue(backpackValue)
      .setRequired(false)
      .setMaxLength(1000);

    const backpackLabel = new LabelBuilder()
      .setLabel('Backpack Items')
      .setTextInputComponent(backpackInput);

    // Story tags input (pre-filled with current tags)
    const storyTagsValue = character.storyTags.join(', ');
    
    const storyTagsInput = new TextInputBuilder()
      .setCustomId('story_tags')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter story tags separated by commas (e.g., tag1, tag2, tag3)')
      .setValue(storyTagsValue)
      .setRequired(false)
      .setMaxLength(1000);

    const storyTagsLabel = new LabelBuilder()
      .setLabel('Story Tags')
      .setTextInputComponent(storyTagsInput);

    // Statuses input (pre-filled with current statuses)
    // Format statuses as "name-power" for display
    const statusesValue = character.tempStatuses.map(s => {
      if (typeof s === 'string') return s;
      // Find highest power level
      let highestPower = 0;
      for (let p = 6; p >= 1; p--) {
        if (s.powerLevels && s.powerLevels[p]) {
          highestPower = p;
          break;
        }
      }
      return highestPower > 0 ? `${s.status}-${highestPower}` : s.status;
    }).join(', ');
    
    const statusesInput = new TextInputBuilder()
      .setCustomId('statuses')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter statuses separated by commas (e.g., sleeping-3, rested-2)')
      .setValue(statusesValue)
      .setRequired(false)
      .setMaxLength(1000);

    const statusesLabel = new LabelBuilder()
      .setLabel('Statuses')
      .setTextInputComponent(statusesInput);

    modal.addLabelComponents(backpackLabel, storyTagsLabel, statusesLabel);
    await interaction.showModal(modal);
  }
}

