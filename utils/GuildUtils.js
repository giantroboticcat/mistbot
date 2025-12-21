/**
 * Utility functions for working with Discord guilds
 */

/**
 * Get the guild ID from an interaction
 * @param {import('discord.js').Interaction} interaction - The Discord interaction
 * @returns {string|null} The guild ID or null if not in a guild
 */
export function getGuildId(interaction) {
  if (interaction.guildId) {
    return interaction.guildId;
  }
  if (interaction.guild) {
    return interaction.guild.id;
  }
  // For DMs, we might want to use a default guild or handle differently
  // For now, return null if no guild is available
  return null;
}

/**
 * Get the guild ID from an interaction, throwing an error if not available
 * @param {import('discord.js').Interaction} interaction - The Discord interaction
 * @returns {string} The guild ID
 * @throws {Error} If the interaction is not in a guild
 */
export function requireGuildId(interaction) {
  const guildId = getGuildId(interaction);
  if (!guildId) {
    throw new Error('This command can only be used in a server (guild).');
  }
  return guildId;
}

