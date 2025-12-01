import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { RollStorage } from '../utils/RollStorage.js';
import { RollView } from '../utils/RollView.js';
import { TagFormatter } from '../utils/TagFormatter.js';

/**
 * Execute a confirmed roll
 */
export class RollExecuteCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('roll')
      .setDescription('Execute a confirmed roll')
      .addIntegerOption(option =>
        option
          .setName('id')
          .setDescription('The roll ID to execute')
          .setRequired(true));
  }

  async execute(interaction) {
    const rollId = interaction.options.getInteger('id', true);
    const userId = interaction.user.id;
    
    // Get the roll
    const roll = RollStorage.getRoll(rollId);
    if (!roll) {
      await interaction.reply({
        content: `Roll #${rollId} not found.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if user is the creator
    if (roll.creatorId !== userId) {
      await interaction.reply({
        content: `Only the creator of roll #${rollId} can execute it.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (roll.status !== 'confirmed') {
      await interaction.reply({
        content: `Roll #${rollId} is not confirmed. Current status: ${roll.status}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Mark as executed
    RollStorage.updateRoll(rollId, { status: 'executed' });

    // Roll 2d6
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const baseRoll = die1 + die2;

    // Calculate modifier using status values
    const modifier = RollView.calculateModifier(roll.helpTags, roll.hinderTags);
    const finalResult = baseRoll + modifier;

    // Parse help tags (extract actual names)
    const helpItemNames = Array.from(roll.helpTags).map(value => {
      const parts = value.split(':');
      return parts.length > 1 ? parts.slice(1).join(':') : value;
    });

    // Parse hinder tags (extract actual names, separate weaknesses)
    const hinderItemNames = [];
    const hinderWeaknesses = [];
    
    Array.from(roll.hinderTags).forEach(value => {
      const parts = value.split(':');
      const name = parts.length > 1 ? parts.slice(1).join(':') : value;
      
      if (value.startsWith('weakness:')) {
        hinderWeaknesses.push(name);
      } else {
        hinderItemNames.push(name);
      }
    });

    // Categorize help items
    const helpCategorized = RollView.categorizeItems(helpItemNames);
    
    // Categorize hinder items
    const hinderCategorized = RollView.categorizeItems(hinderItemNames);

    // Format help items (tags, statuses)
    const helpFormatted = (helpCategorized.tags.length > 0 || 
                          helpCategorized.statuses.length > 0)
      ? TagFormatter.formatSceneStatusInCodeBlock(
          helpCategorized.tags,
          helpCategorized.statuses,
          [] // No limits
        )
      : 'None';
    
    // Format hinder items (tags, statuses, plus weaknesses)
    const hinderParts = [];
    if (hinderCategorized.tags.length > 0) {
      hinderParts.push(TagFormatter.formatStoryTags(hinderCategorized.tags));
    }
    if (hinderCategorized.statuses.length > 0) {
      hinderParts.push(TagFormatter.formatStatuses(hinderCategorized.statuses));
    }
    if (hinderWeaknesses.length > 0) {
      hinderParts.push(TagFormatter.formatWeaknesses(hinderWeaknesses));
    }
    
    const hinderFormatted = hinderParts.length > 0
      ? `\`\`\`ansi\n${hinderParts.join(', ')}\n\`\`\``
      : 'None';

    const modifierText = modifier >= 0 ? `+${modifier}` : `${modifier}`;

    // Determine result classification
    let resultType;
    if (finalResult >= 10) {
      resultType = 'Success';
    } else if (finalResult >= 7) {
      resultType = 'Success & Consequences';
    } else {
      resultType = 'Consequences';
    }

    let content = `**Roll Result: ${finalResult}** (${resultType})\n\n`;
    if (roll.description) {
      content += `**${roll.description}**\n\n`;
    }
    content += `**Dice:** ${die1} + ${die2} = ${baseRoll}\n` +
      `**Power:** ${modifierText}\n` +
      `**Help Tags:**\n${helpFormatted}\n` +
      `**Hinder Tags:**\n${hinderFormatted}`;

    // Ping the narrator who confirmed the roll
    let narratorMention = '';
    if (roll.confirmedBy) {
      narratorMention = `<@${roll.confirmedBy}> `;
    }

    // Send as a public message
    await interaction.reply({
      content: `${narratorMention}${content}`,
    });
  }
}

