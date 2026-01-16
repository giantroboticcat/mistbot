/**
 * Utility for formatting story tags with ANSI color codes
 */
export class TagFormatter {
  static BOLD_YELLOW = '\x1b[1;33m';
  static BOLD_RED = '\x1b[1;31m';
  static BOLD_GREEN = '\x1b[1;32m';
  static BOLD_BLUE = '\x1b[1;34m';  // Blue for blocked tags
  static ORANGE_BACKGROUND = '\x1b[0;41m';
  static RESET = '\x1b[0m';
  
  // Circle emojis for tag type indicators
  static YELLOW_CIRCLE = '🟡';  // Yellow circle for tags
  static GREEN_CIRCLE = '🟢';   // Green circle for status
  static RED_CIRCLE = '🔴';     // Red circle for limits
  static ORANGE_CIRCLE = '🟠';  // Orange circle for weakness
  static OPEN_BOOK = '📖';      // Open book emoji for blocked tags

  /**
   * Format a single tag with bold yellow text
   * @param {string} tag - The tag to format
   * @returns {string} Formatted tag
   */
  static formatStoryTag(tag) {
    return `${this.BOLD_YELLOW}${tag}${this.RESET}`;
  }

  /**
   * Format an array of tags with bold yellow ANSI codes, joined by commas
   * @param {string[]} tags - Array of tags to format
   * @returns {string} Formatted tags joined by commas
   */
  static formatStoryTags(tags) {
    return tags.map(tag => this.formatStoryTag(tag)).join(', ');
  }

  /**
   * Format a single status with bold green text
   * @param {string} status - The status to format
   * @returns {string} Formatted status
   */
  static formatStatus(status) {
    return `${this.BOLD_GREEN}${status}${this.RESET}`;
  }

  /**
   * Format an array of statuses with bold green ANSI codes, joined by commas
   * @param {string[]} statuses - Array of statuses to format
   * @returns {string} Formatted statuses joined by commas
   */
  static formatStatuses(statuses) {
    return statuses.map(status => this.formatStatus(status)).join(', ');
  }

  /**
   * Format a single limit with bold red text
   * @param {string} limit - The limit to format
   * @returns {string} Formatted limit
   */
  static formatLimit(limit) {
    return `${this.BOLD_RED}${limit}${this.RESET}`;
  }

  /**
   * Format an array of limits with bold red ANSI codes, joined by commas
   * @param {string[]} limits - Array of limits to format
   * @returns {string} Formatted limits joined by commas
   */
  static formatLimits(limits) {
    return limits.map(limit => this.formatLimit(limit)).join(', ');
  }

  /**
   * Format tags in an ANSI code block for Discord
   * @param {string[]} tags - Array of tags to format
   * @returns {string} Formatted tags in ansi code block
   */
  static formatTagsInCodeBlock(tags) {
    if (tags.length === 0) {
      return 'None';
    }
    const formatted = this.formatStoryTags(tags);
    return `\`\`\`ansi\n${formatted}\n\`\`\``;
  }

  /**
   * Format statuses in an ANSI code block for Discord
   * @param {string[]} statuses - Array of statuses to format
   * @returns {string} Formatted statuses in ansi code block
   */
  static formatStatusesInCodeBlock(statuses) {
    if (statuses.length === 0) {
      return 'None';
    }
    const formatted = this.formatStatuses(statuses);
    return `\`\`\`ansi\n${formatted}\n\`\`\``;
  }

  /**
   * Format limits in an ANSI code block for Discord
   * @param {string[]} limits - Array of limits to format
   * @returns {string} Formatted limits in ansi code block
   */
  static formatLimitsInCodeBlock(limits) {
    if (limits.length === 0) {
      return 'None';
    }
    const formatted = this.formatLimits(limits);
    return `\`\`\`ansi\n${formatted}\n\`\`\``;
  }

  /**
   * Format a single blocked tag with blue text
   * Removes the "-X" suffix for display
   * @param {string} blocked - The blocked tag to format (e.g., "Test Truth-X")
   * @returns {string} Formatted blocked tag without "-X" suffix (e.g., "Test Truth")
   */
  static formatBlocked(blocked) {
    // Remove "-X" suffix for display
    const displayName = blocked.endsWith('-X') ? blocked.slice(0, -2) : blocked;
    return `${this.BOLD_BLUE}${displayName}${this.RESET}`;
  }

  /**
   * Format an array of blocked tags with orange ANSI codes, joined by commas
   * @param {string[]} blockeds - Array of blocked tags to format
   * @returns {string} Formatted blocked tags joined by commas
   */
  static formatBlockeds(blockeds) {
    return blockeds.map(blocked => this.formatBlocked(blocked)).join(', ');
  }

  /**
   * Format blocked tags in an ANSI code block for Discord
   * @param {string[]} blockeds - Array of blocked tags to format
   * @returns {string} Formatted blocked tags in ansi code block
   */
  static formatBlockedsInCodeBlock(blockeds) {
    if (blockeds.length === 0) {
      return 'None';
    }
    const formatted = this.formatBlockeds(blockeds);
    return `\`\`\`ansi\n${formatted}\n\`\`\``;
  }

  /**
   * Format tags, statuses, limits, and blocked tags in a single ANSI code block
   * Each item is on its own line with emoji prefix for mobile visibility
   * @param {string[]} tags - Array of tags (yellow)
   * @param {string[]} statuses - Array of statuses (green)
   * @param {string[]} limits - Array of limits (red)
   * @param {string[]} blockeds - Array of blocked tags (orange)
   * @returns {string} Formatted items in a single ansi code block, one per line
   */
  static formatSceneStatusInCodeBlock(tags, statuses, limits, blockeds = []) {
    const lines = [];
    
    // Add tags with yellow circle (one per line)
    tags.forEach(tag => {
      const formattedTag = this.formatStoryTag(tag);
      lines.push(`${this.YELLOW_CIRCLE} ${formattedTag}`);
    });
    
    // Add statuses with green circle (one per line)
    statuses.forEach(status => {
      const formattedStatus = this.formatStatus(status);
      lines.push(`${this.GREEN_CIRCLE} ${formattedStatus}`);
    });
    
    // Add limits with red circle (one per line)
    limits.forEach(limit => {
      const formattedLimit = this.formatLimit(limit);
      lines.push(`${this.RED_CIRCLE} ${formattedLimit}`);
    });
    
    // Add blocked tags with open book emoji (one per line)
    blockeds.forEach(blocked => {
      const formattedBlocked = this.formatBlocked(blocked);
      lines.push(`${this.OPEN_BOOK} ${formattedBlocked}`);
    });
    
    if (lines.length === 0) {
      return 'None';
    }
    
    const formatted = lines.join('\n');
    return `\`\`\`ansi\n${formatted}\n\`\`\``;
  }

  /**
   * Format a single weakness with orange background
   * @param {string} weakness - The weakness to format
   * @returns {string} Formatted weakness
   */
  static formatWeakness(weakness) {
    return `${this.ORANGE_BACKGROUND}${weakness}${this.RESET}`;
  }

  /**
   * Format an array of weaknesses with orange background, joined by commas
   * @param {string[]} weaknesses - Array of weaknesses to format
   * @returns {string} Formatted weaknesses joined by commas
   */
  static formatWeaknesses(weaknesses) {
    return weaknesses.map(weakness => this.formatWeakness(weakness)).join(', ');
  }

  /**
   * Format tags and weaknesses together in a single ANSI code block
   * Tags are yellow text, weaknesses have orange background
   * @param {string[]} tags - Array of tags to format (yellow)
   * @param {string[]} weaknesses - Array of weaknesses to format (orange background)
   * @returns {string} Formatted tags and weaknesses in a single ansi code block
   */
  static formatTagsAndWeaknessesInCodeBlock(tags, weaknesses) {
    const parts = [];
    
    if (tags.length > 0) {
      parts.push(this.formatStoryTags(tags));
    }
    
    if (weaknesses.length > 0) {
      parts.push(this.formatWeaknesses(weaknesses));
    }
    
    if (parts.length === 0) {
      return 'None';
    }
    
    const formatted = parts.join(', ');
    return `\`\`\`ansi\n${formatted}\n\`\`\``;
  }

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
   * Format statuses in a table format showing checked power levels
   * @param {Array<Object|string>} statuses - Array of status objects with {status, powerLevels} or strings
   * @returns {string} Formatted statuses in a table format with ANSI green
   */
  static formatStatusesAsTable(statuses) {
    if (statuses.length === 0) {
      return 'None';
    }

    // Find the longest status name for alignment (using formatted names)
    let maxNameLength = 8; // Minimum width for "Status"
    for (const status of statuses) {
      const formattedName = this.formatStatusName(status);
      if (formattedName.length > maxNameLength) {
        maxNameLength = formattedName.length;
      }
    }
    maxNameLength = Math.max(maxNameLength, 8); // Ensure at least "Status" width

    const lines = [];
    
    // Header row
    const header = `Status${' '.repeat(maxNameLength - 6)} │ 1 2 3 4 5 6`;
    lines.push(header);
    
    // Separator row
    lines.push(`${'─'.repeat(maxNameLength+14)}`);
    
    for (const status of statuses) {
      const statusName = this.formatStatusName(status);
      const powerLevels = typeof status === 'object' && status.powerLevels ? status.powerLevels : {};
      
      // Build level indicators (1-6)
      const levelIndicators = [];
      for (let p = 1; p <= 6; p++) {
        if (powerLevels[p]) {
          levelIndicators.push(`${this.BOLD_GREEN}✓${this.RESET}`);
        } else {
          levelIndicators.push('·');
        }
      }
      
      // Format: "statusName │ ✓ ✓ · · · ·"
      const paddedName = statusName.padEnd(maxNameLength, ' ');
      lines.push(`${this.BOLD_GREEN}${paddedName}${this.RESET} │ ${levelIndicators.join(' ')}`);
    }
    
    return `\`\`\`ansi\n${lines.join('\n')}\n\`\`\``;
  }

  /**
   * Get a colored circle indicator based on tag type
   * @param {string} type - Type of tag: 'tag', 'status', or 'weakness'
   * @returns {string} Colored circle character
   */
  static getTypeCircle(type) {
    switch (type) {
      case 'tag':
        return this.YELLOW_CIRCLE;
      case 'status':
        return this.GREEN_CIRCLE;
      case 'weakness':
        return this.ORANGE_CIRCLE;
      default:
        return this.YELLOW_CIRCLE; // Default to yellow for tags
    }
  }

  /**
   * Format a tag item with a colored circle prefix based on type
   * @param {string} formattedText - Already formatted tag text (with ANSI codes)
   * @param {string} type - Type of tag: 'tag', 'status', or 'weakness'
   * @param {Object} options - Optional formatting options
   * @param {string} options.characterName - Character name to append "(From CharacterName)" if provided
   * @returns {string} Formatted tag with colored circle prefix
   */
  static formatTagWithCircle(formattedText, type, options = {}) {
    const circle = this.getTypeCircle(type);
    let result = formattedText;
    
    // Add "(From CharacterName)" if character name is provided
    if (options.characterName) {
      result += ` (From ${options.characterName})`;
    }
    
    return `${circle} ${result}`;
  }

  /**
   * Helper function to get character name from tag value and character maps
   * @param {string} tagValue - The tag value to look up
   * @param {Map} characterIdMap - Map of tagValue -> characterId
   * @param {Array} allCharacters - Array of all characters
   * @returns {string|null} Character name if found, null otherwise
   */
  static getCharacterNameFromTag(tagValue, characterIdMap, allCharacters) {
    if (!tagValue || !characterIdMap || !characterIdMap.has(tagValue)) {
      return null;
    }
    
    const characterId = characterIdMap.get(tagValue);
    if (!characterId || !allCharacters || allCharacters.length === 0) {
      return null;
    }
    
    const character = allCharacters.find(char => char.id === characterId);
    return character ? character.name : null;
  }
}

