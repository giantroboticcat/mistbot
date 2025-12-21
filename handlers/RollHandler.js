import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { RollView } from '../utils/RollView.js';
import { RollStorage } from '../utils/RollStorage.js';
import RollStatus from '../constants/RollStatus.js';
import { getServerEnv } from '../utils/ServerConfig.js';
import { getGuildId, requireGuildId } from '../utils/GuildUtils.js';

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

    // Rebuild components with updated page    
    let interactiveComponents = RollView.buildRollInteractives(rollKey, rollState.helpOptions, rollState.hinderOptions, rollState.helpPage, 
      rollState.hinderPage, rollState.helpTags, rollState.hinderTags, rollState.buttons, rollState.burnedTags, rollState.justificationNotes, rollState.showJustificationButton);
    
    let title;
    if (rollKey.startsWith('confirm_')) {
      const rollId = rollKey.replace('confirm_', '');
      title = `Reviewing Roll Proposal #${rollId}`;
    } else {
      title = 'Roll Proposal';
    }



    let displayData = RollView.buildRollDisplays(
      rollState.helpTags,
      rollState.hinderTags,
      rollState.description,
      true,
      rollState.burnedTags || new Set(),
      {
        //todo need to make sure the description text gets added that is passed in from the command
        title: title,
        descriptionText: `**Player:** <@${rollState.creatorId}>`,
        narrationLink: rollState.narrationLink,
        justificationNotes: rollState.justificationNotes,
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
          // Also remove from burnedTags if it was burned
          if (rollState.burnedTags.has(value)) {
            rollState.burnedTags.delete(value);
          }
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

    let interactiveComponents = RollView.buildRollInteractives(rollKey, rollState.helpOptions, rollState.hinderOptions, rollState.helpPage, 
      rollState.hinderPage, rollState.helpTags, rollState.hinderTags, rollState.buttons, rollState.burnedTags, 
      rollState.justificationNotes, rollState.showJustificationButton);    

    // Update the message with new tag selections
    let title;
    if (rollKey.startsWith('confirm_')) {
      const rollId = rollKey.replace('confirm_', '');
      title = `Reviewing Roll Proposal #${rollId}`;
    } else {
      title = 'Roll Proposal';
    }

    let displayData = RollView.buildRollDisplays(
      rollState.helpTags,
      rollState.hinderTags,
      rollState.description,
      true,
      rollState.burnedTags || new Set(),
      {
        title: title,
        descriptionText: `**Player:** <@${rollState.creatorId}>`,
        narrationLink: rollState.narrationLink,
        justificationNotes: rollState.justificationNotes,
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
    const selectedTag = interaction.values[0];
    if (rollState.helpTags.has(selectedTag)) {
      rollState.burnedTags.add(selectedTag);
    }
  }

  client.rollStates.set(rollKey, rollState);

  // Rebuild components to reflect current selection state
  let interactiveComponents = RollView.buildRollInteractives(rollKey, rollState.helpOptions, rollState.hinderOptions, rollState.helpPage, 
    rollState.hinderPage, rollState.helpTags, rollState.hinderTags, rollState.buttons, rollState.burnedTags, rollState.justificationNotes, rollState.showJustificationButton);
  
  // Update the message with new tag selections
  let title;
  if (rollKey.startsWith('confirm_')) {
    const rollId = rollKey.replace('confirm_', '');
    title = `Reviewing Roll Proposal #${rollId}`;
  } else {
    title = 'Roll Proposal';
  }
  
   let displayData = RollView.buildRollDisplays(
    rollState.helpTags,
    rollState.hinderTags,
    rollState.description,
    true,
    rollState.burnedTags || new Set(),
    {
      title: title,
      descriptionText: `**Player:** <@${rollState.creatorId}>`,
      narrationLink: rollState.narrationLink,
      justificationNotes: rollState.justificationNotes,
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
    const rollType = rollKey.includes('reaction') ? '/roll-reaction' : '/roll-propose';
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

  // Create the roll proposal in storage
  const guildId = requireGuildId(interaction);
  const rollId = RollStorage.createRoll(guildId, {
    creatorId: rollState.creatorId,
    characterId: rollState.characterId,
    sceneId: interaction.channelId,
    helpTags: rollState.helpTags,
    hinderTags: rollState.hinderTags,
    burnedTags: rollState.burnedTags || new Set(),
    description: rollState.description,
    narrationLink: rollState.narrationLink || null,
    justificationNotes: rollState.justificationNotes || null,
    reactionToRollId: rollState.reactionToRollId || null,
    isReaction: rollState.isReaction || false,
  });

  // Clean up temporary state
  client.rollStates.delete(rollKey);

  // Update ephemeral message to show submission (use Components V2 to match original message)
  const submitContainer = new ContainerBuilder();
  const isReaction = rollState.isReaction || false;
  const rollType = isReaction ? 'Reaction Roll' : 'Action Roll';
  
  submitContainer.addTextDisplayComponents(
    new TextDisplayBuilder()
      .setContent(`**${rollType} #${rollId} Submitted!**\n\nYour ${rollType.toLowerCase()} proposal has been submitted for narrator approval.`)
  );

  await interaction.update({
    components: [submitContainer],
    flags: MessageFlags.IsComponentsV2,
  });

  // Post public message to channel with narrator ping
  const rollEditorRoleId = getServerEnv('ROLL_EDITOR_ROLE_ID', guildId);
  const narratorMention = rollEditorRoleId ? `<@&${rollEditorRoleId}>` : 'Narrators';
  
  const title = isReaction 
    ? `Reaction Roll #${rollId}${rollState.reactionToRollId ? ` (to Roll #${rollState.reactionToRollId})` : ''}\n${rollState.description}`
    : `Roll Proposal #${rollId}\n${rollState.description}`;
  
  const displayData = RollView.buildRollDisplays(
    rollState.helpTags,
    rollState.hinderTags,
    rollState.description,
    true,
    rollState.burnedTags || new Set(),
    {
      title: title,
      descriptionText: `**From:** <@${rollState.creatorId}>`,
      narrationLink: rollState.narrationLink,
      justificationNotes: rollState.justificationNotes,
      footer: `${narratorMention} should use /roll-confirm ${rollId} to review and confirm.`
    }
  );

  await interaction.followUp({
    components: [displayData.descriptionContainer, displayData.helpContainer, displayData.hinderContainer, displayData.footerContainer],
    flags: MessageFlags.IsComponentsV2,
  });
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
  
  // Update roll state with justification notes
  rollState.justificationNotes = justificationNotes;
  client.rollStates.set(rollKey, rollState);

  // Rebuild the roll components with updated justification notes
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
    rollState.showJustificationButton
  );

  // Rebuild display with updated justification notes
  const displayData = RollView.buildRollDisplays(
    rollState.helpTags,
    rollState.hinderTags,
    rollState.description,
    true,
    rollState.burnedTags || new Set(),
    {
      narrationLink: rollState.narrationLink,
      justificationNotes: rollState.justificationNotes,
      showJustificationPlaceholder: !rollState.justificationNotes
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

  // Update the roll with any edits made
  RollStorage.updateRoll(guildId, rollState.rollId, {
    status: RollStatus.CONFIRMED,
    helpTags: rollState.helpTags,
    hinderTags: rollState.hinderTags,
    burnedTags: rollState.burnedTags || new Set(),
    description: rollState.description,
    narrationLink: rollState.narrationLink,
    justificationNotes: rollState.justificationNotes,
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
    rollState.helpTags,
    rollState.hinderTags,
    rollState.description,
    true,
    rollState.burnedTags || new Set(),
      {
        title: title,
        descriptionText: `**Player:** <@${rollState.creatorId}>\n**Confirmed by:** <@${interaction.user.id}>`,
        narrationLink: rollState.narrationLink,
        justificationNotes: rollState.justificationNotes,
        footer: `<@${rollState.creatorId}> can now execute this roll with /roll ${rollState.rollId}`
      }
  );

  await interaction.followUp({
    components: [displayData.descriptionContainer, displayData.helpContainer, displayData.hinderContainer, displayData.footerContainer],
    flags: MessageFlags.IsComponentsV2,
  });
}