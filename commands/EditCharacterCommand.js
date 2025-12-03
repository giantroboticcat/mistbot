import { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';
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
        content: 'You don\'t have an active character. Use `/char-create` to create one, or `/char-select` to select an active character.',
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
    // Build response showing the character
    const themeParts = [];
    character.themes.forEach((theme) => {
      if (theme.tags.length > 0 || theme.weaknesses.length > 0) {
        // Extract tag names from objects and wrap burned ones with fire emojis
        const tagNames = theme.tags.map(t => {
          const tagText = typeof t === 'string' ? t : t.tag;
          const isBurned = typeof t === 'object' ? t.isBurned : false;
          return isBurned ? `🔥${tagText}🔥` : tagText;
        });
        const weaknessNames = theme.weaknesses.map(w => {
          const weakText = typeof w === 'string' ? w : w.tag;
          const isBurned = typeof w === 'object' ? w.isBurned : false;
          return isBurned ? `🔥${weakText}🔥` : weakText;
        });
        
        const formatted = TagFormatter.formatTagsAndWeaknessesInCodeBlock(tagNames, weaknessNames);
        
        // Wrap burned theme names with fire emojis on both sides
        const themeName = theme.isBurned ? `🔥${theme.name}🔥` : theme.name;
        themeParts.push(`**${themeName}:**\n${formatted}`);
      }
    });

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
        ownerInfo = `\n*Owner: ${ownerName}*`;
      } catch (error) {
        // If we can't fetch user info, just show the ID or skip
        console.error('Error fetching owner info:', error);
      }
    }

    // Format statuses (now objects with {status, powerLevels})
    const statusDisplay = character.tempStatuses.length > 0 
      ? character.tempStatuses.map(s => {
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
      }).join(', ')
      : 'None';
    
    const content = `**Character: ${character.name}**${ownerInfo}\n\n` +
      themeParts.join('\n\n') +
      `\n\n*Backpack: ${character.backpack.length > 0 ? character.backpack.join(', ') : 'Empty'}*\n*Story Tags: ${character.storyTags.length > 0 ? character.storyTags.join(', ') : 'None'}*\n*Statuses: ${statusDisplay}*`;

    if (showEditButtons) {
      // Create edit buttons
      const editButton = new ButtonBuilder()
        .setCustomId(`edit_character_${character.id}`)
        .setLabel('Edit Name/Themes')
        .setStyle(ButtonStyle.Primary);

      const backpackButton = new ButtonBuilder()
        .setCustomId(`edit_backpack_${character.id}`)
        .setLabel('Edit Backpack, Story Tags & Statuses')
        .setStyle(ButtonStyle.Secondary);

      const burnRefreshButton = new ButtonBuilder()
        .setCustomId(`burn_refresh_${character.id}`)
        .setLabel('Burn/Refresh Tags')
        .setStyle(ButtonStyle.Secondary);

      const buttonRow1 = new ActionRowBuilder().setComponents([editButton, backpackButton, burnRefreshButton]);

      // Create sync buttons (second row)
      const setSheetButton = new ButtonBuilder()
        .setCustomId(`set_sheet_url_btn_${character.id}`)
        .setLabel('🔗 Set Sheet URL')
        .setStyle(ButtonStyle.Secondary);

      const syncToButton = new ButtonBuilder()
        .setCustomId(`sync_to_sheet_${character.id}`)
        .setLabel('📤 Sync to Sheet')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!character.google_sheet_url); // Disable if no URL set

      const syncFromButton = new ButtonBuilder()
        .setCustomId(`sync_from_sheet_${character.id}`)
        .setLabel('📥 Sync from Sheet')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!character.google_sheet_url); // Disable if no URL set

      const buttonRow2 = new ActionRowBuilder().setComponents([setSheetButton, syncToButton, syncFromButton]);

      await interaction.reply({
        content,
        components: [buttonRow1, buttonRow2],
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
      
      // Format theme data: "Name | tag1, tag2 | weakness1, weakness2"
      const themeValue = `${theme.name || ''} | ${theme.tags.join(', ')} | ${theme.weaknesses.join(', ')}`;
      
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
    const statusesValue = character.tempStatuses.join(', ');
    
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

