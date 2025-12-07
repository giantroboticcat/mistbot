/**
 * Discord-related utility functions
 */
export class DiscordUtils {
  /**
   * Get a user's display name from their ID
   * Tries to get guild member display name first, falls back to username
   * @param {import('discord.js').Interaction} interaction - The interaction (for guild and client access)
   * @param {string} userId - The Discord user ID
   * @returns {Promise<string>} The user's display name or username
   */
  static async getUserDisplayName(interaction, userId) {
    try {
      // Try to get guild member first (for display name), fall back to user
      if (interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          return member.displayName || member.user.username;
        } catch {
          // If member not found, try fetching user
          const user = await interaction.client.users.fetch(userId);
          return user.username;
        }
      } else {
        // No guild context, just fetch user
        const user = await interaction.client.users.fetch(userId);
        return user.username;
      }
    } catch (error) {
      // If we can't fetch user info, return the ID as fallback
      console.error('Error fetching user display name:', error);
      return userId;
    }
  }
}

