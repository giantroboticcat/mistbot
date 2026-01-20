import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { getDbForGuild } from '../utils/Database.js';
import { CreateCharacterCommand } from '../commands/CreateCharacterCommand.js';
import { EditCharacterCommand } from '../commands/EditCharacterCommand.js';
import { CharacterView } from '../utils/CharacterView.js';
import { StatusesEditorView } from '../utils/StatusesEditorView.js';
import { Validation } from '../utils/Validation.js';
import { requireGuildId } from '../utils/GuildUtils.js';
import { WebhookSubscriptionStorage } from '../utils/WebhookSubscriptionStorage.js';
import sheetsService from '../utils/GoogleSheetsService.js';

/**
 * Handle modal submissions (character creation/editing)
 */
export async function handleModalSubmit(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  
  if (customId.startsWith('edit_character_modal_')) {
    // Handle character edit modal submission
    const characterId = parseInt(customId.split('_')[3]);
    const userId = interaction.user.id;
    
    const character = CharacterStorage.getCharacter(guildId, userId, characterId);
    if (!character) {
      await interaction.reply({
        content: 'Character not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const name = interaction.fields.getTextInputValue('character_name');
    const theme1Input = interaction.fields.getTextInputValue('theme_1');
    const theme2Input = interaction.fields.getTextInputValue('theme_2');
    const theme3Input = interaction.fields.getTextInputValue('theme_3');
    const theme4Input = interaction.fields.getTextInputValue('theme_4');

    if (!name || name.trim().length === 0) {
      await interaction.reply({
        content: 'Character name cannot be empty.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Parse all themes
    const themes = [
      CreateCharacterCommand.parseTheme(theme1Input),
      CreateCharacterCommand.parseTheme(theme2Input),
      CreateCharacterCommand.parseTheme(theme3Input),
      CreateCharacterCommand.parseTheme(theme4Input),
    ];

    // Validate themes
    const validationErrors = [];
    themes.forEach((theme, index) => {
      if (!theme.name || theme.name.length === 0) {
        validationErrors.push(`Theme ${index + 1} must have a name.`);
      }
      if (theme.tags.length === 0 && theme.weaknesses.length === 0) {
        validationErrors.push(`Theme ${index + 1} must have at least one tag or weakness.`);
      }
    });

    if (validationErrors.length > 0) {
      await interaction.reply({
        content: `**Validation Error:**\n${validationErrors.join('\n')}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Update the character
    const updatedCharacter = CharacterStorage.updateCharacter(guildId, userId, characterId, {
      name: name.trim(),
      themes: themes.map(theme => ({
        name: theme.name || '',
        tags: theme.tags || [],
        weaknesses: theme.weaknesses || [],
      })),
    });

    if (!updatedCharacter) {
      await interaction.reply({
        content: 'Failed to update character.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Build character displays
    const displayData = await CharacterView.buildCharacterDisplays(updatedCharacter, interaction);
    const allComponents = CharacterView.combineCharacterComponents(displayData, CharacterView.buildCharacterButtons(updatedCharacter));

    await interaction.reply({
      components: allComponents,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  } else if (customId.startsWith('edit_backpack_modal_')) {
    // Handle backpack edit modal submission
    const characterId = parseInt(customId.split('_')[3]);
    const userId = interaction.user.id;
    
    const character = CharacterStorage.getCharacter(guildId, userId, characterId);
    if (!character) {
      await interaction.reply({
        content: 'Character not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const backpackInput = interaction.fields.getTextInputValue('backpack_items');
    const storyTagsInput = interaction.fields.getTextInputValue('story_tags');
    
    // Parse backpack items from comma-separated string
    const backpack = backpackInput
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);

    // Parse story tags from comma-separated string
    const storyTags = storyTagsInput
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);

    // Update the character's backpack and story tags
    const updatedCharacter = CharacterStorage.updateCharacter(guildId, userId, characterId, {
      backpack: backpack,
      storyTags: storyTags,
    });

    if (!updatedCharacter) {
      await interaction.reply({
        content: 'Failed to update backpack.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Build character displays using Components V2
    const displayData = await CharacterView.buildCharacterDisplays(updatedCharacter, interaction);

    // Build character buttons using CharacterView
    const interactiveData = CharacterView.buildCharacterButtons(updatedCharacter);
    
    // Combine displays and buttons
    const allComponents = CharacterView.combineCharacterComponents(displayData, interactiveData);

    await interaction.reply({
      components: allComponents,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  } else if (customId.startsWith('statuses_add_modal_')) {
    // Handle add status modal submission
    const characterId = parseInt(customId.split('_')[3]);
    const userId = interaction.user.id;
    
    const character = CharacterStorage.getCharacter(guildId, userId, characterId);
    if (!character) {
      await interaction.reply({
        content: 'Character not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const statusName = interaction.fields.getTextInputValue('status_name')?.trim();
    if (!statusName || statusName.length === 0) {
      await interaction.reply({
        content: 'Status name cannot be empty.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Add new status (as simple string, user can add power levels later)
    const updatedStatuses = [...(character.tempStatuses || [])];
    updatedStatuses.push(statusName);

    const updatedCharacter = CharacterStorage.updateCharacter(guildId, userId, characterId, {
      tempStatuses: updatedStatuses,
    });

    if (!updatedCharacter) {
      await interaction.reply({
        content: 'Failed to add status.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Show updated editor
    const editorData = StatusesEditorView.build(updatedCharacter);
    const allComponents = StatusesEditorView.combineComponents(editorData);

    await interaction.reply({
      components: allComponents,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  } else if (customId.startsWith('edit_theme_modal_')) {
    // Handle edit single theme modal submission
    // Format: edit_theme_modal_{characterId}_{themeId} or edit_theme_modal_{characterId}_{themeId}_{messageId}
    const parts = customId.replace('edit_theme_modal_', '').split('_');
    const characterId = parseInt(parts[0]);
    const themeId = parseInt(parts[1]);
    const messageId = parts.length > 2 ? parts[2] : null; // Optional message ID to edit
    const userId = interaction.user.id;
    
    // Get character (works for both assigned and unassigned)
    const character = CharacterStorage.getCharacterById(guildId, characterId);
    if (!character) {
      await interaction.reply({
        content: 'Character not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Verify user owns the character (if it's assigned)
    if (character.user_id && character.user_id !== userId) {
      await interaction.reply({
        content: 'You can only edit your own character\'s themes.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get all form values
    const themeName = interaction.fields.getTextInputValue('theme_name')?.trim();
    if (!themeName || themeName.length === 0) {
      await interaction.reply({
        content: 'Theme name cannot be empty.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get helpful tags (comma-separated)
    const tagsInput = interaction.fields.getTextInputValue('helpful_tags')?.trim() || '';
    const tags = tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    // Get weakness tags (comma-separated)
    const weaknessesInput = interaction.fields.getTextInputValue('weakness_tags')?.trim() || '';
    const weaknesses = weaknessesInput
      .split(',')
      .map(weakness => weakness.trim())
      .filter(weakness => weakness.length > 0);

    // Get quest (optional)
    const quest = interaction.fields.getTextInputValue('quest')?.trim() || null;

    // Update the theme using updateSingleTheme
    const updatedTheme = CharacterStorage.updateSingleTheme(guildId, themeId, {
      name: themeName,
      tags: tags,
      weaknesses: weaknesses,
      quest: quest,
    });

    if (!updatedTheme) {
      await interaction.reply({
        content: 'Failed to update theme.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Reload character to get updated data
    const updatedCharacter = character.user_id 
      ? CharacterStorage.getCharacter(guildId, character.user_id, characterId)
      : CharacterStorage.getCharacterById(guildId, characterId);

    if (!updatedCharacter) {
      await interaction.reply({
        content: 'Character not found after update.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Build character displays using Components V2
    const displayData = await CharacterView.buildCharacterDisplays(updatedCharacter, interaction);

    // Build character buttons using CharacterView
    const interactiveData = CharacterView.buildCharacterButtons(updatedCharacter);
    
    // Combine displays and buttons
    const allComponents = CharacterView.combineCharacterComponents(displayData, interactiveData);

    // If we have a messageId, try to edit that message (the one that showed the select menu)
    if (messageId && interaction.channel) {
      try {
        const messageToEdit = await interaction.channel.messages.fetch(messageId);
        if (messageToEdit) {
          await messageToEdit.edit({
            components: allComponents,
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
          });
          // Acknowledge the modal submission
          await interaction.deferUpdate();
          return;
        }
      } catch (error) {
        // If we can't fetch/edit the message, fall back to replying
        console.warn(`Could not edit message ${messageId}:`, error.message);
      }
    }

    // Fallback: reply with the updated character view
    await interaction.reply({
      components: allComponents,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  }
}

/**
 * Handle edit character button interaction
 */
export async function handleEditCharacterButton(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  // Extract character ID: format is "edit_character_123"
  const characterId = parseInt(customId.replace('edit_character_', ''));
  const userId = interaction.user.id;
  
  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Show edit modal
  await EditCharacterCommand.showEditModal(interaction, character);
}

/**
 * Handle retry create character button interaction
 */
export async function handleRetryCreateCharacter(interaction, client) {
  const customId = interaction.customId;
  // Extract user ID: format is "retry_create_character_123456789"
  const userId = customId.replace('retry_create_character_', '');
  
  if (!client.characterCreationRetry || !client.characterCreationRetry.has(userId)) {
    await interaction.reply({
      content: 'No saved form data found. Please run `/char-create` again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const formValues = client.characterCreationRetry.get(userId);
  
  // Show modal with pre-filled values (this will close the button message)
  await CreateCharacterCommand.showCreateModal(interaction, formValues);
}

/**
 * Handle edit backpack button interaction
 */
export async function handleEditBackpackButton(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  // Extract character ID: format is "edit_backpack_123"
  const characterId = parseInt(customId.replace('edit_backpack_', ''));
  const userId = interaction.user.id;
  
  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Show edit backpack modal
  await EditCharacterCommand.showEditBackpackModal(interaction, character);
}

/**
 * Handle edit statuses button interaction
 */
export async function handleEditStatusesButton(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  // Extract character ID: format is "edit_statuses_123"
  const characterId = parseInt(customId.replace('edit_statuses_', ''));
  const userId = interaction.user.id;
  
  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Show interactive statuses editor
  const editorData = StatusesEditorView.build(character);
  const allComponents = StatusesEditorView.combineComponents(editorData);

  await interaction.reply({
    components: allComponents,
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle edit themes button interaction (shows select menu)
 */
export async function handleEditThemesButton(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  // Extract character ID: format is "edit_themes_123"
  const characterId = parseInt(customId.replace('edit_themes_', ''));
  const userId = interaction.user.id;
  
  // Get character (works for both assigned and unassigned)
  const character = CharacterStorage.getCharacterById(guildId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Verify user owns the character (if it's assigned)
  if (character.user_id && character.user_id !== userId) {
    await interaction.reply({
      content: 'You can only edit your own character\'s themes.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Check if character has themes
  if (!character.themes || character.themes.length === 0) {
    await interaction.reply({
      content: 'This character has no themes to edit.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Build select menu options from themes
  const options = character.themes.map((theme, index) => {
    const themeName = theme.name || `Theme ${index + 1}`;
    return new StringSelectMenuOptionBuilder()
      .setLabel(themeName)
      .setDescription(`Edit ${themeName}`)
      .setValue(`${theme.id}`);
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`select_theme_${characterId}`)
    .setPlaceholder('Select a theme to edit...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  // Cancel button to return to character view
  const cancelButton = new ButtonBuilder()
    .setCustomId(`cancel_edit_themes_${characterId}`)
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Primary);

  // Use Components V2 structure (no content field)

  await interaction.update({
    components: [
      new ActionRowBuilder().setComponents([selectMenu]),
      new ActionRowBuilder().setComponents([cancelButton])
    ],
  });
}

/**
 * Handle theme select menu interaction (shows modal for selected theme)
 */
export async function handleThemeSelectMenu(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  // Extract character ID: format is "select_theme_123"
  const characterId = parseInt(customId.replace('select_theme_', ''));
  const userId = interaction.user.id;
  
  // Get selected theme ID
  const selectedThemeId = parseInt(interaction.values[0]);
  
  // Get character (works for both assigned and unassigned)
  const character = CharacterStorage.getCharacterById(guildId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Verify user owns the character (if it's assigned)
  if (character.user_id && character.user_id !== userId) {
    await interaction.reply({
      content: 'You can only edit your own character\'s themes.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Find the theme
  const theme = character.themes.find(t => t.id === selectedThemeId);
  if (!theme) {
    await interaction.reply({
      content: 'Theme not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Find theme index for display
  const themeIndex = character.themes.findIndex(t => t.id === selectedThemeId);

  // Get the message ID from the interaction so we can edit it after modal submission
  // The message was updated by the "Edit Themes" button, so we can get its ID
  const messageId = interaction.message?.id || null;

  // Show edit theme modal (pass messageId through customId)
  const { EditSingleThemeModal } = await import('../utils/modals/EditSingleThemeModal.js');
  const modal = EditSingleThemeModal.build(theme, themeIndex, characterId, messageId);
  await interaction.showModal(modal);
}

/**
 * Handle cancel edit themes button interaction (returns to character view)
 */
export async function handleCancelEditThemesButton(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  // Extract character ID: format is "cancel_edit_themes_123"
  const characterId = parseInt(customId.replace('cancel_edit_themes_', ''));
  const userId = interaction.user.id;
  
  // Get character (works for both assigned and unassigned)
  const character = CharacterStorage.getCharacterById(guildId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Verify user owns the character (if it's assigned)
  if (character.user_id && character.user_id !== userId) {
    await interaction.reply({
      content: 'You can only edit your own character\'s themes.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Build character displays using Components V2
  const displayData = await CharacterView.buildCharacterDisplays(character, interaction);

  // Build character buttons using CharacterView
  const interactiveData = CharacterView.buildCharacterButtons(character);
  
  // Combine displays and buttons
  const allComponents = CharacterView.combineCharacterComponents(displayData, interactiveData);

  // Update the message back to character view
  await interaction.update({
    components: allComponents,
  });
}

/**
 * Handle edit single theme button interaction (legacy - for individual theme buttons)
 */
export async function handleEditThemeButton(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  // Extract character ID and theme ID: format is "edit_theme_123_456"
  const parts = customId.replace('edit_theme_', '').split('_');
  const characterId = parseInt(parts[0]);
  const themeId = parseInt(parts[1]);
  const userId = interaction.user.id;
  
  // Get character (works for both assigned and unassigned)
  const character = CharacterStorage.getCharacterById(guildId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Verify user owns the character (if it's assigned)
  if (character.user_id && character.user_id !== userId) {
    await interaction.reply({
      content: 'You can only edit your own character\'s themes.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Find the theme
  const theme = character.themes.find(t => t.id === themeId);
  if (!theme) {
    await interaction.reply({
      content: 'Theme not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Find theme index for display
  const themeIndex = character.themes.findIndex(t => t.id === themeId);

  // Show edit theme modal
  const { EditSingleThemeModal } = await import('../utils/modals/EditSingleThemeModal.js');
  const modal = EditSingleThemeModal.build(theme, themeIndex, characterId);
  await interaction.showModal(modal);
}

/**
 * Handle statuses remove select menu interaction
 */
export async function handleStatusesRemove(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const characterId = parseInt(customId.replace('statuses_remove_', ''));

  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.isStringSelectMenu()) {
    return;
  }

  const selectedValue = interaction.values[0];
  if (selectedValue === 'none') {
    // No status to remove, just update to refresh
    const editorData = StatusesEditorView.build(character);
    const allComponents = StatusesEditorView.combineComponents(editorData);
    await interaction.update({
      components: allComponents,
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }
  
  const selectedIndex = parseInt(selectedValue);
  const updatedStatuses = [...(character.tempStatuses || [])];
  
  if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < updatedStatuses.length) {
    updatedStatuses.splice(selectedIndex, 1);
    
    const updatedCharacter = CharacterStorage.updateCharacter(guildId, userId, characterId, {
      tempStatuses: updatedStatuses,
    });

    if (updatedCharacter) {
      const editorData = StatusesEditorView.build(updatedCharacter);
      const allComponents = StatusesEditorView.combineComponents(editorData);

      await interaction.update({
        components: allComponents,
        flags: MessageFlags.IsComponentsV2,
      });
    }
  }
}

/**
 * Handle statuses edit select menu interaction
 */
export async function handleStatusesEditSelect(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const characterId = parseInt(customId.replace('statuses_edit_select_', ''));

  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.isStringSelectMenu()) {
    return;
  }

  const statusIndex = parseInt(interaction.values[0]);
  const statuses = character.tempStatuses || [];
  
  if (!isNaN(statusIndex) && statusIndex >= 0 && statusIndex < statuses.length) {
    const editorData = StatusesEditorView.build(character, statusIndex);
    const allComponents = StatusesEditorView.combineComponents(editorData);

    await interaction.update({
      components: allComponents,
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

/**
 * Handle statuses editor interactions (add, toggle, done)
 */
export async function handleStatusesEditor(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  const userId = interaction.user.id;
  
  // Extract character ID from custom ID (format varies by action)
  let characterId;
  if (customId.startsWith('statuses_add_')) {
    characterId = parseInt(customId.replace('statuses_add_', ''));
  } else if (customId.startsWith('statuses_toggle_')) {
    const parts = customId.split('_');
    characterId = parseInt(parts[2]);
  } else if (customId.startsWith('statuses_done_')) {
    characterId = parseInt(customId.replace('statuses_done_', ''));
  } else {
    await interaction.reply({
      content: 'Invalid interaction.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let updatedStatuses = [...(character.tempStatuses || [])];

  if (customId.startsWith('statuses_add_')) {
    // Show modal to add new status
    const modal = new ModalBuilder()
      .setCustomId(`statuses_add_modal_${characterId}`)
      .setTitle('Add New Status');

    const nameInput = new TextInputBuilder()
      .setCustomId('status_name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter status name (e.g., "rested", "injured")')
      .setRequired(true)
      .setMaxLength(100);

    const nameLabel = new LabelBuilder()
      .setLabel('Status Name')
      .setTextInputComponent(nameInput);

    modal.addLabelComponents(nameLabel);
    await interaction.showModal(modal);
    return;
  } else if (customId.startsWith('statuses_toggle_')) {
    // Toggle power level for a status
    const parts = customId.split('_');
    const statusIdx = parseInt(parts[3]);
    const level = parseInt(parts[4]);

    if (!isNaN(statusIdx) && statusIdx >= 0 && statusIdx < updatedStatuses.length &&
        !isNaN(level) && level >= 1 && level <= 6) {
      const status = updatedStatuses[statusIdx];
      
      if (typeof status === 'object' && status.status) {
        // Update existing status object
        const powerLevels = { ...(status.powerLevels || {}) };
        powerLevels[level] = !powerLevels[level];
        
        updatedStatuses[statusIdx] = {
          status: status.status,
          powerLevels: powerLevels
        };
      } else if (typeof status === 'string') {
        // Convert string status to object with power levels
        updatedStatuses[statusIdx] = {
          status: status,
          powerLevels: { [level]: true }
        };
      }

      const updatedCharacter = CharacterStorage.updateCharacter(guildId, userId, characterId, {
        tempStatuses: updatedStatuses,
      });

      if (updatedCharacter) {
        const editorData = StatusesEditorView.build(updatedCharacter, statusIdx);
        const allComponents = StatusesEditorView.combineComponents(editorData);

        await interaction.update({
          components: allComponents,
          flags: MessageFlags.IsComponentsV2,
        });
      }
    }
    return;
  } else if (customId.startsWith('statuses_done_')) {
    // Return to character view
    const displayData = await CharacterView.buildCharacterDisplays(character, interaction);
    const allComponents = CharacterView.combineCharacterComponents(displayData, CharacterView.buildCharacterButtons(character));

    await interaction.update({
      components: allComponents,
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }
}

/**
 * Handle burn/refresh tags button interaction
 */
export async function handleBurnRefreshButton(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  // Extract character ID: format is "burn_refresh_123"
  const characterId = parseInt(customId.replace('burn_refresh_', ''));
  const userId = interaction.user.id;
  
  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Collect all burnable tags (non-status tags)
  const options = [];
  const seen = new Set();

  character.themes.forEach(theme => {
    // Theme names
    if (theme.name) {
      const tagValue = `theme:${theme.name}`;
      if (!seen.has(tagValue)) {
        const isBurned = theme.isBurned || false;
        const isStatus = Validation.validateStatus(theme.name).valid;
        // Only non-status tags can be burned
        if (!isStatus) {
          options.push(new StringSelectMenuOptionBuilder()
            .setLabel(`${isBurned ? '🔥 ' : ''}${theme.name} (Theme)`)
            .setValue(tagValue)
            .setDescription(isBurned ? 'Currently burned - select to refresh' : 'Select to burn')
            .setDefault(isBurned));
          seen.add(tagValue);
        }
      }
    }
    // Theme tags
    theme.tags.forEach(tagObj => {
      const tag = typeof tagObj === 'string' ? tagObj : tagObj.tag;
      const isBurned = typeof tagObj === 'object' ? (tagObj.isBurned || false) : false;
      const tagValue = `tag:${tag}`;
      if (!seen.has(tagValue)) {
        const isStatus = Validation.validateStatus(tag).valid;
        if (!isStatus) {
          options.push(new StringSelectMenuOptionBuilder()
            .setLabel(`${isBurned ? '🔥 ' : ''}${tag} (${theme.name})`)
            .setValue(tagValue)
            .setDescription(isBurned ? 'Currently burned - select to refresh' : 'Select to burn')
            .setDefault(isBurned));
          seen.add(tagValue);
        }
      }
    });
  });

  if (options.length === 0) {
    await interaction.reply({
      content: 'No burnable tags found. Only theme tagss can be burned.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Create select menu (split into pages if needed)
  const maxOptions = 25;
  const pages = Math.ceil(options.length / maxOptions);
  
  if (pages > 1) {
    // For now, just show first page - can be enhanced with pagination later
    const firstPageOptions = options.slice(0, maxOptions);
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`burn_refresh_select_${characterId}`)
      .setPlaceholder('Select tags to burn/refresh...')
      .setMinValues(0)
      .setMaxValues(Math.min(firstPageOptions.length, 25))
      .addOptions(firstPageOptions);
    
    await interaction.reply({
      content: `**Burn/Refresh Tags**\n\nSelect tags to burn (for +3 modifier in rolls) or refresh (if already burned).\n\n*Showing page 1 of ${pages}*`,
      components: [new ActionRowBuilder().setComponents([selectMenu])],
      flags: MessageFlags.Ephemeral,
    });
  } else {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`burn_refresh_select_${characterId}`)
      .setPlaceholder('Select tags to burn/refresh...')
      .setMinValues(0)
      .setMaxValues(Math.min(options.length, 25))
      .addOptions(options);
    
    await interaction.reply({
      content: '**Burn/Refresh Tags**\n\nSelect tags to burn (for +3 modifier in rolls) or refresh (if already burned).',
      components: [new ActionRowBuilder().setComponents([selectMenu])],
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Handle burn/refresh select menu interaction
 */
export async function handleBurnRefreshSelect(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  // Extract character ID: format is "burn_refresh_select_123"
  const characterId = parseInt(customId.replace('burn_refresh_select_', ''));
  const userId = interaction.user.id;
  
  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Get currently selected tags (these will toggle burn status)
  const selectedTags = new Set(interaction.values);
  
  // Collect currently burned tags from character
  const currentBurnedTags = new Set();
  character.themes.forEach(theme => {
    if (theme.isBurned) {
      currentBurnedTags.add(`theme:${theme.name}`);
    }
    theme.tags.forEach(tagObj => {
      const tag = typeof tagObj === 'string' ? tagObj : tagObj.tag;
      const isBurned = typeof tagObj === 'object' ? (tagObj.isBurned || false) : false;
      if (isBurned) {
        currentBurnedTags.add(`tag:${tag}`);
      }
    });
  });

  const tagsToBurn = [];
  const tagsToRefresh = [];

  // Determine which tags to burn and which to refresh
  // Tags that are currently burned but NOT selected should be refreshed (unburned)
  for (const tagValue of currentBurnedTags) {
    if (!selectedTags.has(tagValue)) {
      // Tag is burned but not selected - refresh it
      tagsToRefresh.push(tagValue);
    }
  }

  // Tags that are NOT currently burned but ARE selected should be burned
  for (const tagValue of selectedTags) {
    if (!currentBurnedTags.has(tagValue)) {
      // Tag is selected but not burned - burn it
      tagsToBurn.push(tagValue);
    }
  }
  // Update character with burned/refreshed tags
  if (tagsToBurn.length > 0) {
    CharacterStorage.markTagsAsBurned(guildId, userId, characterId, tagsToBurn);
  }
  if (tagsToRefresh.length > 0) {
    CharacterStorage.refreshBurnedTags(guildId, userId, characterId, tagsToRefresh);
  }

  // Refresh character display
  await EditCharacterCommand.displayCharacter(interaction, CharacterStorage.getCharacter(guildId, userId, characterId), true, userId);
}

/**
 * Handle delete character button interaction
 */
export async function handleDeleteCharacterButton(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  // Extract character ID: format is "delete_character_123"
  const characterId = parseInt(customId.replace('delete_character_', ''));
  const userId = interaction.user.id;
  
  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Show confirmation message with confirm/cancel buttons
  const confirmButton = new ButtonBuilder()
    .setCustomId(`delete_character_confirm_${characterId}`)
    .setLabel('Yes, Delete Character')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`delete_character_cancel_${characterId}`)
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Primary);

  const buttonRow = new ActionRowBuilder().setComponents([confirmButton, cancelButton]);

  await interaction.reply({
    content: `⚠️ **Are you sure you want to delete "${character.name}"?**\n\nAny unsynced changes will be lost.`,
    components: [buttonRow],
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Handle delete character confirmation
 */
export async function handleDeleteCharacterConfirm(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  // Extract character ID: format is "delete_character_confirm_123"
  const characterId = parseInt(customId.replace('delete_character_confirm_', ''));
  const userId = interaction.user.id;
  
  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const characterName = character.name;
  const wasActive = character.is_active;

  // Delete the character
  const deleted = CharacterStorage.deleteCharacter(guildId, userId, characterId);
  
  if (deleted) {
    // If this was the active character, check if there are other characters
    let message = `✅ Character "${characterName}" has been deleted.`;
    
    if (wasActive) {
      const remainingCharacters = CharacterStorage.getUserCharacters(guildId, userId);
      if (remainingCharacters.length > 0) {
        // Auto-activate the first remaining character
        const newActive = remainingCharacters[0];
        CharacterStorage.setActiveCharacter(guildId, userId, newActive.id);
        message += `\n\nYour active character has been set to "${newActive.name}".`;
      } else {
        message += '\n\nYou no longer have any characters. Use `/char-create` to create a new one.';
      }
    }

    // Update the interaction (it was a reply with buttons, so we can update it)
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: message,
        components: [],
      });
    } else {
      await interaction.update({
        content: message,
        components: [],
      });
    }
  } else {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: 'Failed to delete character. It may have already been deleted.',
      });
    } else {
      await interaction.reply({
        content: 'Failed to delete character. It may have already been deleted.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

/**
 * Handle delete character cancellation
 */
export async function handleDeleteCharacterCancel(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  // Extract character ID: format is "delete_character_cancel_123"
  const characterId = parseInt(customId.replace('delete_character_cancel_', ''));
  const userId = interaction.user.id;
  
  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.update({
      content: 'Character not found.',
      components: [],
    });
    return;
  }

  // Update the confirmation message to show cancellation
  await interaction.update({
    content: '❌ Character deletion cancelled.',
    components: [],
  });
  
  const displayData = await CharacterView.buildCharacterDisplays(character, interaction);

  // Build character buttons using CharacterView
  const interactiveData = CharacterView.buildCharacterButtons(character);
  
  // Combine displays and buttons
  const allComponents = CharacterView.combineCharacterComponents(displayData, interactiveData);

  await interaction.followUp({
    components: allComponents,
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle select menu for active character selection
 */
export async function handleSelectActiveCharacter(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  const userId = interaction.user.id;
  
  if (customId.startsWith('select_active_character_')) {
    const selectedValue = interaction.values[0];
    const characterId = parseInt(selectedValue);
    
    const character = CharacterStorage.getCharacter(guildId, userId, characterId);
    if (!character) {
      await interaction.reply({
        content: 'Character not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Set as active character
    const success = CharacterStorage.setActiveCharacter(guildId, userId, characterId);
    
    if (!success) {
      await interaction.reply({
        content: 'Failed to set active character.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Update the message to show the active character
    await interaction.update({
      content: `**Active Character: ${character.name}**\n\nThis character is now your active character.`,
      components: [],
    });
  }
}

/**
 * Handle autocomplete for char-lookup command
 */
export async function handleCharLookupAutocomplete(interaction) {
  const guildId = requireGuildId(interaction);
  const db = getDbForGuild(guildId);
  const focusedOption = interaction.options.getFocused(true);
  
  if (focusedOption.name === 'character') {
    const searchValue = focusedOption.value.toLowerCase();
    
    // Get all characters from database
    const stmt = db.prepare(`
      SELECT id, user_id, name
      FROM characters
      WHERE name LIKE ?
      ORDER BY name
      LIMIT 25
    `);
    
    const allCharacters = stmt.all(`%${searchValue}%`);
    
    // Sort by relevance (starts with > contains)
    const matching = allCharacters
      .sort((a, b) => {
        const aStartsWith = a.name.toLowerCase().startsWith(searchValue);
        const bStartsWith = b.name.toLowerCase().startsWith(searchValue);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 25); // Discord limit is 25 options
    
    await interaction.respond(
      matching.map(char => {
        // Handle unassigned characters (user_id is NULL)
        const ownerId = char.user_id || 'unassigned';
        const displayName = char.user_id ? char.name : `${char.name} (Unassigned)`;
        return {
          name: displayName,
          value: `${ownerId}:${char.id}`, // Encode ownerId:characterId (or 'unassigned' for unassigned)
        };
      })
    );
  }
}

/**
 * Handle "Set Sheet URL" button click (show modal)
 */
export async function handleSetSheetUrlButton(interaction, client) {
  const guildId = requireGuildId(interaction);
  const characterId = parseInt(interaction.customId.split('_').pop());
  const userId = interaction.user.id;
  
  const activeCharacter = CharacterStorage.getActiveCharacter(guildId, userId);
  
  if (!activeCharacter) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Show modal to input sheet URL
  const modal = new ModalBuilder()
    .setCustomId(`set_sheet_url_${activeCharacter.id}`)
    .setTitle('Set Google Sheet URL');

  const currentUrl = activeCharacter.google_sheet_url || '';

  const urlInput = new TextInputBuilder()
    .setCustomId('sheet_url')
    .setLabel('Google Sheets URL')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://docs.google.com/spreadsheets/d/...')
    .setValue(currentUrl)
    .setRequired(true);

  const actionRow = new ActionRowBuilder().addComponents(urlInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}

/**
 * Handle "Sync to Sheet" button click
 */
export async function handleSyncToSheetButton(interaction, client) {
  const guildId = requireGuildId(interaction);
  const characterId = parseInt(interaction.customId.split('_').pop());
  const userId = interaction.user.id;
  
  // Verify character belongs to user
  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: '❌ Character not found or you don\'t have permission to sync it.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Defer reply
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Perform sync
  const result = await CharacterStorage.syncToSheet(guildId, userId, characterId);

  if (result.success) {
    await interaction.editReply({
      content: `✅ ${result.message}\n\n**Character:** ${character.name}`,
    });
  } else {
    await interaction.editReply({
      content: `❌ ${result.message}`,
    });
  }
}

/**
 * Handle "Sync from Sheet" button click
 */
export async function handleSyncFromSheetButton(interaction, client) {
  const guildId = requireGuildId(interaction);
  const characterId = parseInt(interaction.customId.split('_').pop());
  const userId = interaction.user.id;
  
  // Verify character belongs to user
  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: '❌ Character not found or you don\'t have permission to sync it.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Defer reply
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Perform sync
  const result = await CharacterStorage.syncFromSheet(guildId, userId, characterId);

  if (result.success) {
    await interaction.editReply({
      content: `✅ ${result.message}\n\n**Character:** ${character.name}\n\nUse \`/char-lookup\` to view the updated character sheet.`,
    });
  } else {
    await interaction.editReply({
      content: `❌ ${result.message}`,
    });
  }
}

/**
 * Handle modal submit for setting sheet URL
 */
export async function handleSetSheetUrlModal(interaction) {
  const guildId = requireGuildId(interaction);
  const characterId = parseInt(interaction.customId.split('_').pop());
  const userId = interaction.user.id;
  const sheetUrl = interaction.fields.getTextInputValue('sheet_url');

  // Validate URL format
  const urlPattern = /https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/;
  if (!urlPattern.test(sheetUrl)) {
    await interaction.reply({
      content: '❌ Invalid Google Sheets URL format. Please use a URL like:\n`https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit`',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Check if this sheet URL is already in use by a different character
  const existingCharacter = CharacterStorage.getCharacterBySheetUrl(guildId, sheetUrl);
  if (existingCharacter && existingCharacter.id !== characterId) {
    await interaction.reply({
      content: `❌ This Google Sheet has already been imported by another character.\n\n**Character:** ${existingCharacter.name}\n**Owner:** <@${existingCharacter.user_id}>\n\nEach sheet can only be used by one character.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Update character
  const success = CharacterStorage.setSheetUrl(guildId, userId, characterId, sheetUrl);

  if (success) {
    await interaction.reply({
      content: '✅ Google Sheets URL updated successfully!\n\nYou can now use the sync buttons to push/pull your character data.',
      flags: MessageFlags.Ephemeral,
    });
  } else {
    await interaction.reply({
      content: '❌ Failed to update sheet URL. Character not found.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Handle toggle auto-sync button click
 */
export async function handleToggleAutoSync(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  const characterId = parseInt(customId.replace('toggle_auto_sync_', ''));
  const userId = interaction.user.id;

  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const autoSyncEnabled = character.auto_sync === 1;

  // If disabling, just turn it off and optionally remove webhook subscription
  if (autoSyncEnabled) {
    CharacterStorage.updateCharacter(guildId, userId, characterId, {
      autoSync: 0
    });

    // Delete webhook subscription if it exists (for backward compatibility with Drive API subscriptions)
    // Note: Apps Script webhooks are managed by the user in their Google Sheet, so we don't need to delete those
    if (character.google_sheet_url) {
      try {
        await WebhookSubscriptionStorage.deleteSubscription(guildId, 'character', characterId);
      } catch (error) {
        // Don't fail if subscription deletion fails - it might not exist or be an Apps Script webhook
        console.warn('Failed to delete webhook subscription when disabling auto-sync:', error?.message || error);
      }
    }

    // Refresh the character view
    const updatedCharacter = CharacterStorage.getCharacter(guildId, userId, characterId);
    const displayData = await CharacterView.buildCharacterDisplays(updatedCharacter, interaction);
    const allComponents = CharacterView.combineCharacterComponents(displayData, CharacterView.buildCharacterButtons(updatedCharacter));

    await interaction.update({
      components: allComponents,
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  // If enabling, show warning first
  const warningMessage = `⚠️ **Warning: Are You Sure You Wish to Enable Auto-sync**\n\n` +
    `When you enable auto-sync, your character data will automatically sync in both directions:\n` +
    `• **Bot → Sheet**: Changes in the bot (tags burned, tags/statuses added/removed) will automatically update your Google Sheet\n` +
    `• **Sheet → Bot**: Changes in your Google Sheet will automatically update the bot\n\n` +
    `**Important:** Make sure your Google Sheet is up to date with your latest changes. Any changes in the bot that haven't been synced to the sheet will be lost when auto-sync is enabled.\n\n` +
    `The character will be synced FROM the sheet immediately when you confirm, replacing any unsynced changes in the bot.`;

  const warningContainer = new ContainerBuilder();
  warningContainer.addTextDisplayComponents(
    new TextDisplayBuilder()
      .setContent(warningMessage)
  );

  const confirmButton = new ButtonBuilder()
    .setCustomId(`confirm_enable_auto_sync_${characterId}`)
    .setLabel('Enable Auto-sync')
    .setStyle(ButtonStyle.Success);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`cancel_enable_auto_sync_${characterId}`)
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  await interaction.update({
    components: [warningContainer, new ActionRowBuilder().setComponents([confirmButton, cancelButton])],
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle confirm enable auto-sync
 */
export async function handleConfirmEnableAutoSync(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  const characterId = parseInt(customId.replace('confirm_enable_auto_sync_', ''));
  const userId = interaction.user.id;

  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // First, sync FROM the sheet to ensure sheet is the source of truth
  const syncResult = await CharacterStorage.syncFromSheet(guildId, userId, characterId);

  if (!syncResult.success) {
    const errorContainer = new ContainerBuilder();
    errorContainer.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`❌ Failed to enable auto-sync: ${syncResult.message}`)
    );
    await interaction.update({
      components: [errorContainer],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  // Get the synced character
  const syncedCharacter = CharacterStorage.getCharacter(guildId, userId, characterId);

  // Enable auto-sync
  CharacterStorage.updateCharacter(guildId, userId, characterId, {
    autoSync: 1
  });

  // Get updated character with auto_sync enabled
  const updatedCharacter = CharacterStorage.getCharacter(guildId, userId, characterId);

  // Refresh the character view
  const displayData = await CharacterView.buildCharacterDisplays(updatedCharacter, interaction);
  
  // Create success message container
  const successMessage = `✅ Auto-sync enabled!\n\n${syncResult.message}\n\nYour character data will now automatically sync in both directions:\n` +
    `• **Bot → Sheet**: Changes in the bot will automatically update your Google Sheet\n` +
    `• **Sheet → Bot**: Changes in your Google Sheet will automatically update the bot`;
  const successContainer = new ContainerBuilder();
  successContainer.addTextDisplayComponents(
    new TextDisplayBuilder()
      .setContent(successMessage)
  );

  // Combine success message with character displays - add success container first
  const allComponents = [
    successContainer,
    ...CharacterView.combineCharacterComponents(displayData, CharacterView.buildCharacterButtons(updatedCharacter))
  ];

  await interaction.update({
    components: allComponents,
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle cancel enable auto-sync
 */
export async function handleCancelEnableAutoSync(interaction, client) {
  const guildId = requireGuildId(interaction);
  const customId = interaction.customId;
  const characterId = parseInt(customId.replace('cancel_enable_auto_sync_', ''));
  const userId = interaction.user.id;

  const character = CharacterStorage.getCharacter(guildId, userId, characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Restore the character view
  const displayData = await CharacterView.buildCharacterDisplays(character, interaction);
  const allComponents = CharacterView.combineCharacterComponents(displayData, CharacterView.buildCharacterButtons(character));

  await interaction.update({
    components: allComponents,
    flags: MessageFlags.IsComponentsV2,
  });
}


