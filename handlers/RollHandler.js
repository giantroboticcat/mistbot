import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { RollView } from '../utils/RollView.js';
import { RollStorage } from '../utils/RollStorage.js';

// Role ID that can edit rolls (set via environment variable)
const ROLL_EDITOR_ROLE_ID = process.env.ROLL_EDITOR_ROLE_ID || null;
// Role name for error messages (optional, set via environment variable)
const ROLL_EDITOR_ROLE = process.env.ROLL_EDITOR_ROLE || 'editor role';

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
 * Rebuild roll components with current page state
 */
export function rebuildRollComponents(rollState, rollKey, client) {
  const { helpOptions, hinderOptions, helpPage, hinderPage, helpTags, hinderTags, burnedTags = new Set() } = rollState;
  // Check if this is a confirmation view (no buttons) or proposal view (with buttons)
  const includeButtons = !rollKey.startsWith('confirm_') && !rollKey.startsWith('temp_');
  const components = RollView.buildRollComponents(rollKey, helpOptions, hinderOptions, helpPage, hinderPage, helpTags, hinderTags, includeButtons, burnedTags);
  
  // For temp rolls (proposals), add submit/cancel buttons
  if (rollKey.startsWith('temp_')) {
    const submitButton = new ButtonBuilder()
      .setCustomId(`roll_submit_${rollKey}`)
      .setLabel('Submit Proposal')
      .setStyle(ButtonStyle.Primary);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId(`roll_cancel_${rollKey}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);
    
    components.push(new ActionRowBuilder().setComponents([submitButton, cancelButton]));
  }
  
  // For confirm rolls (narrator review), add confirm button
  if (rollKey.startsWith('confirm_')) {
    const rollId = rollKey.replace('confirm_', '');
    const confirmButton = new ButtonBuilder()
      .setCustomId(`roll_confirm_${rollId}`)
      .setLabel('Confirm Roll')
      .setStyle(ButtonStyle.Success);
    
    
    components.push(new ActionRowBuilder().setComponents([confirmButton]));
  }
  
  return components;
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
    const components = rebuildRollComponents(rollState, rollKey, client);
    
    let displayData;
    if (rollKey.startsWith('confirm_')) {
      const rollId = rollKey.replace('confirm_', '');
      displayData = RollView.formatRollProposalContent(
        rollState.helpTags,
        rollState.hinderTags,
        rollState.description,
        true,
        rollState.burnedTags || new Set(),
        {
          title: `Reviewing Roll Proposal #${rollId}`,
          descriptionText: `**Player:** <@${rollState.creatorId}>`,
          footer: 'You can edit the tags above before confirming.'
        }
      );
    } else {
      displayData = RollView.formatRollProposalContent(
        rollState.helpTags,
        rollState.hinderTags,
        rollState.description,
        true,
        rollState.burnedTags || new Set()
      );
    }

    // Combine Components V2 display components with interactive components
    const allComponents = [...(displayData.components || []), ...components];

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
    const components = rebuildRollComponents(rollState, rollKey, client);
    
    // Update the message with new tag selections
    let displayData;
    if (rollKey.startsWith('confirm_')) {
      const rollId = rollKey.replace('confirm_', '');
      displayData = RollView.formatRollProposalContent(
        rollState.helpTags,
        rollState.hinderTags,
        rollState.description,
        true,
        rollState.burnedTags || new Set(),
        {
          title: `Reviewing Roll Proposal #${rollId}`,
          descriptionText: `**Player:** <@${rollState.creatorId}>`,
          footer: 'You can edit the tags above before confirming.'
        }
      );
    } else {
      displayData = RollView.formatRollProposalContent(
        rollState.helpTags,
        rollState.hinderTags,
        rollState.description,
        true,
        rollState.burnedTags || new Set()
      );
    }

    // Combine Components V2 display components with interactive components
    const allComponents = [...(displayData.components || []), ...components];

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
      content: `You don't have permission to edit this roll.`,
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
  const components = rebuildRollComponents(rollState, rollKey, client);
  
  // Update the message with new tag selections
  let displayData;
  if (rollKey.startsWith('confirm_')) {
    const rollId = rollKey.replace('confirm_', '');
    displayData = RollView.formatRollProposalContent(
      rollState.helpTags,
      rollState.hinderTags,
      rollState.description,
      true,
      rollState.burnedTags || new Set(),
      {
        title: `Reviewing Roll Proposal #${rollId}`,
        descriptionText: `**Player:** <@${rollState.creatorId}>`,
        footer: 'You can edit the tags above before confirming.'
      }
    );
  } else {
    displayData = RollView.formatRollProposalContent(
      rollState.helpTags,
      rollState.hinderTags,
      rollState.description,
      true,
      rollState.burnedTags || new Set()
    );
  }

  // Combine Components V2 display components with interactive components
  const allComponents = [...(displayData.components || []), ...components];

  await interaction.update({
    components: allComponents,
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle roll button - perform the dice roll
 */
export async function handleRollButton(interaction, client) {
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

    // Calculate modifier using status values and burned tags
    const burnedTags = rollState.burnedTags || new Set();
    const modifier = RollView.calculateModifier(rollState.helpTags, rollState.hinderTags, burnedTags);
    const finalResult = baseRoll + modifier;

    // Format roll result using RollView
    const resultData = RollView.formatRollResult(
      die1,
      die2,
      baseRoll,
      modifier,
      finalResult,
      rollState.helpTags,
      rollState.hinderTags,
      burnedTags,
      rollState.description,
      null // No narrator mention for old roll system
    );

    // Update the ephemeral message to hide components (use Components V2)
    const updateContainer = new ContainerBuilder();
    updateContainer.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent('**Roll completed!** See the result below.')
    );

    await interaction.update({
      components: [updateContainer],
      flags: MessageFlags.IsComponentsV2,
    });

    // Send a public follow-up message with the roll result
    await interaction.followUp(resultData);
  }
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

  // Update message to show cancellation
  await interaction.update({
    content: '**Roll Canceled**',
    components: [], // Hide all components
  });
}

/**
 * Handle roll submit button (submit proposal for narrator approval)
 */
export async function handleRollSubmit(interaction, client) {
  const customId = interaction.customId;
  const rollKey = customId.replace('roll_submit_', '');
  
  if (!client.rollStates.has(rollKey)) {
    await interaction.reply({
      content: 'This roll session has expired. Please run /roll-propose again.',
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
  const rollId = RollStorage.createRoll({
    creatorId: rollState.creatorId,
    characterId: rollState.characterId,
    sceneId: interaction.channelId,
    helpTags: rollState.helpTags,
    hinderTags: rollState.hinderTags,
    burnedTags: rollState.burnedTags || new Set(),
    description: rollState.description,
  });

  // Clean up temporary state
  client.rollStates.delete(rollKey);

  // Update ephemeral message to show submission (use Components V2 to match original message)
  const submitContainer = new ContainerBuilder();
  submitContainer.addTextDisplayComponents(
    new TextDisplayBuilder()
      .setContent(`**Roll Proposal #${rollId} Submitted!**\n\nYour roll proposal has been submitted for narrator approval.`)
  );

  await interaction.update({
    components: [submitContainer],
    flags: MessageFlags.IsComponentsV2,
  });

  // Post public message to channel with narrator ping
  const ROLL_EDITOR_ROLE_ID = process.env.ROLL_EDITOR_ROLE_ID || null;
  const narratorMention = ROLL_EDITOR_ROLE_ID ? `<@&${ROLL_EDITOR_ROLE_ID}>` : 'Narrators';
  
  const displayData = RollView.formatRollProposalContent(
    rollState.helpTags,
    rollState.hinderTags,
    rollState.description,
    true,
    rollState.burnedTags || new Set(),
    {
      title: `Roll Proposal #${rollId}`,
      descriptionText: `${narratorMention}\n**From:** <@${rollState.creatorId}>`,
      footer: `Use /roll-confirm ${rollId} to review and confirm.`
    }
  );

  await interaction.followUp({
    components: displayData.components,
    flags: MessageFlags.IsComponentsV2,
  });
}

/**
 * Handle roll confirm button (narrator confirms a proposal)
 */
export async function handleRollConfirm(interaction, client) {
  const customId = interaction.customId;
  const rollId = parseInt(customId.replace('roll_confirm_', ''), 10);
  
  // Check narrator permissions
  const ROLL_EDITOR_ROLE_ID = process.env.ROLL_EDITOR_ROLE_ID || null;
  if (!ROLL_EDITOR_ROLE_ID) {
    await interaction.reply({
      content: 'Roll confirmation is not configured.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    if (!interaction.member.roles.includes(ROLL_EDITOR_ROLE_ID)) {
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
  const rollKey = `confirm_${rollId}`;
  const rollState = client.rollStates.get(rollKey);
  
  if (!rollState) {
    await interaction.reply({
      content: 'Roll session expired. Please run /roll-confirm again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Update the roll with any edits made
  RollStorage.updateRoll(rollId, {
    status: 'confirmed',
    helpTags: rollState.helpTags,
    hinderTags: rollState.hinderTags,
    burnedTags: rollState.burnedTags || new Set(),
    description: rollState.description,
    confirmedBy: interaction.user.id,
  });

  // Clean up temporary state
  client.rollStates.delete(rollKey);

  // Update ephemeral message (use Components V2 to match original message)
  const confirmContainer = new ContainerBuilder();
  confirmContainer.addTextDisplayComponents(
    new TextDisplayBuilder()
      .setContent(`**Roll Proposal #${rollId} Confirmed by <@${interaction.user.id}>!**`)
  );

  await interaction.update({
    components: [confirmContainer],
    flags: MessageFlags.IsComponentsV2,
  });

  // Post public message to channel with creator ping
  const displayData = RollView.formatRollProposalContent(
    rollState.helpTags,
    rollState.hinderTags,
    rollState.description,
    true,
    rollState.burnedTags || new Set(),
    {
      title: `Roll Proposal #${rollId} Confirmed`,
      descriptionText: `<@${rollState.creatorId}>\n**Confirmed by:** <@${interaction.user.id}>`,
      footer: `You can now execute this roll with /roll ${rollId}`
    }
  );

  await interaction.followUp({
    components: displayData.components,
    flags: MessageFlags.IsComponentsV2,
  });
}