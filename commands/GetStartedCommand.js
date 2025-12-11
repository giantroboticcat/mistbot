import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from './Command.js';

/**
 * Get Started command - provides onboarding instructions for new users
 */
export class GetStartedCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('get-started')
      .setDescription('Learn how to get started with the bot and do your first roll');
  }

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🚀 Getting Started with MistBot')
      .setDescription('Welcome! Follow these steps to create your character and do your first roll.')
      .setColor(0x5865F2);

    // Step 1: Create a Character
    embed.addFields({
      name: '📝 Step 1: Import Your Character',
      value:
        '1. Use `/char-create` and provide a Google Sheet URL\n' +
        '2. The bot will do the heavy lifting and import your character data (name, themes, tags, etc.)\n' +
        '💡 **Tip:** You can have up to 3 characters. Use `/char-select` to switch between them.',
      inline: false,
    });

    // Step 2: Understanding Your Character
    embed.addFields({
      name: '👤 Step 2: View & Edit Your Character',
      value:
        '• Use `/char-edit` to view your active character\n' +
        '• From here you can:\n' +
        '  - Edit your character name and themes\n' +
        '  - Manage backpack items and story tags\n' +
        '  - Edit statuses and power levels\n' +
        '  - Burn/refresh tags (tags marked 🔥 are burned)\n' +
        '  - Sync with Google Sheets if linked\n' +
        '💡 **Tip:** Google sync works both ways. So edit your character in whatever way you find most convenient, just remember to sync after your edits.',
      inline: false,
    });

    // Step 3: Your First Roll
    embed.addFields({
      name: '🎲 Step 3: Do Your First Roll',
      value:
        '**Proposing a Roll:**\n' +
        '1. Use `/roll-propose` in a channel\n' +
        '2. Provide a short description of what you\'re trying to do\n' +
        '3. Add a narration link to the RP that describes your attempt. (Discord message link)\n' +
        '   *To get a message link: Right-click (or long-press on mobile) the message → "Copy Message Link"*\n' +
        '4. Select **Help Tags** - tags that give positive modifiers to your roll\n' +
        '5. Select **Hinder Tags** - tags that give negative modifiers to your roll\n' +
        '6. (Optional) Choose a tag to **Burn** (marked with 🔥) for extra power\n' +
        '7. (Optional) Add justification notes explaining your tag choices for the narrator to read\n' +
        '8. Submit your roll proposal by clicking the "Submit" button\n\n' +
        '**After Proposing:**\n' +
        '• A narrator will review your proposal using `/roll-confirm`\n' +
        '• Once your proposal is confirmed, use `/roll-execute` to roll the dice\n' +
        '• The bot will calculate your modifier and roll the dice',
      inline: false,
    });

    // Quick Tips
    embed.addFields({
      name: '💡 Quick Tips',
      value:
        '• **Rolls Can Use Scene Tags:** Make sure you roll in an ooc-channel tracking the scene you are rolling for in order to use scene tags.\n' +
        '• **Multiple Characters:** Use `/char-select` to switch between characters if you have more than one\n' +
        '• **Character Lookup:** Use `/char-lookup` to view any character by name\n' +
        '• **Ready to learn more?** Use `/commands` to see all available commands. Use `/narrator-guide` to learn more about how to use the bot as a narrator.',
      inline: false,
    });

    embed.setFooter({ 
      text: 'Ready to start? Use /char-create to create your first character!' 
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

