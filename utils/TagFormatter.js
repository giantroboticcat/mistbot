/**
 * Utility for formatting story tags with ANSI color codes
 */
export class TagFormatter {
  // ANSI escape codes
  static BOLD_YELLOW = '\x1b[1;33m';
  static RESET = '\x1b[0m';

  /**
   * Format a single tag with bold yellow ANSI codes
   * @param {string} tag - The tag to format
   * @returns {string} Formatted tag
   */
  static formatTag(tag) {
    return `${this.BOLD_YELLOW}${tag}${this.RESET}`;
  }

  /**
   * Format an array of tags with bold yellow ANSI codes, joined by commas
   * @param {string[]} tags - Array of tags to format
   * @returns {string} Formatted tags joined by commas
   */
  static formatTags(tags) {
    return tags.map(tag => this.formatTag(tag)).join(', ');
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
    const formatted = this.formatTags(tags);
    return `\`\`\`ansi\n${formatted}\n\`\`\``;
  }
}

