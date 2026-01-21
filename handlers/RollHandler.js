import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, CommandInteractionOptionResolver } from 'discord.js';
import { RollView } from '../utils/RollView.js';
import { RollStorage } from '../utils/RollStorage.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { StoryTagStorage } from '../utils/StoryTagStorage.js';
import { Validation } from '../utils/Validation.js';
import { TagEntity } from '../utils/TagEntity.js';
import RollStatus from '../constants/RollStatus.js';
import { getServerEnv } from '../utils/ServerConfig.js';
import { getGuildId, requireGuildId } from '../utils/GuildUtils.js';

/**
 * Check if a TagEntity already exists in a Set by comparing keys
 * @param {Set<TagEntity>} tagSet - Set of TagEntity objects
 * @param {TagEntity} entity - TagEntity to check for
 * @returns {TagEntity|null} Existing entity if found, null otherwise
 */
function findEntityInSet(tagSet, entity) {
  const key = entity.getKey();
  for (const existingEntity of tagSet) {
    if (existingEntity.getKey() === key) {
      return existingEntity;
    }
  }
  return null;
}

/**
 * Get the name range for a page of items
 * @param {Array} items - Array of items (characters or tag options)
 * @param {number} page - Page number (0-indexed)
 * @param {number} itemsPerPage - Number of items per page
 * @param {Function} getName - Function to get the name from an item
 * @returns {string} Formatted range like "A-Me" or "Mf-Z"
 */
function getNameRangeForPage(items, page, itemsPerPage, getName) {
  const start = page * itemsPerPage;
  const end = Math.min(start + itemsPerPage, items.length);
  
  if (items.length === 0 || start >= items.length) {
    return '';
  }
  
  const firstItem = items[start];
  const lastItem = items[end - 1];
  
  if (!firstItem || !lastItem) {
    return '';
  }
  
  const firstName = getName(firstItem);
  const lastName = getName(lastItem);
  
  // If only one item on the page, just return the name (truncated if needed)
  if (firstName === lastName || start === end - 1) {
    return firstName.length > 25 ? firstName.substring(0, 22) + '...' : firstName;
  }
  
  // Format as "FirstName-LastName" but keep it concise
  // Discord label limit is 100, but we want to keep it readable
  const maxLength = 30; // Reasonable length for range display
  
  let firstDisplay = firstName;
  let lastDisplay = lastName;
  
  // If names are too long, truncate them
  if (firstDisplay.length > maxLength) {
    firstDisplay = firstDisplay.substring(0, maxLength - 3) + '...';
  }
  if (lastDisplay.length > maxLength) {
    lastDisplay = lastDisplay.substring(0, maxLength - 3) + '...';
  }
  
  return `${firstDisplay}-${lastDisplay}`;
}

/**
 * Check if a user can edit a roll (creator or has editor role)
 * @param {import('discord.js').Interaction} interaction - The interaction
 * @param {Object} rollState - The roll state object
 * @returns {Promise<boolean>} True if user can edit
 */
export async function canEditRoll(interaction, rollState) {
  // Creator can always edit
  if (interaction.user.id === rollState.creatorId) {
    return true;
  }

  // Check if user has the editor role
  if (!interaction.member) {
    return false;
  }

  const guildId = getGuildId(interaction);
  const rollEditorRoleId = getServerEnv('ROLL_EDITOR_ROLE_ID', guildId);

  // If no role ID is configured, only creator can edit
  if (!rollEditorRoleId) {
    return false;
  }

  try {
    return interaction.member.roles.includes(rollEditorRoleId);
  } catch (error) {
    console.error('Error checking user roles:', error);
    return false;
  }
}

/**
 * Combine display and interactive components in the correct order
 */
export function combineRollComponents(displayData, interactiveComponents) {
  return [
    displayData.descriptionContainer,
    ...(interactiveComponents.descriptionRows || []),
    displayData.helpContainer,
    ...interactiveComponents.helpRows,
    displayData.hinderContainer,
    ...interactiveComponents.hinderRows,
    ...interactiveComponents.submitRows,
    // displayData.footerDisplay
  ];
}

/**
 * Refetch help and hinder tag options from the character and update rollState
 * This ensures options are fresh whenever the roll view is rebuilt
 * @param {Object} rollState - The roll state object
 * @param {string} guildId - Guild ID
 * @returns {Object} { helpOptions, hinderOptions }
 */
function refetchTagOptions(rollState, guildId) {
  // Get the character from rollState
  const character = CharacterStorage.getCharacterById(guildId, rollState.characterId);
  if (!character) {
    // If character not found, return existing options
    return {
      helpOptions: rollState.helpOptions || [],
      hinderOptions: rollState.hinderOptions || []
    };
  }

  // Refetch help options (exclude burned tags, exclude weaknesses)
  const helpOptions = RollView.collectTags(character, rollState.sceneId, StoryTagStorage, false, guildId, false);
  
  // Refetch hinder options (exclude burned tags, include weaknesses)
  const hinderOptions = RollView.collectTags(character, rollState.sceneId, StoryTagStorage, false, guildId, true);

  // Update rollState with fresh options
  rollState.helpOptions = helpOptions;
  rollState.hinderOptions = hinderOptions;

  return { helpOptions, hinderOptions };
}

/**
 * Handle roll page selection (for pagination when >25 options)
 */
export async function handleRollPageSelect(interaction, client) {
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
    
    // Check if user can edit this roll (for confirm views, check narrator permissions)
    const guildId = getGuildId(interaction);
    const rollEditorRole = getServerEnv('ROLL_EDITOR_ROLE', guildId, 'editor role');
    let hasPermission = false;
    if (rollKey.startsWith('confirm_')) {
      // For confirm views, only narrators can edit
      const rollEditorRoleId = getServerEnv('ROLL_EDITOR_ROLE_ID', guildId);
      if (rollEditorRoleId) {
        try {
          hasPermission = interaction.member.roles.includes(rollEditorRoleId);
        } catch (error) {
          hasPermission = false;
        }
      }
    } else {
      if (rollState.rolled) {
        await interaction.reply({
          content: 'This roll has already been completed. Tags can no longer be edited.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      hasPermission = await canEditRoll(interaction, rollState);
    }
    
    if (!hasPermission) {
      await interaction.reply({
        content: `You don't have permission to edit this roll. Only the creator or users with the "${rollEditorRole}" role can edit.`,
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

    // Refetch tag options from character
    const { helpOptions, hinderOptions } = refetchTagOptions(rollState, guildId);
    client.rollStates.set(rollKey, rollState); // Update rollState with fresh options

    // Rebuild components with updated page    
    let interactiveComponents = RollView.buildRollInteractives(rollKey, helpOptions, hinderOptions, rollState.helpPage, 
      rollState.hinderPage, rollState.helpTags, rollState.hinderTags, rollState.buttons, rollState.burnedTags, rollState.justificationNotes, rollState.showJustificationButton, rollState.helpFromCharacterIdMap || new Map(), rollState.hinderFromCharacterIdMap || new Map(), rollState.mightModifier || 0);
    
    let title;
    if (rollKey.startsWith('confirm_')) {
      const rollId = rollKey.replace('confirm_', '');
      title = `Reviewing Roll Proposal #${rollId}`;
    } else {
      title = 'Roll Proposal';
    }

    let displayData = RollView.buildRollDisplays(
      rollState,
      {
        //todo need to make sure the description text gets added that is passed in from the command
        title: title,
        descriptionText: `**Player:** <@${rollState.creatorId}>`,
        guildId: requireGuildId(interaction),
      }
    );

    // Combine Components V2 display components with interactive components in the right order
    const allComponents = combineRollComponents(displayData, interactiveComponents);

    await interaction.update({
      components: allComponents,
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

/**
 * Handle roll select menu interactions (help/hinder tags)
 */
export async function handleRollSelect(interaction, client) {
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
    
    // Check if user can edit this roll (for confirm views, check narrator permissions)
    const guildId = getGuildId(interaction);
    const rollEditorRole = getServerEnv('ROLL_EDITOR_ROLE', guildId, 'editor role');
    let hasPermission = false;
    if (rollKey.startsWith('confirm_')) {
      // For confirm views, only narrators can edit
      const rollEditorRoleId = getServerEnv('ROLL_EDITOR_ROLE_ID', guildId);
      if (rollEditorRoleId) {
        try {
          hasPermission = interaction.member.roles.includes(rollEditorRoleId);
        } catch (error) {
          hasPermission = false;
        }
      }
    } else {
      if (rollState.rolled) {
        await interaction.reply({
          content: 'This roll has already been completed. Tags can no longer be edited.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      hasPermission = await canEditRoll(interaction, rollState);
    }
    
    if (!hasPermission) {
      await interaction.reply({
        content: `You don't have permission to edit this roll. Only the creator or users with the "${rollEditorRole}" role can edit.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Update selected tags based on what's currently selected in the dropdown
    // Only update selections for items on the current page, preserve selections from other pages
    // Parse JSON values to TagEntity objects
    const selectedEntities = new Set();
    const selectedEntityKeys = new Set();
    for (const value of interaction.values) {
      const entity = RollView.decodeEntityValue(value);
      if (entity) {
        selectedEntities.add(entity);
        selectedEntityKeys.add(entity.getKey());
      }
    }
    
    if (customId.startsWith('roll_help_')) {
      // Get options on the current page
      const helpStart = rollState.helpPage * 25;
      const helpEnd = Math.min(helpStart + 25, rollState.helpOptions.length);
      const currentPageOptions = rollState.helpOptions.slice(helpStart, helpEnd);
      const currentPageEntityKeys = new Set();
      const currentPageEntities = new Map(); // Map from key to entity
      for (const opt of currentPageOptions) {
        const entity = RollView.decodeEntityValue(opt.data.value);
        if (entity) {
          const key = entity.getKey();
          currentPageEntityKeys.add(key);
          currentPageEntities.set(key, entity);
        }
      }
      
      // Remove selections for items on the current page that are no longer selected
      for (const tagEntity of rollState.helpTags) {
        const key = tagEntity.getKey();
        if (currentPageEntityKeys.has(key) && !selectedEntityKeys.has(key)) {
          rollState.helpTags.delete(tagEntity);
          // Also remove from burnedTags if it was burned
          for (const burnedTag of rollState.burnedTags) {
            if (burnedTag.getKey && burnedTag.getKey() === key) {
              rollState.burnedTags.delete(burnedTag);
              break;
            }
          }
        }
      }
      
      // Add selections for items on the current page that are now selected
      for (const entity of selectedEntities) {
        const key = entity.getKey();
        if (currentPageEntityKeys.has(key)) {
          // Check if entity already exists before adding
          if (!findEntityInSet(rollState.helpTags, entity)) {
            rollState.helpTags.add(entity);
          }
        }
      }
    } else {
      // Get options on the current page
      const hinderStart = rollState.hinderPage * 25;
      const hinderEnd = Math.min(hinderStart + 25, rollState.hinderOptions.length);
      const currentPageOptions = rollState.hinderOptions.slice(hinderStart, hinderEnd);
      const currentPageEntityKeys = new Set();
      for (const opt of currentPageOptions) {
        const entity = RollView.decodeEntityValue(opt.data.value);
        if (entity) {
          currentPageEntityKeys.add(entity.getKey());
        }
      }
      
      // Remove selections for items on the current page that are no longer selected
      for (const tagEntity of rollState.hinderTags) {
        const key = tagEntity.getKey();
        if (currentPageEntityKeys.has(key) && !selectedEntityKeys.has(key)) {
          rollState.hinderTags.delete(tagEntity);
        }
      }
      
      // Add selections for items on the current page that are now selected
      for (const entity of selectedEntities) {
        const key = entity.getKey();
        if (currentPageEntityKeys.has(key)) {
          // Check if entity already exists before adding
          if (!findEntityInSet(rollState.hinderTags, entity)) {
            rollState.hinderTags.add(entity);
          }
        }
      }
    }

    client.rollStates.set(rollKey, rollState);

    // Refetch tag options from character
    const { helpOptions, hinderOptions } = refetchTagOptions(rollState, guildId);
    client.rollStates.set(rollKey, rollState); // Update rollState with fresh options

    let interactiveComponents = RollView.buildRollInteractives(rollKey, helpOptions, hinderOptions, rollState.helpPage, 
      rollState.hinderPage, rollState.helpTags, rollState.hinderTags, rollState.buttons, rollState.burnedTags, 
      rollState.justificationNotes, rollState.showJustificationButton, rollState.helpFromCharacterIdMap || new Map(), rollState.hinderFromCharacterIdMap || new Map(), rollState.mightModifier || 0);    

    // Update the message with new tag selections
    let title;
    if (rollKey.startsWith('confirm_')) {
      const rollId = rollKey.replace('confirm_', '');
      title = `Reviewing Roll Proposal #${rollId}`;
    } else {
      title = 'Roll Proposal';
    }


    let displayData = RollView.buildRollDisplays(
      rollState,
      {
        title: title,
        descriptionText: `**Player:** <@${rollState.creatorId}>`,
        guildId: guildId,
      }
    );
    

    // Combine Components V2 display components with interactive components in the right order
    const allComponents = combineRollComponents(displayData, interactiveComponents);

    await interaction.update({
      components: allComponents,
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

/**
 * Handle roll burn selection (selecting which tags to burn)
 */
export async function handleRollBurn(interaction, client) {
  const customId = interaction.customId;
  // Extract rollKey: format is "roll_burn_userId-sceneId" or "roll_burn_confirm_rollId"
  const rollKey = customId.replace('roll_burn_', '');

  const guildId = requireGuildId(interaction);
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  
  // Check if user can edit this roll (for confirm views, check narrator permissions)
  let hasPermission = false;
  if (rollKey.startsWith('confirm_')) {
    // For confirm views, only narrators can edit
    const ROLL_EDITOR_ROLE_ID = process.env.ROLL_EDITOR_ROLE_ID || null;
    if (ROLL_EDITOR_ROLE_ID) {
      try {
        hasPermission = interaction.member.roles.includes(ROLL_EDITOR_ROLE_ID);
      } catch (error) {
        hasPermission = false;
      }
    }
  } else {
    hasPermission = interaction.user.id === rollState.creatorId;
  }
  
  if (!hasPermission) {
    await interaction.reply({
      content: 'You don\'t have permission to edit this roll.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Initialize burnedTags if it doesn't exist
  if (!rollState.burnedTags) {
    rollState.burnedTags = new Set();
  }

  // Only one tag can be burned per roll
  // Clear all burned tags first
  rollState.burnedTags.clear();

  // If a tag is selected, add only that one tag (must be in helpTags)
  if (interaction.values.length > 0) {
    const selectedTagString = interaction.values[0];
    const selectedTagEntity = RollView.decodeEntityValue(selectedTagString);
    console.log(selectedTagString, selectedTagEntity);
    if (selectedTagEntity) {
      const selectedKey = selectedTagEntity.getKey();
      // Find the matching entity in helpTags by comparing keys
      for (const helpTagEntity of rollState.helpTags) {
        if (helpTagEntity.getKey() === selectedKey) {
          rollState.burnedTags.add(helpTagEntity);
          break;
        }
      }
    }
  }

  client.rollStates.set(rollKey, rollState);

  // Refetch tag options from character
  const { helpOptions, hinderOptions } = refetchTagOptions(rollState, guildId);
  client.rollStates.set(rollKey, rollState); // Update rollState with fresh options

  // Rebuild components to reflect current selection state
  let interactiveComponents = RollView.buildRollInteractives(rollKey, helpOptions, hinderOptions, rollState.helpPage, 
    rollState.hinderPage, rollState.helpTags, rollState.hinderTags, rollState.buttons, rollState.burnedTags, rollState.justificationNotes, rollState.showJustificationButton, rollState.helpFromCharacterIdMap || new Map(), rollState.hinderFromCharacterIdMap || new Map(), rollState.mightModifier || 0);
  
  // Update the message with new tag selections
  let title;
  if (rollKey.startsWith('confirm_')) {
    const rollId = rollKey.replace('confirm_', '');
    title = `Reviewing Roll Proposal #${rollId}`;
  } else {
    title = 'Roll Proposal';
  }
  
  let displayData = RollView.buildRollDisplays(
  rollState,
  {
    title: title,
    descriptionText: `**Player:** <@${rollState.creatorId}>`,
    guildId: guildId,
  }
);

  // Combine Components V2 display components with interactive components in the right order
  const allComponents = combineRollComponents(displayData, interactiveComponents);

  await interaction.update({
    components: allComponents,
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle roll cancel button interaction
 */
export async function handleRollCancel(interaction, client) {
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

  let rollCanceledText = new TextDisplayBuilder().setContent(`*Roll Canceled*`);

  // Update message to show cancellation
  await interaction.update({
    components: [rollCanceledText],
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle roll submit button (submit proposal for narrator approval)
 */
export async function handleRollSubmit(interaction, client) {
  const customId = interaction.customId;
  const rollKey = customId.replace('roll_submit_', '');
  
  if (!client.rollStates.has(rollKey)) {
    const rollType = rollKey.includes('reaction') ? '/roll-reaction' : rollKey.startsWith('amend_') ? '/roll-amend' : '/roll-propose';
    await interaction.reply({
      content: `This roll session has expired. Please run ${rollType} again.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  
  // Only the creator can submit
  if (interaction.user.id !== rollState.creatorId) {
    await interaction.reply({
      content: 'Only the creator of this roll can submit it.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = requireGuildId(interaction);
  let rollId;
  const isAmendment = rollKey.startsWith('amend_');
  
  if (isAmendment) {
    // This is an amendment - update existing roll
    rollId = rollState.rollId;
    
    // Delete invalid tags before amending
    RollStorage.deleteInvalidTags(guildId, rollId);
    
    // Determine new status: if it was CONFIRMED, set back to PROPOSED
    const newStatus = rollState.originalStatus === RollStatus.CONFIRMED 
      ? RollStatus.PROPOSED 
      : rollState.originalStatus;
    
    // Update the roll with new tags and status
    RollStorage.updateRoll(guildId, rollId, {
      helpTags: rollState.helpTags,
      hinderTags: rollState.hinderTags,
      burnedTags: rollState.burnedTags || new Set(),
      helpFromCharacterIdMap: rollState.helpFromCharacterIdMap || new Map(),
      status: newStatus,
      mightModifier: rollState.mightModifier !== undefined ? rollState.mightModifier : 0,
      // Clear confirmed_by if resetting to proposed
      confirmedBy: newStatus === RollStatus.PROPOSED ? null : undefined,
    });
  } else {
    // This is a new roll - create it
    rollId = RollStorage.createRoll(guildId, {
      creatorId: rollState.creatorId,
      characterId: rollState.characterId,
      sceneId: interaction.channelId,
      helpTags: rollState.helpTags,
      hinderTags: rollState.hinderTags,
      burnedTags: rollState.burnedTags || new Set(),
      helpFromCharacterIdMap: rollState.helpFromCharacterIdMap || new Map(),
      description: rollState.description,
      narrationLink: rollState.narrationLink || null,
      justificationNotes: rollState.justificationNotes || null,
      reactionToRollId: rollState.reactionToRollId || null,
      isReaction: rollState.isReaction || false,
      mightModifier: rollState.mightModifier !== undefined ? rollState.mightModifier : 0,
    });
  }

  // Clean up temporary state
  client.rollStates.delete(rollKey);

  // Update ephemeral message to show submission (use Components V2 to match original message)
  const submitContainer = new ContainerBuilder();
  const isReaction = rollState.isReaction || false;
  const rollType = isReaction ? 'Reaction Roll' : 'Action Roll';
  
  let submitMessage;
  if (isAmendment) {
    const statusChange = rollState.originalStatus === RollStatus.CONFIRMED 
      ? '\n\nThe roll has been reset to proposed status and needs narrator confirmation again.' 
      : '';
    submitMessage = `**Roll #${rollId} Amended!**\n\nYour roll has been updated with the new tags.${statusChange}`;
  } else {
    submitMessage = `**${rollType} #${rollId} Submitted!**\n\nYour ${rollType.toLowerCase()} proposal has been submitted for narrator approval.`;
  }
  
  submitContainer.addTextDisplayComponents(
    new TextDisplayBuilder()
      .setContent(submitMessage)
  );

  await interaction.update({
    components: [submitContainer],
    flags: MessageFlags.IsComponentsV2,
  });

  // Post public message to channel with narrator ping (only for new rolls, not amendments)
  if (!isAmendment) {
    const rollEditorRoleId = getServerEnv('ROLL_EDITOR_ROLE_ID', guildId);
    const narratorMention = rollEditorRoleId ? `<@&${rollEditorRoleId}>` : 'Narrators';
    
    const title = isReaction 
      ? `Reaction Roll #${rollId}${rollState.reactionToRollId ? ` (to Roll #${rollState.reactionToRollId})` : ''}\n${rollState.description}`
      : `Roll Proposal #${rollId}\n${rollState.description}`;
    
  
  const displayData = RollView.buildRollDisplays(
      rollState,
      {
        title: title,
        descriptionText: `**From:** <@${rollState.creatorId}>`,
        footer: `${narratorMention} should use /roll-confirm ${rollId} to review and confirm.`,
        guildId: guildId,
      }
    );

    await interaction.followUp({
      components: [displayData.descriptionContainer, displayData.helpContainer, displayData.hinderContainer, displayData.footerContainer],
      flags: MessageFlags.IsComponentsV2,
    });
  } else {
    // For amendments, post an update message
    const rollEditorRoleId = getServerEnv('ROLL_EDITOR_ROLE_ID', guildId);
    const narratorMention = rollEditorRoleId ? `<@&${rollEditorRoleId}>` : 'Narrators';
    
    const title = isReaction 
      ? `Reaction Roll #${rollId}${rollState.reactionToRollId ? ` (to Roll #${rollState.reactionToRollId})` : ''} - Amended\n${rollState.description}`
      : `Roll Proposal #${rollId} - Amended\n${rollState.description}`;
    
    const statusNote = rollState.originalStatus === RollStatus.CONFIRMED 
      ? '\n\n⚠️ **Status reset to proposed** - requires narrator confirmation again.' 
      : '';
        
    const displayData = RollView.buildRollDisplays(
      rollState,
      {
        title: title,
        descriptionText: `**From:** <@${rollState.creatorId}>${statusNote}`,
        guildId: guildId,
        footer: `${narratorMention} should use /roll-confirm ${rollId} to review and confirm.`,
      }
    );

    await interaction.followUp({
      components: [displayData.descriptionContainer, displayData.helpContainer, displayData.hinderContainer, displayData.footerContainer],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

/**
 * Handle edit justification notes button
 */
export async function handleEditJustification(interaction, client) {
  const customId = interaction.customId;
  const rollKey = customId.replace('roll_edit_justification_', '');
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  
  // Only the creator can edit
  if (interaction.user.id !== rollState.creatorId) {
    await interaction.reply({
      content: 'Only the creator of this roll can edit it.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Show modal to edit justification notes
  const { ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } = await import('discord.js');
  
  const modal = new ModalBuilder()
    .setCustomId(`roll_justification_modal_${rollKey}`)
    .setTitle('Justification Notes');

  const justificationInput = new TextInputBuilder()
    .setCustomId('justification_notes')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Explain why you are applying the tags you selected...')
    .setValue(rollState.justificationNotes || '')
    .setRequired(false)
    .setMaxLength(1000);

  const justificationLabel = new LabelBuilder()
    .setLabel('Justification Notes')
    .setTextInputComponent(justificationInput);

  modal.addLabelComponents(justificationLabel);
  
  await interaction.showModal(modal);
}

/**
 * Handle justification notes modal submission
 */
export async function handleJustificationModal(interaction, client) {
  const customId = interaction.customId;
  const rollKey = customId.replace('roll_justification_modal_', '');
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  
  // Only the creator can edit
  if (interaction.user.id !== rollState.creatorId) {
    await interaction.reply({
      content: 'Only the creator of this roll can edit it.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Get justification notes from modal
  const justificationNotes = interaction.fields.getTextInputValue('justification_notes') || null;
  
  // Update buildRollDisplaysroll state with justification notes
  rollState.justificationNotes = justificationNotes;
  client.rollStates.set(rollKey, rollState);

  // Refetch tag options from character
  const guildId = getGuildId(interaction);
  const { helpOptions, hinderOptions } = refetchTagOptions(rollState, guildId);
  client.rollStates.set(rollKey, rollState); // Update rollState with fresh options

  // Rebuild the roll components with updated justification notes
  const interactiveComponents = RollView.buildRollInteractives(
    rollKey,
    helpOptions,
    hinderOptions,
    rollState.helpPage || 0,
    rollState.hinderPage || 0,
    rollState.helpTags,
    rollState.hinderTags,
    rollState.buttons,
    rollState.burnedTags || new Set(),
    rollState.justificationNotes,
    rollState.showJustificationButton,
    rollState.helpFromCharacterIdMap || new Map(),
    rollState.hinderFromCharacterIdMap || new Map(),
    rollState.mightModifier || 0
  );

  // Rebuild display with updated justification notes
  const displayData = RollView.buildRollDisplays(
    rollState,
    {
      guildId: requireGuildId(interaction),
    }
  );

  // Combine Components V2 display components with interactive components in the right order
  const allComponents = combineRollComponents(displayData, interactiveComponents);

  await interaction.update({
    components: allComponents,
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle roll confirm button (narrator confirms a proposal)
 */
export async function handleRollConfirm(interaction, client) {
  const customId = interaction.customId;
  const rollKey = customId.replace('roll_confirm_', '');
  
  // Check narrator permissions
  const guildId = getGuildId(interaction);
  const rollEditorRoleId = getServerEnv('ROLL_EDITOR_ROLE_ID', guildId);
  if (!rollEditorRoleId) {
    await interaction.reply({
      content: 'Roll confirmation is not configured.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    if (!interaction.member.roles.includes(rollEditorRoleId)) {
      await interaction.reply({
        content: 'Only narrators can confirm roll proposals.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  } catch (error) {
    await interaction.reply({
      content: 'Error checking permissions.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Get the current roll state (may have been edited)
  const rollState = client.rollStates.get(rollKey);
  
  if (!rollState) {
    await interaction.reply({
      content: 'Roll session expired. Please run /roll-confirm again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Delete invalid tags before confirming
  const deletedCount = RollStorage.deleteInvalidTags(guildId, rollState.rollId);
  
  // Update the roll with any edits made
  RollStorage.updateRoll(guildId, rollState.rollId, {
    status: RollStatus.CONFIRMED,
    helpTags: rollState.helpTags,
    hinderTags: rollState.hinderTags,
    burnedTags: rollState.burnedTags || new Set(),
    helpFromCharacterIdMap: rollState.helpFromCharacterIdMap || new Map(),
    description: rollState.description,
    narrationLink: rollState.narrationLink,
    justificationNotes: rollState.justificationNotes,
    mightModifier: rollState.mightModifier !== undefined ? rollState.mightModifier : 0,
    confirmedBy: interaction.user.id,
  });

  // Clean up temporary state
  client.rollStates.delete(rollKey);

  // Get the roll to check if it's a reaction roll
  const roll = RollStorage.getRoll(guildId, rollState.rollId);
  const isReaction = roll && roll.isReaction === true;
  const rollType = isReaction ? 'Reaction Roll' : 'Action Roll';

  // Update ephemeral message (use Components V2 to match original message)
  const confirmContainer = new ContainerBuilder();
  confirmContainer.addTextDisplayComponents(
    new TextDisplayBuilder()
      .setContent(`**${rollType} #${rollState.rollId} Confirmed by <@${interaction.user.id}>!**`)
  );

  await interaction.update({
    components: [confirmContainer],
    flags: MessageFlags.IsComponentsV2,
  });

  // Post public message to channel with creator ping
  const title = isReaction
    ? `Reaction Roll #${rollState.rollId}${roll.reactionToRollId ? ` (to Roll #${roll.reactionToRollId})` : ''} Confirmed\n${rollState.description}`
    : `Roll #${rollState.rollId} Confirmed\n${rollState.description}`;
  
  const displayData = RollView.buildRollDisplays(
    rollState,
    {
      title: title,
      descriptionText: `**Player:** <@${rollState.creatorId}>\n**Confirmed by:** <@${interaction.user.id}>`,
      footer: `<@${rollState.creatorId}> can now execute this roll with /roll ${rollState.rollId}`,
      guildId: guildId
    }
  );

  await interaction.followUp({
    components: [displayData.descriptionContainer, displayData.helpContainer, displayData.hinderContainer, displayData.footerContainer],
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle re-confirm button (proceed with confirming an already-confirmed roll)
 */
export async function handleRollReconfirm(interaction, client) {
  const customId = interaction.customId;
  const rollId = parseInt(customId.replace('roll_reconfirm_', ''));
  
  // Check narrator permissions
  const guildId = getGuildId(interaction);
  const rollEditorRoleId = getServerEnv('ROLL_EDITOR_ROLE_ID', guildId);
  if (!rollEditorRoleId) {
    await interaction.reply({
      content: 'Roll confirmation is not configured.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    if (!interaction.member.roles.includes(rollEditorRoleId)) {
      await interaction.reply({
        content: 'Only narrators can confirm roll proposals.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  } catch (error) {
    await interaction.reply({
      content: 'Error checking permissions.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Get the roll
  const roll = RollStorage.getRoll(guildId, rollId);
  if (!roll) {
    await interaction.reply({
      content: `Roll #${rollId} not found.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Get the character to rebuild options
  const character = CharacterStorage.getCharacter(guildId, roll.creatorId, roll.characterId);
  if (!character) {
    await interaction.reply({
      content: 'Character not found for this roll proposal.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Initialize roll state for editing
  if (!interaction.client.rollStates) {
    interaction.client.rollStates = new Map();
  }

  const rollKey = `confirm_${rollId}`;
  
  // If this is a reaction roll, exclude tags from the original roll
  let excludedTags = new Set();
  if (roll.isReaction && roll.reactionToRollId) {
    const originalRoll = RollStorage.getRoll(guildId, roll.reactionToRollId);
    if (originalRoll) {
      excludedTags = new Set([
        ...(originalRoll.helpTags || []),
        ...(originalRoll.hinderTags || [])
      ]);
    }
  }
  
  // Collect all available tags (exclude burned tags - they can't be used until refreshed)
  const helpOptions = RollView.collectTags(character, roll.sceneId, StoryTagStorage, false, guildId, false);
  const filteredHelpOptions = (roll.isReaction && roll.reactionToRollId)
    ? helpOptions.filter(opt => !excludedTags.has(opt.data.value))
    : helpOptions;
  
  const hinderOptions = RollView.collectTags(character, roll.sceneId, StoryTagStorage, false, guildId, true);
  const filteredHinderOptions = (roll.isReaction && roll.reactionToRollId)
    ? hinderOptions.filter(opt => !excludedTags.has(opt.data.value))
    : hinderOptions;
  
  // Store the roll state for editing
  const burnedTags = roll.burnedTags || new Set();
  const isReaction = roll.isReaction === true;
  

  const rollState = {
    rollId: rollId,
    creatorId: roll.creatorId,
    characterId: roll.characterId,
    sceneId: roll.sceneId,
    helpTags: roll.helpTags,
    hinderTags: roll.hinderTags,
    burnedTags: burnedTags,
    description: roll.description,
    narrationLink: roll.narrationLink,
    justificationNotes: roll.justificationNotes,
    showJustificationButton: false,
    helpOptions: filteredHelpOptions,
    hinderOptions: filteredHinderOptions,
    helpPage: 0,
    hinderPage: 0,
    buttons: {confirm: true, cancel: true},
    isReaction: isReaction,
    reactionToRollId: roll.reactionToRollId,
    mightModifier: roll.mightModifier !== undefined && roll.mightModifier !== null ? roll.mightModifier : 0
  };
  interaction.client.rollStates.set(rollKey, rollState);

  // Build components for editing (don't show justification button in confirm view)
  // Use helpFromCharacterIdMap from the roll if available
  const interactiveComponents = RollView.buildRollInteractives(rollKey, filteredHelpOptions, filteredHinderOptions, 0, 0, roll.helpTags, roll.hinderTags, {confirm: true, cancel: true}, burnedTags, roll.justificationNotes, false, roll.helpFromCharacterIdMap || new Map(), roll.hinderFromCharacterIdMap || new Map(), rollState.mightModifier || 0);

  const title = isReaction
    ? `Reviewing Reaction Roll #${rollId}${roll.reactionToRollId ? ` (to Roll #${roll.reactionToRollId})` : ''}`
    : `Reviewing Action Roll #${rollId}`;
  
  const displayData = RollView.buildRollDisplays(
    rollState,
    {
      title: title,
      descriptionText: `**Player:** <@${roll.creatorId}>`,
      guildId: guildId
    }
  );

  // Combine Components V2 display components with interactive components in the right order
  const allComponents = combineRollComponents(displayData, interactiveComponents);

  await interaction.update({
    components: allComponents,
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle re-confirm cancel button (dismiss the warning)
 */
export async function handleRollReconfirmCancel(interaction, client) {
  const customId = interaction.customId;
  const rollId = parseInt(customId.replace('roll_reconfirm_cancel_', ''));
  
  const cancelContainer = new ContainerBuilder();
  cancelContainer.addTextDisplayComponents(
    new TextDisplayBuilder()
      .setContent('Re-confirmation cancelled.')
  );

  await interaction.update({
    components: [cancelContainer],
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle roll execute confirm button (execute roll with invalid tags)
 * This duplicates the execution logic from RollExecuteCommand.execute()
 */
export async function handleRollExecuteConfirm(interaction, client) {
  // Defer immediately to prevent interaction timeout
  await interaction.deferUpdate();
  
  const customId = interaction.customId;
  // Format: roll_execute_confirm_{rollId}_{strategy}
  const parts = customId.replace('roll_execute_confirm_', '').split('_');
  const rollId = parseInt(parts[0]);
  const strategy = parts.slice(1).join('_'); // Rejoin in case strategy has underscores
  
  const guildId = requireGuildId(interaction);
  const userId = interaction.user.id;
  
  // Delete invalid tags first
  RollStorage.deleteInvalidTags(guildId, rollId);
  
  // Get the roll again (after deleting invalid tags)
  const roll = RollStorage.getRoll(guildId, rollId);
  if (!roll) {
    await interaction.editReply({
      content: `Roll #${rollId} not found.`,
      components: [],
    });
    return;
  }
  
  // Check if user is the creator
  if (roll.creatorId !== userId) {
    await interaction.editReply({
      content: `Only the creator of roll #${rollId} can execute it.`,
      components: [],
    });
    return;
  }
  
  if (roll.status !== RollStatus.CONFIRMED) {
    await interaction.editReply({
      content: `Roll #${rollId} is not confirmed. Current status: ${roll.status}`,
      components: [],
    });
    return;
  }
  
  // Import RollTagParentType for burned tag processing
  const { RollTagParentType } = await import('../constants/RollTagParentType.js');
  
  // Validate strategy and calculate modifiers (duplicated from RollExecuteCommand)
  const burnedTags = roll.burnedTags || new Set();
  const baseModifier = RollView.calculateModifier(roll.helpTags, roll.hinderTags, burnedTags, guildId);
  const mightModifier = roll.mightModifier !== undefined && roll.mightModifier !== null ? roll.mightModifier : 0;
  const totalPower = baseModifier + mightModifier;
  
  let strategyModifier = 0;
  let strategyName = null;
  let originalPower = totalPower;
  let strategyError = null;
  
  if (strategy === 'throw_caution') {
    if (totalPower > 2) {
      strategyError = `Cannot use "Throw caution to the wind" - your Power is ${totalPower}, but it requires Power ≤ 2.`;
    } else {
      strategyModifier = -1;
      strategyName = 'Throw caution to the wind';
    }
  } else if (strategy === 'hedge_risks') {
    if (totalPower < 2) {
      strategyError = `Cannot use "Hedge your risks" - your Power is ${totalPower}, but it requires Power ≥ 2.`;
    } else {
      strategyModifier = +1;
      strategyName = 'Hedge your risks';
    }
  }
  
  if (strategyError) {
    await interaction.editReply({
      content: `❌ ${strategyError}`,
      components: [],
    });
    return;
  }
  
  // Mark as executed
  RollStorage.updateRoll(guildId, rollId, { status: RollStatus.EXECUTED });
  
  // Track theme improvements (duplicated from RollExecuteCommand)
  const hinderTags = roll.hinderTags || new Set();
  let improvementNotification = null;
  if (hinderTags.size > 0) {
    const improvementResult = CharacterStorage.incrementThemeImprovements(guildId, hinderTags);
    if (improvementResult.readyToDevelop.length > 0) {
      const themesByUser = new Map();
      for (const t of improvementResult.readyToDevelop) {
        const character = CharacterStorage.getCharacterById(guildId, t.characterId);
        if (character && character.user_id) {
          if (!themesByUser.has(character.user_id)) {
            themesByUser.set(character.user_id, []);
          }
          themesByUser.get(character.user_id).push(t);
        }
      }
      const userNotifications = [];
      for (const [userId, themes] of themesByUser.entries()) {
        const themeList = themes.map(t => `**${t.themeName}** (${t.improvements} improvements)`).join(', ');
        userNotifications.push(`<@${userId}>: ${themeList}`);
      }
      improvementNotification = `\n\n✨ **Theme Development Available!** ✨\n${userNotifications.join('\n')}`;
    }
  }
  
  // Process burned tags (duplicated from RollExecuteCommand)
  if (burnedTags.size > 0) {
    const character = CharacterStorage.getCharacter(guildId, roll.creatorId, roll.characterId);
    if (character) {
      const backpackIdsToRemove = [];
      const storyTagIdsToRemove = [];
      const tagsToBurn = [];
      
      for (const tagEntity of burnedTags) {
        const tagData = tagEntity.getTagData(guildId);
        if (!tagData) continue;
        
        if (tagEntity.parentType === RollTagParentType.CHARACTER_BACKPACK) {
          backpackIdsToRemove.push(tagEntity.parentId);
        } else if (tagEntity.parentType === RollTagParentType.CHARACTER_STORY_TAG) {
          storyTagIdsToRemove.push(tagEntity.parentId);
        } else {
          const tagString = tagEntity.toTagString(guildId);
          if (tagString) {
            tagsToBurn.push(tagString);
          }
        }
      }
      
      const updates = {};
      if (backpackIdsToRemove.length > 0) {
        const updatedBackpack = (character.backpack || []).filter(item => {
          const itemId = typeof item === 'object' && item.id ? item.id : null;
          return itemId && !backpackIdsToRemove.includes(itemId);
        });
        updates.backpack = updatedBackpack;
      }
      if (storyTagIdsToRemove.length > 0) {
        const updatedStoryTags = (character.storyTags || []).filter(tag => {
          const tagId = typeof tag === 'object' && tag.id ? tag.id : null;
          return tagId && !storyTagIdsToRemove.includes(tagId);
        });
        updates.storyTags = updatedStoryTags;
      }
      if (tagsToBurn.length > 0) {
        CharacterStorage.markTagsAsBurned(guildId, roll.creatorId, roll.characterId, tagsToBurn);
      }
      if (Object.keys(updates).length > 0) {
        CharacterStorage.updateCharacter(guildId, roll.creatorId, roll.characterId, updates);
      }
    }
  }
  
  // Roll dice and calculate result (duplicated from RollExecuteCommand)
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const baseRoll = die1 + die2;
  const finalResult = baseRoll + totalPower + strategyModifier;
  const narratorMention = roll.confirmedBy ? `<@${roll.confirmedBy}>` : null;
  const isReactionRoll = roll.isReaction === true;
  
  let isSuccessful = false;
  if (die1 === 6 && die2 === 6) {
    isSuccessful = true;
  } else if (die1 === 1 && die2 === 1) {
    isSuccessful = false;
  } else if (isReactionRoll) {
    isSuccessful = finalResult >= 10;
  } else {
    isSuccessful = finalResult >= 7;
  }
  
  let spendingPower = null;
  if (isSuccessful) {
    if (strategy === 'throw_caution') {
      spendingPower = Math.max(originalPower, 1) + 1;
    } else if (strategy === 'hedge_risks') {
      spendingPower = Math.max(originalPower, 1) - 1;
    } else {
      spendingPower = Math.max(originalPower, 1);
    }
  }
  
  // Format and send result
  const resultData = RollView.formatRollResult(
    die1, die2, baseRoll, totalPower, finalResult,
    roll.description, narratorMention, isReactionRoll,
    roll.reactionToRollId, strategyName, strategyModifier,
    originalPower, spendingPower, mightModifier
  );
  
  if (improvementNotification && resultData.components && resultData.components.length > 0) {
    const notificationContainer = new ContainerBuilder();
    notificationContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(improvementNotification)
    );
    resultData.components.push(notificationContainer);
  }
  
  // Clear the warning message and send the result
  // Use Components V2 format since the original message was Components V2
  const executingContainer = new ContainerBuilder();
  executingContainer.addTextDisplayComponents(
    new TextDisplayBuilder()
      .setContent('Executing roll...')
  );
  
  await interaction.editReply({
    components: [executingContainer],
    flags: MessageFlags.IsComponentsV2,
  });
  
  await interaction.followUp(resultData);
}

/**
 * Handle roll execute cancel button (cancel execution)
 */
export async function handleRollExecuteCancel(interaction, client) {
  // Defer immediately to prevent interaction timeout
  await interaction.deferUpdate();
  
  const customId = interaction.customId;
  const rollId = parseInt(customId.replace('roll_execute_cancel_', ''));
  
  const cancelContainer = new ContainerBuilder();
  cancelContainer.addTextDisplayComponents(
    new TextDisplayBuilder()
      .setContent('Roll execution cancelled. Please review your tags using `/roll-amend` before executing.')
  );

  await interaction.editReply({
    components: [cancelContainer],
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle Help Action button click - show character selection in the roll view
 */
export async function handleHelpAction(interaction, client) {
  try {
    const customId = interaction.customId;
    const rollKey = customId.replace('roll_help_action_', '');
    
    if (!client.rollStates || !client.rollStates.has(rollKey)) {
      await interaction.reply({
        content: 'This roll session has expired. Please run /roll-propose again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rollState = client.rollStates.get(rollKey);
    const guildId = requireGuildId(interaction);
    // Get all characters in the guild
    const allCharacters = CharacterStorage.getAllCharacters(guildId);
  
  // Filter out only the current player's character
  // Multiple help tags from the same character are now allowed
  const otherCharacters = allCharacters.filter(char => {
    // Exclude current player's character
    return !(char.user_id === rollState.creatorId && char.id === rollState.characterId);
  });
  
  // Sort characters alphabetically by name
  otherCharacters.sort((a, b) => a.name.localeCompare(b.name));
  
  if (otherCharacters.length === 0) {
    // Refetch tag options from character
    const { helpOptions, hinderOptions } = refetchTagOptions(rollState, guildId);
    client.rollStates.set(rollKey, rollState); // Update rollState with fresh options

    // Rebuild normal roll view if no characters
    const interactiveComponents = RollView.buildRollInteractives(
      rollKey,
      helpOptions,
      hinderOptions,
      rollState.helpPage || 0,
      rollState.hinderPage || 0,
      rollState.helpTags,
      rollState.hinderTags,
      rollState.buttons,
      rollState.burnedTags || new Set(),
      rollState.justificationNotes,
      rollState.showJustificationButton,
      rollState.helpFromCharacterIdMap || new Map(),
      rollState.hinderFromCharacterIdMap || new Map()
    );
  const displayData = RollView.buildRollDisplays(
    rollState,
    {
      guildId: requireGuildId(interaction)
    }
  );
    const allComponents = combineRollComponents(displayData, interactiveComponents);
    
    // Add error message about no other characters available
    const errorMessage = new TextDisplayBuilder()
      .setContent('```ansi\n\x1b[31mNo other characters available to provide tags.\x1b[0m\n```');
    const errorContainer = new ContainerBuilder()
      .addTextDisplayComponents(errorMessage);
    
    allComponents.unshift(errorContainer);
    
    await interaction.update({
      components: allComponents,
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  // Initialize character page if not set
  if (rollState.helpCharacterPage === undefined) {
    rollState.helpCharacterPage = 0;
  }
  
  // Calculate pagination
  const characterPages = Math.ceil(otherCharacters.length / 25);
  const characterPage = Math.min(rollState.helpCharacterPage || 0, Math.max(0, characterPages - 1));
  const characterStart = characterPage * 25;
  const characterEnd = characterStart + 25;

  // Build character select menu with pagination
  const characterOptions = otherCharacters.slice(characterStart, characterEnd).map(char => {
    return new StringSelectMenuOptionBuilder()
      .setLabel(char.name)
      .setValue(`${char.id}`)
  });

  const characterSelect = new StringSelectMenuBuilder()
    .setCustomId(`roll_help_character_${rollKey}`)
    .setPlaceholder('Select a character to help...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(characterOptions);

  const components = [new ActionRowBuilder().setComponents([characterSelect])];

  // Add page selector if there are multiple pages
  if (characterPages > 1) {
    const pageOptions = [];
    for (let i = 0; i < characterPages; i++) {
      const range = getNameRangeForPage(otherCharacters, i, 25, (char) => char.name);
      const label = range ? `${range} (Page ${i + 1})` : `Page ${i + 1} of ${characterPages}`;
      pageOptions.push(new StringSelectMenuOptionBuilder()
        .setLabel(label)
        .setValue(`${i}`)
        .setDefault(i === characterPage));
    }
    const currentRange = getNameRangeForPage(otherCharacters, characterPage, 25, (char) => char.name);
    const placeholder = currentRange ? `${currentRange} (Page ${characterPage + 1} of ${characterPages})` : `Page ${characterPage + 1} of ${characterPages}`;
    const pageSelect = new StringSelectMenuBuilder()
      .setCustomId(`roll_help_character_page_${rollKey}`)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(pageOptions);
    components.push(new ActionRowBuilder().setComponents([pageSelect]));
  }

  // Add cancel button
  const cancelButton = new ButtonBuilder()
    .setCustomId(`roll_help_action_cancel_${rollKey}`)
    .setLabel('Back to Roll Proposal')
    .setStyle(ButtonStyle.Primary);

  components.push(new ActionRowBuilder().setComponents([cancelButton]));

  await interaction.update({
    components: components,
    flags: MessageFlags.IsComponentsV2,
  });
  } catch (error) {
    console.error('Error in handleHelpAction:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.followUp({
        content: 'An error occurred while processing your request.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

/**
 * Handle character selection for Help Action - show tag selection in the roll view
 */
export async function handleHelpCharacterSelect(interaction, client) {
  const customId = interaction.customId;
  const rollKey = customId.replace('roll_help_character_', '');
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  const guildId = requireGuildId(interaction);
  const characterId = parseInt(interaction.values[0]);
  
  // Get the selected character
  const allCharacters = CharacterStorage.getAllCharacters(guildId);
  const selectedCharacter = allCharacters.find(char => char.id === characterId);
  
  if (!selectedCharacter) {
    await interaction.update({
      content: 'Character not found.',
      components: [],
    });
    return;
  }

  // Collect help tags from the selected character
  let helpOptions = RollView.collectTags(selectedCharacter, rollState.sceneId, StoryTagStorage, false, guildId, true);
  
  if (helpOptions.length === 0) {
    await interaction.update({
      content: `No help tags available for ${selectedCharacter.name}.`,
      components: [],
    });
    return;
  }

  // Sort tags alphabetically by label
  helpOptions.sort((a, b) => a.data.label.localeCompare(b.data.label));

  // Initialize tag page map if not exists
  if (!rollState.helpTagPageMap) {
    rollState.helpTagPageMap = new Map();
  }
  
  // Get or initialize page for this character
  const tagPageKey = `${characterId}`;
  if (!rollState.helpTagPageMap.has(tagPageKey)) {
    rollState.helpTagPageMap.set(tagPageKey, 0);
  }
  
  // Calculate pagination
  const tagPages = Math.ceil(helpOptions.length / 25);
  const tagPage = Math.min(rollState.helpTagPageMap.get(tagPageKey) || 0, Math.max(0, tagPages - 1));
  const tagStart = tagPage * 25;
  const tagEnd = tagStart + 25;

  // Build tag select menu - mark already selected tags as default
  const helpTags = rollState.helpTags || new Set();
  const helpFromCharacterIdMap = rollState.helpFromCharacterIdMap || new Map();
  
  const tagOptions = helpOptions.slice(tagStart, tagEnd).map(opt => {
    const isAlreadySelected = helpTags.has(opt.data.value) && 
                             helpFromCharacterIdMap.get(opt.data.value) === characterId;
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(opt.data.label)
      .setValue(opt.data.value)
      .setDescription(opt.data.description)
      .setDefault(isAlreadySelected);
    return option;
  });

  const tagSelect = new StringSelectMenuBuilder()
    .setCustomId(`roll_help_tag_${rollKey}_${characterId}`)
    .setPlaceholder(`Select tags from ${selectedCharacter.name}...`)
    .setMinValues(1)
    .setMaxValues(Math.min(tagOptions.length, 25)) // Allow multiple selections, up to 25 (Discord limit)
    .addOptions(tagOptions);

  const components = [new ActionRowBuilder().setComponents([tagSelect])];

  // Add page selector if there are multiple pages
  if (tagPages > 1) {
    const pageOptions = [];
    for (let i = 0; i < tagPages; i++) {
      const range = getNameRangeForPage(helpOptions, i, 25, (opt) => opt.data.label);
      const label = range ? `${range} (Page ${i + 1})` : `Page ${i + 1} of ${tagPages}`;
      pageOptions.push(new StringSelectMenuOptionBuilder()
        .setLabel(label)
        .setValue(`${i}`)
        .setDefault(i === tagPage));
    }
    const currentRange = getNameRangeForPage(helpOptions, tagPage, 25, (opt) => opt.data.label);
    const placeholder = currentRange ? `${currentRange} (Page ${tagPage + 1} of ${tagPages})` : `Page ${tagPage + 1} of ${tagPages}`;
    const pageSelect = new StringSelectMenuBuilder()
      .setCustomId(`roll_help_tag_page_${rollKey}_${characterId}`)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(pageOptions);
    components.push(new ActionRowBuilder().setComponents([pageSelect]));
  }

  // Add cancel button
  const cancelButton = new ButtonBuilder()
    .setCustomId(`roll_help_action_cancel_${rollKey}`)
    .setLabel('Back to Roll Proposal')
    .setStyle(ButtonStyle.Primary);

  components.push(new ActionRowBuilder().setComponents([cancelButton]));

  await interaction.update({
    components: components,
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle tag selection for Help Action - add tag to roll
 */
export async function handleHelpTagSelect(interaction, client) {
  const customId = interaction.customId;
  // Format: roll_help_tag_{rollKey}_{characterId}
  const parts = customId.replace('roll_help_tag_', '').split('_');
  const characterId = parseInt(parts[parts.length - 1]);
  const rollKey = parts.slice(0, -1).join('_');
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  const selectedTags = new Set(interaction.values); // Now an array of selected tags
  const guildId = requireGuildId(interaction);
  
  // Get the selected character
  const allCharacters = CharacterStorage.getAllCharacters(guildId);
  const selectedCharacter = allCharacters.find(char => char.id === characterId);
  
  if (!selectedCharacter) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  
  // Initialize helpFromCharacterIdMap if it doesn't exist
  if (!rollState.helpFromCharacterIdMap) {
    rollState.helpFromCharacterIdMap = new Map();
  }
  
  // Get tags that were previously selected from this character
  const previouslySelectedTags = new Set();
  rollState.helpFromCharacterIdMap.forEach((charId, tag) => {
    if (charId === characterId) {
      previouslySelectedTags.add(tag);
    }
  });
  
  // Parse selected tags to TagEntity objects
  const selectedTagEntities = new Set();
  for (const tagValue of selectedTags) {
    const entity = RollView.decodeEntityValue(tagValue);
    if (entity) {
      selectedTagEntities.add(entity);
    }
  }
  // Remove tags that were unselected (were in previouslySelectedTags but not in selectedTags)
  const previouslySelectedKeys = new Set();
  for (const tagValue of previouslySelectedTags) {
    const entity = RollView.decodeEntityValue(tagValue);
    if (entity) {
      previouslySelectedKeys.add(entity.getKey());
    }
  }
  
  for (const tagEntity of rollState.helpTags) {
    const key = tagEntity.getKey();
    if (previouslySelectedKeys.has(key) && !selectedTagEntities.has(tagEntity)) {
      rollState.helpTags.delete(tagEntity);
      rollState.helpFromCharacterIdMap.delete(tagEntity);
    }
  }
  
  // Add all newly selected tags to help tags and store which character they came from
  for (const tagEntity of selectedTagEntities) {
    // Check if entity already exists before adding
    const existingEntity = findEntityInSet(rollState.helpTags, tagEntity);
    if (!existingEntity) {
      rollState.helpTags.add(tagEntity);
      rollState.helpFromCharacterIdMap.set(tagEntity, selectedCharacter.id);
    } else {
      // Update the character map for existing entity
      rollState.helpFromCharacterIdMap.set(existingEntity, selectedCharacter.id);
    }
  }
  
  client.rollStates.set(rollKey, rollState);

  // Refetch tag options from character
  const { helpOptions, hinderOptions } = refetchTagOptions(rollState, guildId);
  client.rollStates.set(rollKey, rollState); // Update rollState with fresh options

  // Rebuild the roll components
  const interactiveComponents = RollView.buildRollInteractives(
    rollKey,
    helpOptions,
    hinderOptions,
    rollState.helpPage || 0,
    rollState.hinderPage || 0,
    rollState.helpTags,
    rollState.hinderTags,
    rollState.buttons,
    rollState.burnedTags || new Set(),
    rollState.justificationNotes,
    rollState.showJustificationButton,
    rollState.helpFromCharacterIdMap || new Map()
  );

  const displayData = RollView.buildRollDisplays(
    rollState,
    {
      guildId: guildId
    }
  );

  const allComponents = combineRollComponents(displayData, interactiveComponents);

  // Update the roll view directly - no ephemeral message needed
  await interaction.update({
    components: allComponents,
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle character page selection for Help Action
 */
export async function handleHelpCharacterPageSelect(interaction, client) {
  const customId = interaction.customId;
  const rollKey = customId.replace('roll_help_character_page_', '');
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  const selectedPage = parseInt(interaction.values[0]);
  rollState.helpCharacterPage = selectedPage;
  client.rollStates.set(rollKey, rollState);

  const guildId = requireGuildId(interaction);
  const allCharacters = CharacterStorage.getAllCharacters(guildId);
  
  // Filter out only the current player's character
  const otherCharacters = allCharacters.filter(char => {
    return !(char.user_id === rollState.creatorId && char.id === rollState.characterId);
  });
  
  // Sort characters alphabetically by name
  otherCharacters.sort((a, b) => a.name.localeCompare(b.name));
  
  // Calculate pagination
  const characterPages = Math.ceil(otherCharacters.length / 25);
  const characterPage = Math.min(selectedPage, Math.max(0, characterPages - 1));
  const characterStart = characterPage * 25;
  const characterEnd = characterStart + 25;

  // Build character select menu with pagination
  const characterOptions = otherCharacters.slice(characterStart, characterEnd).map(char => {
    return new StringSelectMenuOptionBuilder()
      .setLabel(char.name)
      .setValue(`${char.id}`)
  });

  const characterSelect = new StringSelectMenuBuilder()
    .setCustomId(`roll_help_character_${rollKey}`)
    .setPlaceholder('Select a character to help...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(characterOptions);

  const components = [new ActionRowBuilder().setComponents([characterSelect])];

  // Add page selector if there are multiple pages
  if (characterPages > 1) {
    const pageOptions = [];
    for (let i = 0; i < characterPages; i++) {
      const range = getNameRangeForPage(otherCharacters, i, 25, (char) => char.name);
      const label = range ? `${range} (Page ${i + 1})` : `Page ${i + 1} of ${characterPages}`;
      pageOptions.push(new StringSelectMenuOptionBuilder()
        .setLabel(label)
        .setValue(`${i}`)
        .setDefault(i === characterPage));
    }
    const currentRange = getNameRangeForPage(otherCharacters, characterPage, 25, (char) => char.name);
    const placeholder = currentRange ? `${currentRange} (Page ${characterPage + 1} of ${characterPages})` : `Page ${characterPage + 1} of ${characterPages}`;
    const pageSelect = new StringSelectMenuBuilder()
      .setCustomId(`roll_help_character_page_${rollKey}`)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(pageOptions);
    components.push(new ActionRowBuilder().setComponents([pageSelect]));
  }

  // Add cancel button
  const cancelButton = new ButtonBuilder()
    .setCustomId(`roll_help_action_cancel_${rollKey}`)
    .setLabel('Back to Roll Proposal')
    .setStyle(ButtonStyle.Primary);

  components.push(new ActionRowBuilder().setComponents([cancelButton]));

  await interaction.update({
    components: components,
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle tag page selection for Help Action
 */
export async function handleHelpTagPageSelect(interaction, client) {
  const customId = interaction.customId;
  // Format: roll_help_tag_page_{rollKey}_{characterId}
  const parts = customId.replace('roll_help_tag_page_', '').split('_');
  const characterId = parseInt(parts[parts.length - 1]);
  const rollKey = parts.slice(0, -1).join('_');
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  const selectedPage = parseInt(interaction.values[0]);
  const guildId = requireGuildId(interaction);
  
  // Initialize tag page map if not exists
  if (!rollState.helpTagPageMap) {
    rollState.helpTagPageMap = new Map();
  }
  
  // Set page for this character
  const tagPageKey = `${characterId}`;
  rollState.helpTagPageMap.set(tagPageKey, selectedPage);
  client.rollStates.set(rollKey, rollState);
  
  // Get the selected character
  const allCharacters = CharacterStorage.getAllCharacters(guildId);
  const selectedCharacter = allCharacters.find(char => char.id === characterId);
  
  if (!selectedCharacter) {
    await interaction.update({
      content: 'Character not found.',
      components: [],
    });
    return;
  }

  // Collect help tags from the selected character
  let helpOptions = RollView.collectTags(selectedCharacter, rollState.sceneId, StoryTagStorage, false, guildId, true);
  
  if (helpOptions.length === 0) {
    await interaction.update({
      content: `No help tags available for ${selectedCharacter.name}.`,
      components: [],
    });
    return;
  }

  // Sort tags alphabetically by label
  helpOptions.sort((a, b) => a.data.label.localeCompare(b.data.label));
  
  // Calculate pagination
  const tagPages = Math.ceil(helpOptions.length / 25);
  const tagPage = Math.min(selectedPage, Math.max(0, tagPages - 1));
  const tagStart = tagPage * 25;
  const tagEnd = tagStart + 25;

  // Build tag select menu - mark already selected tags as default
  const helpTags = rollState.helpTags || new Set();
  const helpFromCharacterIdMap = rollState.helpFromCharacterIdMap || new Map();
  
  const tagOptions = helpOptions.slice(tagStart, tagEnd).map(opt => {
    const isAlreadySelected = helpTags.has(opt.data.value) && 
                             helpFromCharacterIdMap.get(opt.data.value) === characterId;
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(opt.data.label)
      .setValue(opt.data.value)
      .setDescription(opt.data.description)
      .setDefault(isAlreadySelected);
    return option;
  });

  const tagSelect = new StringSelectMenuBuilder()
    .setCustomId(`roll_help_tag_${rollKey}_${characterId}`)
    .setPlaceholder(`Select tags from ${selectedCharacter.name}...`)
    .setMinValues(1)
    .setMaxValues(Math.min(tagOptions.length, 25)) // Allow multiple selections, up to 25 (Discord limit)
    .addOptions(tagOptions);

  const components = [new ActionRowBuilder().setComponents([tagSelect])];

  // Add page selector if there are multiple pages
  if (tagPages > 1) {
    const pageOptions = [];
    for (let i = 0; i < tagPages; i++) {
      const range = getNameRangeForPage(helpOptions, i, 25, (opt) => opt.data.label);
      const label = range ? `${range} (Page ${i + 1})` : `Page ${i + 1} of ${tagPages}`;
      pageOptions.push(new StringSelectMenuOptionBuilder()
        .setLabel(label)
        .setValue(`${i}`)
        .setDefault(i === tagPage));
    }
    const currentRange = getNameRangeForPage(helpOptions, tagPage, 25, (opt) => opt.data.label);
    const placeholder = currentRange ? `${currentRange} (Page ${tagPage + 1} of ${tagPages})` : `Page ${tagPage + 1} of ${tagPages}`;
    const pageSelect = new StringSelectMenuBuilder()
      .setCustomId(`roll_help_tag_page_${rollKey}_${characterId}`)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(pageOptions);
    components.push(new ActionRowBuilder().setComponents([pageSelect]));
  }

  // Add cancel button
  const cancelButton = new ButtonBuilder()
    .setCustomId(`roll_help_action_cancel_${rollKey}`)
    .setLabel('Back to Roll Proposal')
    .setStyle(ButtonStyle.Primary);

  components.push(new ActionRowBuilder().setComponents([cancelButton]));

  await interaction.update({
    components: components,
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle cancel button for help action flow - return to normal roll view
 */
export async function handleHelpActionCancel(interaction, client) {
  const customId = interaction.customId;
  // Handle both help action cancel and remove help action cancel, and hinder action cancels
  let rollKey;
  if (customId.startsWith('roll_help_action_cancel_')) {
    rollKey = customId.replace('roll_help_action_cancel_', '');
  } else if (customId.startsWith('roll_remove_help_action_cancel_')) {
    rollKey = customId.replace('roll_remove_help_action_cancel_', '');
  } else if (customId.startsWith('roll_hinder_action_cancel_')) {
    rollKey = customId.replace('roll_hinder_action_cancel_', '');
  } else if (customId.startsWith('roll_remove_hinder_action_cancel_')) {
    rollKey = customId.replace('roll_remove_hinder_action_cancel_', '');
  } else {
    await interaction.reply({
      content: 'Invalid cancel action.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);

  // Rebuild normal roll view
  const interactiveComponents = RollView.buildRollInteractives(
    rollKey,
    rollState.helpOptions,
    rollState.hinderOptions,
    rollState.helpPage || 0,
    rollState.hinderPage || 0,
    rollState.helpTags,
    rollState.hinderTags,
    rollState.buttons,
    rollState.burnedTags || new Set(),
    rollState.justificationNotes,
    rollState.showJustificationButton,
    rollState.helpFromCharacterIdMap || new Map(),
    rollState.hinderFromCharacterIdMap || new Map()
  );
  const displayData = RollView.buildRollDisplays(
    rollState,
    {
      guildId: requireGuildId(interaction),
    }
  );
  const allComponents = combineRollComponents(displayData, interactiveComponents);

  await interaction.update({
    components: allComponents,
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle Hinder Action button click - show character selection in the roll view
 */
export async function handleHinderAction(interaction, client) {
  try {
    const customId = interaction.customId;
    const rollKey = customId.replace('roll_hinder_action_', '');
    
    if (!client.rollStates || !client.rollStates.has(rollKey)) {
      await interaction.reply({
        content: 'This roll session has expired. Please run /roll-propose again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rollState = client.rollStates.get(rollKey);
    const guildId = requireGuildId(interaction);
    // Get all characters in the guild
    const allCharacters = CharacterStorage.getAllCharacters(guildId);
  
    // Filter out only the current player's character
    // Multiple hinder tags from the same character are now allowed
    const otherCharacters = allCharacters.filter(char => {
      // Exclude current player's character
      return !(char.user_id === rollState.creatorId && char.id === rollState.characterId);
    });
    if (otherCharacters.length === 0) {
      // Refetch tag options from character
      const { helpOptions, hinderOptions } = refetchTagOptions(rollState, guildId);
      client.rollStates.set(rollKey, rollState); // Update rollState with fresh options

      // Rebuild normal roll view if no characters
      const interactiveComponents = RollView.buildRollInteractives(
        rollKey,
        helpOptions,
        hinderOptions,
        rollState.helpPage || 0,
        rollState.hinderPage || 0,
        rollState.helpTags,
        rollState.hinderTags,
        rollState.buttons,
        rollState.burnedTags || new Set(),
        rollState.justificationNotes,
        rollState.showJustificationButton,
        rollState.helpFromCharacterIdMap || new Map(),
        rollState.hinderFromCharacterIdMap || new Map()
      );
      const displayData = RollView.buildRollDisplays(
        rollState,
        {
          guildId: guildId
        }
      );
      const allComponents = combineRollComponents(displayData, interactiveComponents);
      
      // Add error message about no other characters available
      const errorMessage = new TextDisplayBuilder()
        .setContent('```ansi\n\x1b[31mNo other characters available to provide tags.\x1b[0m\n```');
      const errorContainer = new ContainerBuilder()
        .addTextDisplayComponents(errorMessage);
      
      allComponents.unshift(errorContainer);
      
      await interaction.update({
        components: allComponents,
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    // Build character select menu
    const characterOptions = otherCharacters.map(char => {
      return new StringSelectMenuOptionBuilder()
        .setLabel(char.name)
        .setValue(`${char.id}`)
    });

    const characterSelect = new StringSelectMenuBuilder()
      .setCustomId(`roll_hinder_character_${rollKey}`)
      .setPlaceholder('Select a character to hinder from...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(characterOptions.slice(0, 25)); // Discord limit is 25 options

    // Add cancel button
    const cancelButton = new ButtonBuilder()
      .setCustomId(`roll_hinder_action_cancel_${rollKey}`)
      .setLabel('Back to Roll Proposal')
      .setStyle(ButtonStyle.Primary);

    await interaction.update({
      components: [
        new ActionRowBuilder().setComponents([characterSelect]),
        new ActionRowBuilder().setComponents([cancelButton])
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (error) {
    console.error('Error in handleHinderAction:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        flags: MessageFlags.Ephemeral,
      });
    } else {
  await interaction.followUp({
        content: 'An error occurred while processing your request.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

/**
 * Handle character selection for Hinder Action - show tag selection in the roll view
 */
export async function handleHinderCharacterSelect(interaction, client) {
  const customId = interaction.customId;
  const rollKey = customId.replace('roll_hinder_character_', '');
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  const guildId = requireGuildId(interaction);
  const characterId = parseInt(interaction.values[0]);
  
  // Get the selected character
  const allCharacters = CharacterStorage.getAllCharacters(guildId);
  const selectedCharacter = allCharacters.find(char => char.id === characterId);
  
  if (!selectedCharacter) {
    await interaction.update({
      content: 'Character not found.',
      components: [],
    });
    return;
  }

  // Collect hinder tags from the selected character (includes weaknesses)
  const hinderOptions = RollView.collectTags(selectedCharacter, rollState.sceneId, StoryTagStorage, false, guildId, true);
  
  if (hinderOptions.length === 0) {
    await interaction.update({
      content: `No hinder tags available for ${selectedCharacter.name}.`,
      components: [],
    });
    return;
  }

  // Build tag select menu - mark already selected tags as default
  const hinderTags = rollState.hinderTags || new Set();
  const hinderFromCharacterIdMap = rollState.hinderFromCharacterIdMap || new Map();
  
  const tagOptions = hinderOptions.slice(0, 25).map(opt => {
    const isAlreadySelected = hinderTags.has(opt.data.value) && 
                             hinderFromCharacterIdMap.get(opt.data.value) === characterId;
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(opt.data.label)
      .setValue(opt.data.value)
      .setDescription(opt.data.description)
      .setDefault(isAlreadySelected);
    return option;
  });

  const tagSelect = new StringSelectMenuBuilder()
    .setCustomId(`roll_hinder_tag_${rollKey}_${characterId}`)
    .setPlaceholder(`Select tags from ${selectedCharacter.name}...`)
    .setMinValues(1)
    .setMaxValues(Math.min(tagOptions.length, 25)) // Allow multiple selections, up to 25 (Discord limit)
    .addOptions(tagOptions);

  // Add cancel button
  const cancelButton = new ButtonBuilder()
    .setCustomId(`roll_hinder_action_cancel_${rollKey}`)
    .setLabel('Back to Roll Proposal')
    .setStyle(ButtonStyle.Primary);

  await interaction.update({
    components: [
      new ActionRowBuilder().setComponents([tagSelect]),
      new ActionRowBuilder().setComponents([cancelButton])
    ],
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle tag selection for Hinder Action - add tag to roll
 */
export async function handleHinderTagSelect(interaction, client) {
  const customId = interaction.customId;
  // Format: roll_hinder_tag_{rollKey}_{characterId}
  const parts = customId.replace('roll_hinder_tag_', '').split('_');
  const characterId = parseInt(parts[parts.length - 1]);
  const rollKey = parts.slice(0, -1).join('_');
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  const selectedTags = new Set(interaction.values); // Now an array of selected tags
  const guildId = requireGuildId(interaction);
  
  // Get the selected character
  const allCharacters = CharacterStorage.getAllCharacters(guildId);
  const selectedCharacter = allCharacters.find(char => char.id === characterId);
  
  if (!selectedCharacter) {
    await interaction.reply({
      content: 'Character not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  
  // Initialize hinderFromCharacterIdMap if it doesn't exist
  if (!rollState.hinderFromCharacterIdMap) {
    rollState.hinderFromCharacterIdMap = new Map();
  }
  
  // Get tags that were previously selected from this character
  const previouslySelectedTags = new Set();
  rollState.hinderFromCharacterIdMap.forEach((charId, tag) => {
    if (charId === characterId) {
      previouslySelectedTags.add(tag);
    }
  });
  
  // Parse selected tags to TagEntity objects
  const selectedTagEntities = new Set();
  for (const tagValue of selectedTags) {
    const entity = RollView.decodeEntityValue(tagValue);
    if (entity) {
      selectedTagEntities.add(entity);
    }
  }
  
  // Remove tags that were unselected (were in previouslySelectedTags but not in selectedTags)
  const previouslySelectedKeys = new Set();
  for (const tagValue of previouslySelectedTags) {
    const entity = RollView.decodeEntityValue(tagValue);
    if (entity) {
      previouslySelectedKeys.add(entity.getKey());
    }
  }
  
  for (const tagEntity of rollState.hinderTags) {
    const key = tagEntity.getKey();
    if (previouslySelectedKeys.has(key) && !selectedTagEntities.has(tagEntity)) {
      rollState.hinderTags.delete(tagEntity);
      rollState.hinderFromCharacterIdMap.delete(tagEntity);
    }
  }
  
  // Add all newly selected tags to hinder tags and store which character they came from
  for (const tagEntity of selectedTagEntities) {
    // Check if entity already exists before adding
    const existingEntity = findEntityInSet(rollState.hinderTags, tagEntity);
    if (!existingEntity) {
      rollState.hinderTags.add(tagEntity);
      rollState.hinderFromCharacterIdMap.set(tagEntity, selectedCharacter.id);
    } else {
      // Update the character map for existing entity
      rollState.hinderFromCharacterIdMap.set(existingEntity, selectedCharacter.id);
    }
  }
  
  client.rollStates.set(rollKey, rollState);

  // Refetch tag options from character
  const { helpOptions, hinderOptions } = refetchTagOptions(rollState, guildId);
  client.rollStates.set(rollKey, rollState); // Update rollState with fresh options

  // Rebuild the roll components
  const interactiveComponents = RollView.buildRollInteractives(
    rollKey,
    helpOptions,
    hinderOptions,
    rollState.helpPage || 0,
    rollState.hinderPage || 0,
    rollState.helpTags,
    rollState.hinderTags,
    rollState.buttons,
    rollState.burnedTags || new Set(),
    rollState.justificationNotes,
    rollState.showJustificationButton,
    rollState.helpFromCharacterIdMap || new Map(),
    rollState.hinderFromCharacterIdMap || new Map(),
    rollState.mightModifier || 0
  );

  const displayData = RollView.buildRollDisplays(
    rollState,
    {
      guildId: guildId
    }
  );

  const allComponents = combineRollComponents(displayData, interactiveComponents);

  // Update the roll view directly - no ephemeral message needed
  await interaction.update({
    components: allComponents,
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle might button click - show dropdown for might modifier selection
 */
export async function handleMightButtonClick(interaction, client) {
  const customId = interaction.customId;
  const rollKey = customId.replace('roll_might_button_', '');
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  const guildId = requireGuildId(interaction);
  
  // Check if user can edit this roll (for confirm views, check narrator permissions)
  const rollEditorRole = getServerEnv('ROLL_EDITOR_ROLE', guildId, 'editor role');
  let hasPermission = false;
  if (rollKey.startsWith('confirm_')) {
    // For confirm views, only narrators can edit
    const rollEditorRoleId = getServerEnv('ROLL_EDITOR_ROLE_ID', guildId);
    if (rollEditorRoleId) {
      try {
        hasPermission = interaction.member.roles.includes(rollEditorRoleId);
      } catch (error) {
        hasPermission = false;
      }
    }
  } else {
    if (rollState.rolled) {
      await interaction.reply({
        content: 'This roll has already been completed. Might modifier can no longer be edited.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    hasPermission = await canEditRoll(interaction, rollState);
  }
  
  if (!hasPermission) {
    await interaction.reply({
      content: `You don't have permission to edit this roll. Only the creator or users with the "${rollEditorRole}" role can edit.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const currentMightModifier = rollState.mightModifier || 0;
  
  // Build might modifier dropdown options with breakpoint names in labels
  const mightModifierOptions = [];
  for (let i = -12; i <= 12; i++) {
    let label = `${i >= 0 ? '+' : ''}${i}`;
    
    // Add breakpoint names directly to labels
    if (i === 0) {
      label = '0 (No modifier)';
    } else if (i === 3) {
      label = '+3 (Favored)';
    } else if (i === 6) {
      label = '+6 (Extremely Favored)';
    } else if (i === -3) {
      label = '-3 (Imperiled)';
    } else if (i === -6) {
      label = '-6 (Extremely Imperiled)';
    }
    
    mightModifierOptions.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(label)
        .setValue(`${i}`)
        .setDefault(i === currentMightModifier)
    );
  }
  
  const mightModifierSelect = new StringSelectMenuBuilder()
    .setCustomId(`roll_might_modifier_${rollKey}`)
    .setPlaceholder('Select Might modifier...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(mightModifierOptions);
  
  // Refetch tag options from character
  const { helpOptions, hinderOptions } = refetchTagOptions(rollState, guildId);
  client.rollStates.set(rollKey, rollState); // Update rollState with fresh options

  // Rebuild the roll view but replace the button with the dropdown
  const interactiveComponents = RollView.buildRollInteractives(
    rollKey,
    helpOptions,
    hinderOptions,
    rollState.helpPage || 0,
    rollState.hinderPage || 0,
    rollState.helpTags,
    rollState.hinderTags,
    rollState.buttons,
    rollState.burnedTags || new Set(),
    rollState.justificationNotes,
    rollState.showJustificationButton,
    rollState.helpFromCharacterIdMap || new Map(),
    rollState.hinderFromCharacterIdMap || new Map(),
    rollState.mightModifier || 0
  );

  // Replace the first description row (which has the button) with the dropdown
  interactiveComponents.descriptionRows[0] = new ActionRowBuilder().setComponents([mightModifierSelect]);

  // Update the message with new might modifier
  let title;
  if (rollKey.startsWith('confirm_')) {
    const rollId = rollKey.replace('confirm_', '');
    title = `Reviewing Roll Proposal #${rollId}`;
  } else {
    title = 'Roll Proposal';
  }

  const displayData = RollView.buildRollDisplays(
    rollState,
    {
      title: title,
      descriptionText: `**Player:** <@${rollState.creatorId}>`,
      guildId: guildId,
    }
  );

  // Combine Components V2 display components with interactive components in the right order
  const allComponents = combineRollComponents(displayData, interactiveComponents);

  await interaction.update({
    components: allComponents,
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle might modifier selection
 */
export async function handleMightModifierSelect(interaction, client) {
  const customId = interaction.customId;
  const rollKey = customId.replace('roll_might_modifier_', '');
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rollState = client.rollStates.get(rollKey);
  const guildId = requireGuildId(interaction);
  
  // Check if user can edit this roll (for confirm views, check narrator permissions)
  const rollEditorRole = getServerEnv('ROLL_EDITOR_ROLE', guildId, 'editor role');
  let hasPermission = false;
  if (rollKey.startsWith('confirm_')) {
    // For confirm views, only narrators can edit
    const rollEditorRoleId = getServerEnv('ROLL_EDITOR_ROLE_ID', guildId);
    if (rollEditorRoleId) {
      try {
        hasPermission = interaction.member.roles.includes(rollEditorRoleId);
      } catch (error) {
        hasPermission = false;
      }
    }
  } else {
    if (rollState.rolled) {
      await interaction.reply({
        content: 'This roll has already been completed. Might modifier can no longer be edited.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    hasPermission = await canEditRoll(interaction, rollState);
  }
  
  if (!hasPermission) {
    await interaction.reply({
      content: `You don't have permission to edit this roll. Only the creator or users with the "${rollEditorRole}" role can edit.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Parse selected might modifier value
  const mightModifierValue = parseInt(interaction.values[0], 10);
  
  // Validate range (-12 to +12)
  if (isNaN(mightModifierValue) || mightModifierValue < -12 || mightModifierValue > 12) {
    await interaction.reply({
      content: 'Invalid might modifier value. Must be between -12 and +12.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Update might modifier in roll state
  rollState.mightModifier = mightModifierValue;
  client.rollStates.set(rollKey, rollState);

  // Refetch tag options from character
  const { helpOptions, hinderOptions } = refetchTagOptions(rollState, guildId);
  client.rollStates.set(rollKey, rollState); // Update rollState with fresh options

  // Rebuild components with updated might modifier
  const interactiveComponents = RollView.buildRollInteractives(
    rollKey,
    helpOptions,
    hinderOptions,
    rollState.helpPage || 0,
    rollState.hinderPage || 0,
    rollState.helpTags,
    rollState.hinderTags,
    rollState.buttons,
    rollState.burnedTags || new Set(),
    rollState.justificationNotes,
    rollState.showJustificationButton,
    rollState.helpFromCharacterIdMap || new Map(),
    rollState.hinderFromCharacterIdMap || new Map(),
    rollState.mightModifier || 0
  );

  // Update the message with new might modifier
  let title;
  if (rollKey.startsWith('confirm_')) {
    const rollId = rollKey.replace('confirm_', '');
    title = `Reviewing Roll Proposal #${rollId}`;
  } else {
    title = 'Roll Proposal';
  }

  const displayData = RollView.buildRollDisplays(
    rollState,
    {
      title: title,
      descriptionText: `**Player:** <@${rollState.creatorId}>`,
      guildId: guildId,
    }
  );

  // Combine Components V2 display components with interactive components in the right order
  const allComponents = combineRollComponents(displayData, interactiveComponents);

  await interaction.update({
    components: allComponents,
    flags: MessageFlags.IsComponentsV2,
  });
}