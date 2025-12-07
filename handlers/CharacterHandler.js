import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { db } from '../utils/Database.js';
import { CreateCharacterCommand } from '../commands/CreateCharacterCommand.js';
import { EditCharacterCommand } from '../commands/EditCharacterCommand.js';
import { TagFormatter } from '../utils/TagFormatter.js';
import { Validation } from '../utils/Validation.js';

/**
 * Handle modal submissions (character creation/editing)
 */
export async function handleModalSubmit(interaction, client) {
  const customId = interaction.customId;

  if (customId === 'create_character_modal') {
    // Modal-based character creation is disabled - use /char-create with sheet-url instead
    await interaction.reply({
      content: '❌ Character creation via modal is disabled. Please use `/char-create` with a Google Sheets URL to import a character.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  
  // Legacy modal creation code (disabled - kept for reference)
  /*
  if (customId === 'create_character_modal') {
    const userId = interaction.user.id;
    const name = interaction.fields.getTextInputValue('character_name');
    const theme1Input = interaction.fields.getTextInputValue('theme_1');
    const theme2Input = interaction.fields.getTextInputValue('theme_2');
    const theme3Input = interaction.fields.getTextInputValue('theme_3');
    const theme4Input = interaction.fields.getTextInputValue('theme_4');

    // Store form values for potential retry
    const formValues = {
      name: name,
      theme1: theme1Input,
      theme2: theme2Input,
      theme3: theme3Input,
      theme4: theme4Input,
    };

    if (!name || name.trim().length === 0) {
      // Store values for retry
      if (!client.characterCreationRetry) {
        client.characterCreationRetry = new Map();
      }
      client.characterCreationRetry.set(userId, formValues);

      // Create retry button
      const retryButton = new ButtonBuilder()
        .setCustomId(`retry_create_character_${userId}`)
        .setLabel('Retry with Same Values')
        .setStyle(ButtonStyle.Primary);

      const buttonRow = new ActionRowBuilder().setComponents([retryButton]);

      await interaction.reply({
        content: '**Validation Error:** Character name cannot be empty.\n\nClick the button below to reopen the form with your entered values.',
        components: [buttonRow],
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
      // Store values for retry
      if (!client.characterCreationRetry) {
        client.characterCreationRetry = new Map();
      }
      client.characterCreationRetry.set(userId, formValues);

      // Create retry button
      const retryButton = new ButtonBuilder()
        .setCustomId(`retry_create_character_${userId}`)
        .setLabel('Retry with Same Values')
        .setStyle(ButtonStyle.Primary);

      const buttonRow = new ActionRowBuilder().setComponents([retryButton]);

      await interaction.reply({
        content: `**Validation Error:**\n${validationErrors.join('\n')}\n\nClick the button below to reopen the form with your entered values.`,
        components: [buttonRow],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Clear retry values on success
    if (client.characterCreationRetry) {
      client.characterCreationRetry.delete(userId);
    }

    // Create the character
    const character = CharacterStorage.createCharacter(userId, name.trim(), themes);

    // Build response showing the character
    const themeParts = [];
    character.themes.forEach((theme) => {
      if (theme.tags.length > 0 || theme.weaknesses.length > 0) {
        const formatted = TagFormatter.formatTagsAndWeaknessesInCodeBlock(theme.tags, theme.weaknesses);
        themeParts.push(`**${theme.name}:**\n${formatted}`);
      }
    });

    const content = `**Character Created: ${character.name}**\n\n` +
      themeParts.join('\n\n') +
      '\n\n*Backpack: Empty*\n*Statuses: None*';

    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
    });
  }
  */
  
  if (customId.startsWith('edit_character_modal_')) {
    // Handle character edit modal submission
    const characterId = parseInt(customId.split('_')[3]);
    const userId = interaction.user.id;
    
    const character = CharacterStorage.getCharacter(userId, characterId);
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
    const updatedCharacter = CharacterStorage.updateCharacter(userId, characterId, {
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

    // Build response showing the updated character
    const themeParts = [];
    updatedCharacter.themes.forEach((theme) => {
      if (theme.tags.length > 0 || theme.weaknesses.length > 0) {
        const formatted = TagFormatter.formatTagsAndWeaknessesInCodeBlock(theme.tags, theme.weaknesses);
        themeParts.push(`**${theme.name}:**\n${formatted}`);
      }
    });

    const content = `**Character Updated: ${updatedCharacter.name}**\n\n` +
      themeParts.join('\n') +
      `\n\n*Backpack: ${updatedCharacter.backpack.length > 0 ? updatedCharacter.backpack.join(', ') : 'Empty'}*\n*Story Tags: ${updatedCharacter.storyTags.length > 0 ? updatedCharacter.storyTags.join(', ') : 'None'}*\n*Statuses: ${updatedCharacter.tempStatuses.length > 0 ? updatedCharacter.tempStatuses.join(', ') : 'None'}*`;

    // Create edit buttons to allow further edits
    const editButton = new ButtonBuilder()
      .setCustomId(`edit_character_${updatedCharacter.id}`)
      .setLabel('Adjust Name/Themes')
      .setStyle(ButtonStyle.Primary);

    const backpackButton = new ButtonBuilder()
      .setCustomId(`edit_backpack_${updatedCharacter.id}`)
      .setLabel('Edit Backpack')
      .setStyle(ButtonStyle.Secondary);

    const buttonRow = new ActionRowBuilder().setComponents([editButton, backpackButton]);

    await interaction.reply({
      content,
      components: [buttonRow],
      flags: MessageFlags.Ephemeral,
    });
  } else if (customId.startsWith('edit_backpack_modal_')) {
    // Handle backpack edit modal submission
    const characterId = parseInt(customId.split('_')[3]);
    const userId = interaction.user.id;
    
    const character = CharacterStorage.getCharacter(userId, characterId);
    if (!character) {
      await interaction.reply({
        content: 'Character not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const backpackInput = interaction.fields.getTextInputValue('backpack_items');
    const storyTagsInput = interaction.fields.getTextInputValue('story_tags');
    const statusesInput = interaction.fields.getTextInputValue('statuses');
    
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

    // Parse statuses from comma-separated string
    const statuses = statusesInput
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);

    // Validate statuses
    const statusValidation = Validation.validateStatuses(statuses);
    if (!statusValidation.valid && statusValidation.errors) {
      await interaction.reply({
        content: `**Validation Error:**\n${statusValidation.errors.join('\n')}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Update the character's backpack, story tags, and statuses
    const updatedCharacter = CharacterStorage.updateCharacter(userId, characterId, {
      backpack: backpack,
      storyTags: storyTags,
      tempStatuses: statuses,
    });

    if (!updatedCharacter) {
      await interaction.reply({
        content: 'Failed to update backpack.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Build response showing the updated character
    const themeParts = [];
    updatedCharacter.themes.forEach((theme) => {
      if (theme.tags.length > 0 || theme.weaknesses.length > 0) {
        const formatted = TagFormatter.formatTagsAndWeaknessesInCodeBlock(theme.tags, theme.weaknesses);
        themeParts.push(`**${theme.name}:**\n${formatted}`);
      }
    });

    const content = `**Character Updated: ${updatedCharacter.name}**\n\n` +
      themeParts.join('\n') +
      `\n\n*Backpack: ${updatedCharacter.backpack.length > 0 ? updatedCharacter.backpack.join(', ') : 'Empty'}*\n*Story Tags: ${updatedCharacter.storyTags.length > 0 ? updatedCharacter.storyTags.join(', ') : 'None'}*\n*Statuses: ${updatedCharacter.tempStatuses.length > 0 ? updatedCharacter.tempStatuses.join(', ') : 'None'}*`;

    // Create edit buttons to allow further edits
    const editButton = new ButtonBuilder()
      .setCustomId(`edit_character_${updatedCharacter.id}`)
      .setLabel('Adjust Name/Themes')
      .setStyle(ButtonStyle.Primary);

    const backpackButton = new ButtonBuilder()
      .setCustomId(`edit_backpack_${updatedCharacter.id}`)
      .setLabel('Edit Backpack')
      .setStyle(ButtonStyle.Secondary);

    const buttonRow = new ActionRowBuilder().setComponents([editButton, backpackButton]);

    await interaction.reply({
      content,
      components: [buttonRow],
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Handle edit character button interaction
 */
export async function handleEditCharacterButton(interaction, client) {
  const customId = interaction.customId;
  // Extract character ID: format is "edit_character_123"
  const characterId = parseInt(customId.replace('edit_character_', ''));
  const userId = interaction.user.id;
  
  const character = CharacterStorage.getCharacter(userId, characterId);
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
  const customId = interaction.customId;
  // Extract character ID: format is "edit_backpack_123"
  const characterId = parseInt(customId.replace('edit_backpack_', ''));
  const userId = interaction.user.id;
  
  const character = CharacterStorage.getCharacter(userId, characterId);
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
 * Handle burn/refresh tags button interaction
 */
export async function handleBurnRefreshButton(interaction, client) {
  const customId = interaction.customId;
  // Extract character ID: format is "burn_refresh_123"
  const characterId = parseInt(customId.replace('burn_refresh_', ''));
  const userId = interaction.user.id;
  
  const character = CharacterStorage.getCharacter(userId, characterId);
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
  const customId = interaction.customId;
  // Extract character ID: format is "burn_refresh_select_123"
  const characterId = parseInt(customId.replace('burn_refresh_select_', ''));
  const userId = interaction.user.id;
  
  const character = CharacterStorage.getCharacter(userId, characterId);
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
    CharacterStorage.markTagsAsBurned(userId, characterId, tagsToBurn);
  }
  if (tagsToRefresh.length > 0) {
    CharacterStorage.refreshBurnedTags(userId, characterId, tagsToRefresh);
  }

  // Refresh character display
  await EditCharacterCommand.displayCharacter(interaction, CharacterStorage.getCharacter(userId, characterId), true, userId);
}

/**
 * Handle select menu for active character selection
 */
export async function handleSelectActiveCharacter(interaction, client) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  
  if (customId.startsWith('select_active_character_')) {
    const selectedValue = interaction.values[0];
    const characterId = parseInt(selectedValue);
    
    const character = CharacterStorage.getCharacter(userId, characterId);
    if (!character) {
      await interaction.reply({
        content: 'Character not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Set as active character
    const success = CharacterStorage.setActiveCharacter(userId, characterId);
    
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
      matching.map(char => ({
        name: char.name,
        value: `${char.user_id}:${char.id}`, // Encode ownerId:characterId
      }))
    );
  }
}

/**
 * Handle "Set Sheet URL" button click (show modal)
 */
export async function handleSetSheetUrlButton(interaction, client) {
  const characterId = parseInt(interaction.customId.split('_').pop());
  const userId = interaction.user.id;
  
  const activeCharacter = CharacterStorage.getActiveCharacter(userId);
  
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
  const characterId = parseInt(interaction.customId.split('_').pop());
  const userId = interaction.user.id;
  
  // Verify character belongs to user
  const character = CharacterStorage.getCharacter(userId, characterId);
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
  const result = await CharacterStorage.syncToSheet(userId, characterId);

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
  const characterId = parseInt(interaction.customId.split('_').pop());
  const userId = interaction.user.id;
  
  // Verify character belongs to user
  const character = CharacterStorage.getCharacter(userId, characterId);
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
  const result = await CharacterStorage.syncFromSheet(userId, characterId);

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
  const existingCharacter = CharacterStorage.getCharacterBySheetUrl(sheetUrl);
  if (existingCharacter && existingCharacter.id !== characterId) {
    await interaction.reply({
      content: `❌ This Google Sheet has already been imported by another character.\n\n**Character:** ${existingCharacter.name}\n**Owner:** <@${existingCharacter.user_id}>\n\nEach sheet can only be used by one character.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Update character
  const success = CharacterStorage.setSheetUrl(userId, characterId, sheetUrl);

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

