import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { RollStorage } from '../utils/RollStorage.js';
import RollStatus from '../constants/RollStatus.js';
import { RollView } from '../utils/RollView.js';
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

    if (roll.status !== RollStatus.CONFIRMED) {
      await interaction.reply({
        content: `Roll #${rollId} is not confirmed. Current status: ${roll.status}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Mark as executed
    RollStorage.updateRoll(rollId, { status: RollStatus.EXECUTED });

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

    // Format narrator mention if they confirmed the roll
    const narratorMention = roll.confirmedBy ? `<@${roll.confirmedBy}>` : null;

    // Format roll result using RollView
    const resultData = RollView.formatRollResult(
      die1,
      die2,
      baseRoll,
      modifier,
      finalResult,
      roll.helpTags,
      roll.hinderTags,
      burnedTags,
      roll.description,
      narratorMention
    );

    // Send as a public message
    await interaction.reply(resultData);
  }
}

