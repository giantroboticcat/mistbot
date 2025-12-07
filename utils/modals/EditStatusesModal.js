import { ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } from 'discord.js';

/**
 * Modal for editing character statuses with power levels
 * Uses Discord.js Components V2 (LabelBuilder)
 */
export class EditStatusesModal {
  /**
   * Build the edit statuses modal for a character using Components V2
   * @param {Object} character - The character to edit
   * @returns {ModalBuilder} The modal builder with Components V2 structure
   */
  static build(character) {
    const modal = new ModalBuilder()
      .setCustomId(`edit_statuses_modal_${character.id}`)
      .setTitle('Edit Statuses');

    // Format existing statuses for editing
    // Format: "statusname:1,2,3" where numbers are checked power levels
    // Or just "statusname" if no power levels
    const statusLines = character.tempStatuses.map(s => {
      if (typeof s === 'string') {
        return s;
      } else {
        const statusName = s.status;
        const powerLevels = s.powerLevels || {};
        
        // Get all checked power levels (1-6)
        const checkedLevels = [];
        for (let p = 1; p <= 6; p++) {
          if (powerLevels[p]) {
            checkedLevels.push(p);
          }
        }
        
        // Format as "statusname:1,2,3" or just "statusname" if no levels
        if (checkedLevels.length > 0) {
          return `${statusName}:${checkedLevels.join(',')}`;
        } else {
          return statusName;
        }
      }
    });

    const statusesValue = statusLines.join('\n');
    
    const statusesInput = new TextInputBuilder()
      .setCustomId('statuses')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter statuses')
      .setValue(statusesValue || '')
      .setRequired(false)
      .setMaxLength(2000);

    const statusesLabel = new LabelBuilder()
      .setLabel('Statuses (one per line, format: name:1,2,3)')
      .setTextInputComponent(statusesInput);

    modal.addLabelComponents(statusesLabel);
    return modal;
  }

  /**
   * Parse statuses from modal input
   * @param {string} input - The raw input from the modal
   * @returns {Array<Object|string>} Array of status objects or strings
   */
  static parseStatuses(input) {
    if (!input || input.trim() === '') {
      return [];
    }

    const lines = input.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const statuses = [];

    for (const line of lines) {
      // Check if line has power levels (format: "statusname:1,2,3")
      if (line.includes(':')) {
        const [statusName, levelsStr] = line.split(':').map(s => s.trim());
        
        if (statusName && levelsStr) {
          // Parse power levels
          const levelNumbers = levelsStr.split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n >= 1 && n <= 6);
          
          if (levelNumbers.length > 0) {
            // Create powerLevels object
            const powerLevels = {};
            levelNumbers.forEach(level => {
              powerLevels[level] = true;
            });
            
            statuses.push({
              status: statusName,
              powerLevels: powerLevels
            });
          } else {
            // Invalid levels, treat as simple string status
            statuses.push(statusName);
          }
        } else {
          // Invalid format, treat as simple string status
          statuses.push(line);
        }
      } else {
        // No power levels, treat as simple string status
        statuses.push(line);
      }
    }

    return statuses;
  }
}

