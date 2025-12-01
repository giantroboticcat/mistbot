import { Client, GatewayIntentBits, Events, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { commands } from './commands/index.js';
import { StoryTagStorage } from './utils/StoryTagStorage.js';
import { TagFormatter } from './utils/TagFormatter.js';
import { Validation } from './utils/Validation.js';
import { CharacterStorage } from './utils/CharacterStorage.js';
import { CreateCharacterCommand } from './commands/CreateCharacterCommand.js';
import { EditCharacterCommand } from './commands/EditCharacterCommand.js';
import { RollCommand } from './commands/RollCommand.js';

// Load environment variables
dotenv.config();

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Role ID that can edit rolls (set via environment variable)
const ROLL_EDITOR_ROLE_ID = process.env.ROLL_EDITOR_ROLE_ID || null;
// Role name for error messages (optional, set via environment variable)
const ROLL_EDITOR_ROLE = process.env.ROLL_EDITOR_ROLE || 'editor role';

// Create a map of command names to command instances for quick lookup
const commandMap = new Map();
commands.forEach(command => {
  const commandData = command.getData();
  commandMap.set(commandData.name, command);
});

// When the client is ready, log in
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// Initialize tag removal selections and item type maps
client.tagRemovalSelections = new Map();
client.tagRemovalItemTypes = new Map();
// Initialize character creation state map
client.characterCreation = new Map();
// Initialize roll states map
client.rollStates = new Map();

// Handle slash command interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    // Handle autocomplete interactions
    const commandName = interaction.commandName;
    
    if (commandName === 'char-lookup') {
      const focusedOption = interaction.options.getFocused(true);
      
      if (focusedOption.name === 'character') {
        const searchValue = focusedOption.value.toLowerCase();
        
        // Get all characters from all users
        const allData = CharacterStorage.load();
        const allCharacters = [];
        
        for (const [userId, userData] of Object.entries(allData)) {
          if (userData && userData.characters) {
            userData.characters.forEach(char => {
              allCharacters.push({
                ...char,
                ownerId: userId,
              });
            });
          }
        }
        
        // Filter and sort by name match
        const matching = allCharacters
          .filter(char => char.name.toLowerCase().includes(searchValue))
          .sort((a, b) => {
            // Prioritize exact matches, then starts with, then contains
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
            value: `${char.ownerId}:${char.id}`, // Encode ownerId:characterId
          }))
        );
      }
    }
  } else if (interaction.isChatInputCommand()) {
    const command = commandMap.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing ${interaction.commandName}:`, error);
      const errorMessage = { content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  } else if (interaction.isButton()) {
    // Handle button interactions
    if (interaction.customId.startsWith('roll_now_')) {
      await handleRollButton(interaction);
    } else if (interaction.customId.startsWith('roll_cancel_')) {
      await handleRollCancel(interaction);
    } else if (interaction.customId.startsWith('edit_character_')) {
      await handleEditCharacterButton(interaction);
    } else if (interaction.customId.startsWith('edit_backpack_')) {
      await handleEditBackpackButton(interaction);
    } else if (interaction.customId.startsWith('retry_create_character_')) {
      await handleRetryCreateCharacter(interaction);
    } else {
      // Handle tag removal button
      await handleTagRemovalButton(interaction);
    }
  } else if (interaction.isStringSelectMenu()) {
    // Handle select menu interactions
    if (interaction.customId.startsWith('select_active_character_')) {
      await handleSelectActiveCharacter(interaction);
    } else if (interaction.customId.startsWith('roll_help_page_') || interaction.customId.startsWith('roll_hinder_page_')) {
      await handleRollPageSelect(interaction);
    } else if (interaction.customId.startsWith('roll_help_') || interaction.customId.startsWith('roll_hinder_')) {
      await handleRollSelect(interaction);
    } else {
      // Handle tag removal select menu
      await handleTagRemovalSelect(interaction);
    }
  } else if (interaction.isModalSubmit()) {
    // Handle modal submissions
    await handleModalSubmit(interaction);
  }
});

/**
 * Handle select menu interactions for item removal (tags, statuses, limits)
 */
async function handleTagRemovalSelect(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('select_items_to_remove_')) {
    const sceneId = customId.split('_').slice(4).join('_');
    const selectionKey = `${interaction.user.id}-${sceneId}`;

    if (!client.tagRemovalSelections.has(selectionKey)) {
      await interaction.reply({
        content: 'This selection session has expired. Please run /scene-remove again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Update selected items from the select menu values
    const selectedItems = interaction.values;
    const selectedSet = new Set(selectedItems);
    client.tagRemovalSelections.set(selectionKey, selectedSet);

    // Get item type mapping for this scene
    const itemTypeMap = client.tagRemovalItemTypes?.get(selectionKey) || new Map();

    // Separate selected items by type using the mapping
    const selectedTags = [];
    const selectedStatuses = [];
    const selectedLimits = [];

    selectedItems.forEach(item => {
      const type = itemTypeMap.get(item);
      if (type === 'tag') {
        selectedTags.push(item);
      } else if (type === 'status') {
        selectedStatuses.push(item);
      } else if (type === 'limit') {
        selectedLimits.push(item);
      }
    });

    // Build display of selected items in a single code block
    const totalSelected = selectedTags.length + selectedStatuses.length + selectedLimits.length;
    const selectedText = totalSelected > 0
      ? `\n\n**Selected items:**\n${TagFormatter.formatSceneStatusInCodeBlock(selectedTags, selectedStatuses, selectedLimits)}`
      : '\n\n*No items selected*';

    const content = `**Select items to remove:**\n` +
      `Use the dropdown below to select multiple tags, statuses, or limits. Then click "Confirm Removal" to remove them.` +
      selectedText;

    await interaction.update({
      content,
    });
  }
}

/**
 * Handle button interactions for tag removal
 */
async function handleTagRemovalButton(interaction) {
  const customId = interaction.customId;

  // Handle confirm button
  if (customId.startsWith('confirm_remove_tags_')) {
    const sceneId = customId.split('_').slice(3).join('_');
    const selectionKey = `${interaction.user.id}-${sceneId}`;

    if (!client.tagRemovalSelections.has(selectionKey)) {
      await interaction.reply({
        content: 'This selection session has expired. Please run /scene-remove again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const selectedSet = client.tagRemovalSelections.get(selectionKey);
    const selectedItems = Array.from(selectedSet);

    if (selectedItems.length === 0) {
      await interaction.reply({
        content: 'No items were selected for removal.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get item type mapping for this scene
    const itemTypeMap = client.tagRemovalItemTypes?.get(selectionKey) || new Map();

    // Separate items by type using the mapping
    const tagsToRemove = [];
    const statusesToRemove = [];
    const limitsToRemove = [];

    selectedItems.forEach(item => {
      const type = itemTypeMap.get(item);
      if (type === 'tag') {
        tagsToRemove.push(item);
      } else if (type === 'status') {
        statusesToRemove.push(item);
      } else if (type === 'limit') {
        limitsToRemove.push(item);
      }
    });

    // Remove items from storage
    const removedCounts = {};
    const remainingCounts = {};

    if (tagsToRemove.length > 0) {
      const existingTags = StoryTagStorage.getTags(sceneId);
      const updatedTags = StoryTagStorage.removeTags(sceneId, tagsToRemove);
      removedCounts.tags = existingTags.length - updatedTags.length;
      remainingCounts.tags = updatedTags.length;
    }

    if (statusesToRemove.length > 0) {
      const existingStatuses = StoryTagStorage.getStatuses(sceneId);
      const updatedStatuses = StoryTagStorage.removeStatuses(sceneId, statusesToRemove);
      removedCounts.statuses = existingStatuses.length - updatedStatuses.length;
      remainingCounts.statuses = updatedStatuses.length;
    }

    if (limitsToRemove.length > 0) {
      const existingLimits = StoryTagStorage.getLimits(sceneId);
      const updatedLimits = StoryTagStorage.removeLimits(sceneId, limitsToRemove);
      removedCounts.limits = existingLimits.length - updatedLimits.length;
      remainingCounts.limits = updatedLimits.length;
    }

    // Build response content
    const totalRemoved = (removedCounts.tags || 0) + (removedCounts.statuses || 0) + (removedCounts.limits || 0);
    const removedParts = [];
    const remainingParts = [];

    if (tagsToRemove.length > 0) {
      removedParts.push(`**Tags Removed:**\n${TagFormatter.formatTagsInCodeBlock(tagsToRemove)}`);
      if (remainingCounts.tags !== undefined) {
        const remainingTags = StoryTagStorage.getTags(sceneId);
        remainingParts.push(`**Remaining Tags (${remainingCounts.tags}):**\n${TagFormatter.formatTagsInCodeBlock(remainingTags)}`);
      }
    }

    if (statusesToRemove.length > 0) {
      removedParts.push(`**Statuses Removed:**\n${TagFormatter.formatStatusesInCodeBlock(statusesToRemove)}`);
      if (remainingCounts.statuses !== undefined) {
        const remainingStatuses = StoryTagStorage.getStatuses(sceneId);
        remainingParts.push(`**Remaining Statuses (${remainingCounts.statuses}):**\n${TagFormatter.formatStatusesInCodeBlock(remainingStatuses)}`);
      }
    }

    if (limitsToRemove.length > 0) {
      removedParts.push(`**Limits Removed:**\n${TagFormatter.formatLimitsInCodeBlock(limitsToRemove)}`);
      if (remainingCounts.limits !== undefined) {
        const remainingLimits = StoryTagStorage.getLimits(sceneId);
        remainingParts.push(`**Remaining Limits (${remainingCounts.limits}):**\n${TagFormatter.formatLimitsInCodeBlock(remainingLimits)}`);
      }
    }

    // Clean up selection and type mapping
    client.tagRemovalSelections.delete(selectionKey);
    client.tagRemovalItemTypes?.delete(selectionKey);

    // Clean up the ephemeral message by removing all components
    await interaction.update({
      content: `**Removed ${totalRemoved} item${totalRemoved !== 1 ? 's' : ''}**`,
      components: [],
    });

    // Get updated scene data for public message
    const updatedTags = StoryTagStorage.getTags(sceneId);
    const updatedStatuses = StoryTagStorage.getStatuses(sceneId);
    const updatedLimits = StoryTagStorage.getLimits(sceneId);

    // Post public message with updated scene status
    const totalCount = updatedTags.length + updatedStatuses.length + updatedLimits.length;
    const counts = [];
    if (updatedTags.length > 0) counts.push(`${updatedTags.length} tag${updatedTags.length !== 1 ? 's' : ''}`);
    if (updatedStatuses.length > 0) counts.push(`${updatedStatuses.length} status${updatedStatuses.length !== 1 ? 'es' : ''}`);
    if (updatedLimits.length > 0) counts.push(`${updatedLimits.length} limit${updatedLimits.length !== 1 ? 's' : ''}`);
    
    const formatted = TagFormatter.formatSceneStatusInCodeBlock(updatedTags, updatedStatuses, updatedLimits);
    const publicContent = `**Scene Status (${totalCount} total${counts.length > 0 ? ': ' + counts.join(', ') : ''})**\n${formatted}`;

    await interaction.followUp({
      content: publicContent,
      flags: undefined, // Public message
    });
  }
  // Handle cancel button
  else if (customId.startsWith('cancel_remove_tags_')) {
    const sceneId = customId.split('_').slice(3).join('_');
    const selectionKey = `${interaction.user.id}-${sceneId}`;

    client.tagRemovalSelections.delete(selectionKey);
    client.tagRemovalItemTypes?.delete(selectionKey);

    // Clean up the ephemeral message by removing all components
    await interaction.update({
      content: 'Tag removal cancelled.',
      components: [],
    });
  }
}

/**
 * Handle modal submissions
 */
async function handleModalSubmit(interaction) {
  const customId = interaction.customId;

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
      `\n\n*Backpack: Empty*\n*Statuses: None*`;

    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
    });
  } else if (customId.startsWith('edit_character_modal_')) {
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
async function handleEditCharacterButton(interaction) {
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
async function handleRetryCreateCharacter(interaction) {
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
async function handleEditBackpackButton(interaction) {
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
 * Handle select menu for active character selection
 */
async function handleSelectActiveCharacter(interaction) {
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
 * Check if a user can edit a roll (creator or has editor role)
 * @param {import('discord.js').Interaction} interaction - The interaction
 * @param {Object} rollState - The roll state object
 * @returns {Promise<boolean>} True if user can edit
 */
async function canEditRoll(interaction, rollState) {
  // Creator can always edit
  if (interaction.user.id === rollState.creatorId) {
    return true;
  }

  // Check if user has the editor role
  if (!interaction.member) {
    return false;
  }

  // If no role ID is configured, only creator can edit
  if (!ROLL_EDITOR_ROLE_ID) {
    return false;
  }

  try {
    return interaction.member.roles.includes(ROLL_EDITOR_ROLE_ID);
  } catch (error) {
    console.error('Error checking user roles:', error);
    return false;
  }
}

/**
 * Handle roll page selection (for pagination when >25 options)
 */
async function handleRollPageSelect(interaction) {
  const customId = interaction.customId;
  
  if (customId.startsWith('roll_help_page_') || customId.startsWith('roll_hinder_page_')) {
    // Extract rollKey: format is "roll_help_page_userId-sceneId" or "roll_hinder_page_userId-sceneId"
    const rollKey = customId.replace('roll_help_page_', '').replace('roll_hinder_page_', '');
    
    if (!client.rollStates.has(rollKey)) {
      await interaction.reply({
        content: 'This roll session has expired. Please run /roll again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rollState = client.rollStates.get(rollKey);
    
    if (rollState.rolled) {
      await interaction.reply({
        content: 'This roll has already been completed. Tags can no longer be edited.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if user can edit this roll
    const hasPermission = await canEditRoll(interaction, rollState);
    if (!hasPermission) {
      await interaction.reply({
        content: `You don't have permission to edit this roll. Only the creator or users with the "${ROLL_EDITOR_ROLE}" role can edit.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const selectedPage = parseInt(interaction.values[0]);
    
    if (customId.startsWith('roll_help_page_')) {
      rollState.helpPage = selectedPage;
    } else {
      rollState.hinderPage = selectedPage;
    }

    client.rollStates.set(rollKey, rollState);

    // Rebuild components with updated page
    const components = rebuildRollComponents(rollState, rollKey);
    
    const content = RollCommand.formatRollProposalContent(
      rollState.helpTags,
      rollState.hinderTags,
      rollState.description
    );

    await interaction.update({
      content,
      components,
    });
  }
}

/**
 * Rebuild roll components with current page state
 */
function rebuildRollComponents(rollState, rollKey) {
  const { helpOptions, hinderOptions, helpPage, hinderPage, helpTags, hinderTags } = rollState;
  return RollCommand.buildRollComponents(rollKey, helpOptions, hinderOptions, helpPage, hinderPage, helpTags, hinderTags);
}

/**
 * Handle roll select menu interactions (help/hinder tags)
 */
async function handleRollSelect(interaction) {
  const customId = interaction.customId;
  
  if (customId.startsWith('roll_help_') || customId.startsWith('roll_hinder_')) {
    // Extract rollKey: format is "roll_help_userId-sceneId" or "roll_hinder_userId-sceneId"
    const rollKey = customId.replace('roll_help_', '').replace('roll_hinder_', '');
    
    if (!client.rollStates.has(rollKey)) {
      await interaction.reply({
        content: 'This roll session has expired. Please run /roll again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rollState = client.rollStates.get(rollKey);
    
    if (rollState.rolled) {
      await interaction.reply({
        content: 'This roll has already been completed. Tags can no longer be edited.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if user can edit this roll
    const hasPermission = await canEditRoll(interaction, rollState);
    if (!hasPermission) {
      await interaction.reply({
        content: `You don't have permission to edit this roll. Only the creator or users with the "${ROLL_EDITOR_ROLE}" role can edit.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Update selected tags based on what's currently selected in the dropdown
    // Only update selections for items on the current page, preserve selections from other pages
    const selectedInDropdown = new Set(interaction.values);
    
    if (customId.startsWith('roll_help_')) {
      // Get options on the current page
      const helpStart = rollState.helpPage * 25;
      const helpEnd = Math.min(helpStart + 25, rollState.helpOptions.length);
      const currentPageOptions = rollState.helpOptions.slice(helpStart, helpEnd);
      const currentPageValues = new Set(currentPageOptions.map(opt => opt.data.value));
      
      // Remove selections for items on the current page that are no longer selected
      for (const value of rollState.helpTags) {
        if (currentPageValues.has(value) && !selectedInDropdown.has(value)) {
          rollState.helpTags.delete(value);
        }
      }
      
      // Add selections for items on the current page that are now selected
      for (const value of selectedInDropdown) {
        if (currentPageValues.has(value)) {
          rollState.helpTags.add(value);
        }
      }
    } else {
      // Get options on the current page
      const hinderStart = rollState.hinderPage * 25;
      const hinderEnd = Math.min(hinderStart + 25, rollState.hinderOptions.length);
      const currentPageOptions = rollState.hinderOptions.slice(hinderStart, hinderEnd);
      const currentPageValues = new Set(currentPageOptions.map(opt => opt.data.value));
      
      // Remove selections for items on the current page that are no longer selected
      for (const value of rollState.hinderTags) {
        if (currentPageValues.has(value) && !selectedInDropdown.has(value)) {
          rollState.hinderTags.delete(value);
        }
      }
      
      // Add selections for items on the current page that are now selected
      for (const value of selectedInDropdown) {
        if (currentPageValues.has(value)) {
          rollState.hinderTags.add(value);
        }
      }
    }

    client.rollStates.set(rollKey, rollState);

    // Rebuild components to reflect current selection state
    const components = rebuildRollComponents(rollState, rollKey);
    
    // Update the message with new tag selections
    const content = RollCommand.formatRollProposalContent(
      rollState.helpTags,
      rollState.hinderTags,
      rollState.description
    );

    await interaction.update({
      content,
      components,
    });
  }
}

/**
 * Handle roll button - perform the dice roll
 */
async function handleRollButton(interaction) {
  const customId = interaction.customId;
  
  if (customId.startsWith('roll_now_')) {
    // Extract rollKey: format is "roll_now_userId-sceneId"
    const rollKey = customId.replace('roll_now_', '');
    
    if (!client.rollStates.has(rollKey)) {
      await interaction.reply({
        content: 'This roll session has expired. Please run /roll again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rollState = client.rollStates.get(rollKey);
    
    if (rollState.rolled) {
      await interaction.reply({
        content: 'This roll has already been completed.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if user can edit this roll
    const hasPermission = await canEditRoll(interaction, rollState);
    if (!hasPermission) {
      await interaction.reply({
        content: `You don't have permission to roll. Only the creator or users with the "${ROLL_EDITOR_ROLE}" role can roll.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Mark as rolled
    rollState.rolled = true;
    client.rollStates.set(rollKey, rollState);

    // Roll 2d6
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const baseRoll = die1 + die2;

    // Calculate modifier using status values
    const modifier = RollCommand.calculateModifier(rollState.helpTags, rollState.hinderTags);
    const finalResult = baseRoll + modifier;

    // Parse help tags (extract actual names)
    const helpItemNames = Array.from(rollState.helpTags).map(value => {
      // Remove prefix (theme:, tag:, backpack:, etc.)
      const parts = value.split(':');
      return parts.length > 1 ? parts.slice(1).join(':') : value;
    });

    // Parse hinder tags (extract actual names, separate weaknesses)
    const hinderItemNames = [];
    const hinderWeaknesses = [];
    
    Array.from(rollState.hinderTags).forEach(value => {
      const parts = value.split(':');
      const name = parts.length > 1 ? parts.slice(1).join(':') : value;
      
      if (value.startsWith('weakness:')) {
        hinderWeaknesses.push(name);
      } else {
        hinderItemNames.push(name);
      }
    });

    // Categorize help items
    const helpCategorized = RollCommand.categorizeItems(helpItemNames);
    
    // Categorize hinder items
    const hinderCategorized = RollCommand.categorizeItems(hinderItemNames);

    // Format help items (tags, statuses)
    const helpFormatted = (helpCategorized.tags.length > 0 || 
                          helpCategorized.statuses.length > 0)
      ? TagFormatter.formatSceneStatusInCodeBlock(
          helpCategorized.tags,
          helpCategorized.statuses,
          [] // No limits
        )
      : 'None';
    
    // Format hinder items (tags, statuses, plus weaknesses)
    const hinderParts = [];
    if (hinderCategorized.tags.length > 0) {
      hinderParts.push(TagFormatter.formatStoryTags(hinderCategorized.tags));
    }
    if (hinderCategorized.statuses.length > 0) {
      hinderParts.push(TagFormatter.formatStatuses(hinderCategorized.statuses));
    }
    if (hinderWeaknesses.length > 0) {
      hinderParts.push(TagFormatter.formatWeaknesses(hinderWeaknesses));
    }
    
    const hinderFormatted = hinderParts.length > 0
      ? `\`\`\`ansi\n${hinderParts.join(', ')}\n\`\`\``
      : 'None';

    const modifierText = modifier >= 0 ? `+${modifier}` : `${modifier}`;

    // Determine result classification
    let resultType;
    if (finalResult >= 10) {
      resultType = 'Success';
    } else if (finalResult >= 7) {
      resultType = 'Success & Consequences';
    } else {
      resultType = 'Consequences';
    }

    let content = `**Roll Result: ${finalResult}** (${resultType})\n\n`;
    if (rollState.description) {
      content += `**${rollState.description}**\n\n`;
    }
    content += `**Dice:** ${die1} + ${die2} = ${baseRoll}\n` +
      `**Power:** ${modifierText}\n` +
      `**Help Tags:**\n${helpFormatted}\n` +
      `**Hinder Tags:**\n${hinderFormatted}`;

    await interaction.update({
      content,
      components: [], // Hide all components
    });
  }
}

/**
 * Handle roll cancel button interaction
 */
async function handleRollCancel(interaction) {
  const customId = interaction.customId;
  // Extract rollKey: format is "roll_cancel_userId-sceneId"
  const rollKey = customId.replace('roll_cancel_', '');
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  
  // Only the creator can cancel
  if (interaction.user.id !== rollState.creatorId) {
    await interaction.reply({
      content: 'Only the creator of this roll can cancel it.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (rollState.rolled) {
    await interaction.reply({
      content: 'This roll has already been completed.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Clean up roll state
  client.rollStates.delete(rollKey);

  // Update message to show cancellation
  await interaction.update({
    content: '**Roll Canceled**',
    components: [], // Hide all components
  });
}

// Log in to Discord with your client's token
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN is not set in environment variables!');
  process.exit(1);
}

client.login(token);

