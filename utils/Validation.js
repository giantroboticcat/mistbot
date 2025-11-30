/**
 * Validation utilities for scene items
 */
export class Validation {
  /**
   * Validate a status format
   * Statuses should be hyphenated with no spaces and end in a dash-number like "concerned-5"
   * @param {string} status - The status to validate
   * @returns {{ valid: boolean, error?: string }}
   */
  static validateStatus(status) {
    if (!status || typeof status !== 'string') {
      return { valid: false, error: 'Status cannot be empty' };
    }

    const trimmed = status.trim();
    
    // Check for spaces
    if (trimmed.includes(' ')) {
      return { valid: false, error: 'Status cannot contain spaces. Use hyphens instead (e.g., "concerned-5")' };
    }

    // Must end with dash-number pattern like "-5" or "-10"
    const dashNumberPattern = /-\d+$/;
    if (!dashNumberPattern.test(trimmed)) {
      return { 
        valid: false, 
        error: 'Status must end with a dash and number (e.g., "concerned-5", "time-passes-3")' 
      };
    }

    // Check that it's not just "-5" (needs at least one character before the dash)
    // Find the last dash (the one before the number)
    const lastDashIndex = trimmed.lastIndexOf('-');
    // The last dash should be at position length-2 or earlier (to have at least one char before it)
    // If lastDashIndex >= length-1, that means the dash is at the end or there's no number
    if (trimmed.length <= 2 || lastDashIndex === -1 || lastDashIndex >= trimmed.length - 1) {
      return { 
        valid: false, 
        error: 'Status must have text before the dash-number (e.g., "concerned-5")' 
      };
    }

    return { valid: true };
  }

  /**
   * Validate multiple statuses
   * @param {string[]} statuses - Array of statuses to validate
   * @returns {{ valid: boolean, errors?: string[] }}
   */
  static validateStatuses(statuses) {
    const errors = [];
    for (const status of statuses) {
      const result = this.validateStatus(status);
      if (!result.valid) {
        errors.push(`"${status}": ${result.error}`);
      }
    }
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Validate a limit format
   * Limits should be hyphenated with no spaces and end with a number in parentheses like "harm(4)"
   * @param {string} limit - The limit to validate
   * @returns {{ valid: boolean, error?: string }}
   */
  static validateLimit(limit) {
    if (!limit || typeof limit !== 'string') {
      return { valid: false, error: 'Limit cannot be empty' };
    }

    const trimmed = limit.trim();
    
    // Check for spaces
    if (trimmed.includes(' ')) {
      return { valid: false, error: 'Limit cannot contain spaces. Use hyphens instead (e.g., "harm(4)")' };
    }

    // Must end with number in parentheses like "(4)" or "(10)"
    const parenNumberPattern = /\(\d+\)$/;
    if (!parenNumberPattern.test(trimmed)) {
      return { 
        valid: false, 
        error: 'Limit must end with a number in parentheses (e.g., "harm(4)", "put-to-sleep(3)")' 
      };
    }

    // Check that it's not just "(4)" (needs at least one character before the parentheses)
    const openParenIndex = trimmed.lastIndexOf('(');
    if (openParenIndex === 0 || openParenIndex === -1) {
      return { 
        valid: false, 
        error: 'Limit must have text before the parentheses (e.g., "harm(4)")' 
      };
    }

    return { valid: true };
  }

  /**
   * Validate multiple limits
   * @param {string[]} limits - Array of limits to validate
   * @returns {{ valid: boolean, errors?: string[] }}
   */
  static validateLimits(limits) {
    const errors = [];
    for (const limit of limits) {
      const result = this.validateLimit(limit);
      if (!result.valid) {
        errors.push(`"${limit}": ${result.error}`);
      }
    }
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

