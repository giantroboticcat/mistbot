/**
 * Utility for formatting story tags with ANSI color codes
 */
export class TagFormatter {
  static BOLD_YELLOW = '\x1b[1;33m';
  static BOLD_RED = '\x1b[1;31m';
  static BOLD_GREEN = '\x1b[1;32m';
  static RESET = '\x1b[0m';

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
   * Format tags, statuses, and limits in a single ANSI code block
   * @param {string[]} tags - Array of tags (yellow)
   * @param {string[]} statuses - Array of statuses (green)
   * @param {string[]} limits - Array of limits (red)
   * @returns {string} Formatted items in a single ansi code block
   */
  static formatSceneStatusInCodeBlock(tags, statuses, limits) {
    const parts = [];
    
    if (tags.length > 0) {
      parts.push(this.formatStoryTags(tags));
    }
    
    if (statuses.length > 0) {
      parts.push(this.formatStatuses(statuses));
    }
    
    if (limits.length > 0) {
      parts.push(this.formatLimits(limits));
    }
    
    if (parts.length === 0) {
      return 'None';
    }
    
    const formatted = parts.join(', ');
    return `\`\`\`ansi\n${formatted}\n\`\`\``;
  }
}

