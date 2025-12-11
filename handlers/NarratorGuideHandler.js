import { MessageFlags } from 'discord.js';
import { NarratorGuideCommand } from '../commands/NarratorGuideCommand.js';

/**
 * Handle narrator guide select menu interaction
 */
export async function handleNarratorGuideSelect(interaction, client) {
  const selectedValue = interaction.values[0];
  
  const guideEmbed = NarratorGuideCommand.getGuide(selectedValue);
  
  if (!guideEmbed) {
    await interaction.reply({
      content: 'Guide not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    embeds: [guideEmbed],
    flags: MessageFlags.Ephemeral,
  });
}

