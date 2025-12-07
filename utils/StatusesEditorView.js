import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';

/**
 * View for editing character statuses with interactive Components V2
 * Provides a tabular interface with toggle buttons for power levels
 */
export class StatusesEditorView {
  /**
   * Format status name with highest power level
   * @param {Object|string} status - Status object or string
   * @returns {string} Formatted status name as "statusname-highestlevel"
   */
  static formatStatusName(status) {
    if (typeof status === 'string') {
      return status;
    }
    
    const statusName = status.status;
    const powerLevels = status.powerLevels || {};
    
    // Find highest power level
    let highestLevel = 0;
    for (let p = 6; p >= 1; p--) {
      if (powerLevels[p]) {
        highestLevel = p;
        break;
      }
    }
    
    return highestLevel > 0 ? `${statusName}-${highestLevel}` : statusName;
  }

  /**
   * Build the statuses editor interface
   * @param {Object} character - The character to edit
   * @param {number} statusIndex - Currently selected status index (for editing power levels)
   * @returns {Object} Object with display containers and interactive components
   */
  static build(character, statusIndex = null) {
    const statuses = character.tempStatuses || [];
    
    // Build display showing current statuses in table format
    const statusTable = this.formatStatusesTable(statuses);
    
    const headerContainer = new ContainerBuilder();
    headerContainer.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`**Edit Statuses for ${character.name}**\n\n${statusTable}`)
    );

    // Build interactive components
    const interactiveRows = [];
    
    // Row 1: Add/Remove status controls
    const addStatusButton = new ButtonBuilder()
      .setCustomId(`statuses_add_${character.id}`)
      .setLabel('➕ Add Status')
      .setStyle(ButtonStyle.Success);
    
    const removeStatusSelect = new StringSelectMenuBuilder()
      .setCustomId(`statuses_remove_${character.id}`)
      .setPlaceholder('Remove a status...')
      .setMinValues(0)
      .setMaxValues(1);
    
    if (statuses.length > 0) {
      statuses.forEach((status, index) => {
        const statusName = this.formatStatusName(status);
        removeStatusSelect.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(statusName)
            .setValue(`${index}`)
            .setDescription('Remove this status')
        );
      });
    } else {
      removeStatusSelect.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('No statuses to remove')
          .setValue('none')
          .setDescription('Add a status first')
      );
      removeStatusSelect.setDisabled(true);
    }
    
    interactiveRows.push(
      new ActionRowBuilder().setComponents([addStatusButton]),
      new ActionRowBuilder().setComponents([removeStatusSelect])
    );

    // Rows 2-7: Power level toggles for selected status (if one is selected)
    if (statusIndex !== null && statusIndex >= 0 && statusIndex < statuses.length) {
      const selectedStatus = statuses[statusIndex];
      if (typeof selectedStatus === 'object' && selectedStatus.status) {
        const statusName = this.formatStatusName(selectedStatus);
        const powerLevels = selectedStatus.powerLevels || {};
        
        // Create toggle buttons for each power level (1-6)
        const toggleButtons = [];
        for (let level = 1; level <= 6; level++) {
          const isChecked = powerLevels[level] || false;
          const toggleButton = new ButtonBuilder()
            .setCustomId(`statuses_toggle_${character.id}_${statusIndex}_${level}`)
            .setLabel(`${level}${isChecked ? ' ✓' : ''}`)
            .setStyle(isChecked ? ButtonStyle.Success : ButtonStyle.Secondary);
          toggleButtons.push(toggleButton);
        }
        
        // Split into two rows of 3 buttons each
        interactiveRows.push(
          new ActionRowBuilder().setComponents([
            new ButtonBuilder()
              .setCustomId(`statuses_edit_${character.id}_${statusIndex}`)
              .setLabel(`Editing: ${statusName}`)
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true)
          ]),
          new ActionRowBuilder().setComponents(toggleButtons.slice(0, 3)),
          new ActionRowBuilder().setComponents(toggleButtons.slice(3, 6))
        );
      }
    } else if (statuses.length > 0) {
      // Show select menu to choose which status to edit
      const editStatusSelect = new StringSelectMenuBuilder()
        .setCustomId(`statuses_edit_select_${character.id}`)
        .setPlaceholder('Select a status to edit power levels...')
        .setMinValues(1)
        .setMaxValues(1);
      
      statuses.forEach((status, index) => {
        if (typeof status === 'object' && status.status) {
          const statusName = this.formatStatusName(status);
          
          editStatusSelect.addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(statusName)
              .setValue(`${index}`)
              .setDescription('Edit power levels for this status')
          );
        }
      });
      
      if (editStatusSelect.options.length > 0) {
        interactiveRows.push(new ActionRowBuilder().setComponents([editStatusSelect]));
      }
    }

    // Done button
    const doneButton = new ButtonBuilder()
      .setCustomId(`statuses_done_${character.id}`)
      .setLabel('✅ Done Editing')
      .setStyle(ButtonStyle.Primary);
    
    interactiveRows.push(new ActionRowBuilder().setComponents([doneButton]));

    return {
      headerContainer,
      interactiveRows
    };
  }

  /**
   * Format statuses as a table
   * @param {Array<Object|string>} statuses - Array of status objects or strings
   * @returns {string} Formatted table string
   */
  static formatStatusesTable(statuses) {
    if (statuses.length === 0) {
      return '```\nNo statuses\n```';
    }

    // Find the longest status name for alignment (using formatted names)
    let maxNameLength = 8; // Minimum width for "Status"
    for (const status of statuses) {
      const formattedName = this.formatStatusName(status);
      if (formattedName.length > maxNameLength) {
        maxNameLength = formattedName.length;
      }
    }
    maxNameLength = Math.max(maxNameLength, 8);

    const lines = [];
    
    // Header row
    const header = `Status${' '.repeat(maxNameLength - 6)} │ 1 2 3 4 5 6`;
    lines.push(header);
    
    // Separator row
    lines.push(`${'─'.repeat(maxNameLength + 14)}`);
    
    for (const status of statuses) {
      const statusName = this.formatStatusName(status);
      const powerLevels = typeof status === 'object' && status.powerLevels ? status.powerLevels : {};
      
      // Build level indicators (1-6)
      const levelIndicators = [];
      for (let p = 1; p <= 6; p++) {
        if (powerLevels[p]) {
          levelIndicators.push('✓');
        } else {
          levelIndicators.push('·');
        }
      }
      
      // Format: "statusName │ ✓ ✓ · · · ·"
      const paddedName = statusName.padEnd(maxNameLength, ' ');
      lines.push(`${paddedName} │ ${levelIndicators.join(' ')}`);
    }
    
    return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
  }

  /**
   * Combine display and interactive components
   * @param {Object} editorData - Object with headerContainer and interactiveRows
   * @returns {Array} Combined array of components
   */
  static combineComponents(editorData) {
    return [
      editorData.headerContainer,
      ...editorData.interactiveRows
    ];
  }
}

