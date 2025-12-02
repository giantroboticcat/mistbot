import { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { Command } from './Command.js';
import { RollStorage } from '../utils/RollStorage.js';
import { RollView } from '../utils/RollView.js';
import { TagFormatter } from '../utils/TagFormatter.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';

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

    // Mark burned tags as burned in the character
    const burnedTags = roll.burnedTags || new Set();
    if (burnedTags.size > 0) {
      const character = CharacterStorage.getCharacter(roll.creatorId, roll.characterId);
      if (character) {
        const currentBurnedTags = new Set(character.burnedTags || []);
        // Add all burned tags from this roll to the character's burned tags
        for (const tagValue of burnedTags) {
          currentBurnedTags.add(tagValue);
        }
        CharacterStorage.updateCharacter(roll.creatorId, roll.characterId, {
          burnedTags: Array.from(currentBurnedTags),
        });
      }
    }

    // Roll 2d6
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const baseRoll = die1 + die2;

    // Calculate modifier using status values and burned tags
    const modifier = RollView.calculateModifier(roll.helpTags, roll.hinderTags, burnedTags);
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

    // Identify burned help tag names
    const burnedHelpTagNames = new Set();
    Array.from(roll.helpTags).forEach(tagValue => {
      if (burnedTags.has(tagValue)) {
        const parts = tagValue.split(':');
        const tagName = parts.length > 1 ? parts.slice(1).join(':') : tagValue;
        burnedHelpTagNames.add(tagName);
      }
    });

    // Format help items (tags, statuses) with fire emojis around burned tags
    let helpFormatted = 'None';
    if (helpCategorized.tags.length > 0 || helpCategorized.statuses.length > 0) {
      // Format tags with fire emojis for burned ones
      const formattedTags = helpCategorized.tags.map(tag => {
        const isBurned = burnedHelpTagNames.has(tag);
        const formatted = TagFormatter.formatStoryTag(tag);
        return isBurned ? `🔥 ${formatted} 🔥` : formatted;
      });
      
      // Format statuses (statuses can't be burned)
      const formattedStatuses = helpCategorized.statuses.map(status => 
        TagFormatter.formatStatus(status)
      );
      
      const parts = [];
      if (formattedTags.length > 0) {
        parts.push(formattedTags.join(', '));
      }
      if (formattedStatuses.length > 0) {
        parts.push(formattedStatuses.join(', '));
      }
      
      if (parts.length > 0) {
        helpFormatted = `\`\`\`ansi\n${parts.join(', ')}\n\`\`\``;
      }
    }

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
    let resultColor;
    if (finalResult >= 10) {
      resultType = 'Success';
      resultColor = 0x57F287; // Green
    } else if (finalResult >= 7) {
      resultType = 'Success & Consequences';
      resultColor = 0xFEE75C; // Yellow
    } else {
      resultType = 'Consequences';
      resultColor = 0xED4245; // Red
    }

    // Build Components V2 structure for roll result
    const container = new ContainerBuilder();
    
    // Add title text display directly to container
    container.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`## ${roll.description || 'Roll Result'}\n**Result: ${finalResult}** (${resultType})`)
    );
    
    // Add dice and power text display
    container.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`### 🎲 Dice\n${die1} + ${die2} = **${baseRoll}**\n\n### ⚡ Power\n**${modifierText}**`)
    );
    
    // Add help tags text display
    container.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`### 🟢 Help Tags\n${helpFormatted}`)
    );
    
    // Add hinder tags text display
    container.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`### 🔴 Hinder Tags\n${hinderFormatted}`)
    );

    // Add narrator mention to the container if they confirmed the roll
    if (roll.confirmedBy) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(`<@${roll.confirmedBy}>`)
      );
    }

    // Send as a public message
    await interaction.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

