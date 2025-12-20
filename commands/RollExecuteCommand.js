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

    // Process burned tags - delete backpack/storyTags, mark others as burned
    const burnedTags = roll.burnedTags || [];
    if (burnedTags.size > 0) {
      const character = CharacterStorage.getCharacter(roll.creatorId, roll.characterId);
      if (character) {
        const backpackToRemove = [];
        const storyTagsToRemove = [];
        const tagsToBurn = [];
        
        // Separate burned tags by type
        for (const tagValue of burnedTags) {
          if (tagValue.startsWith('backpack:')) {
            // Extract backpack item name (remove prefix)
            const itemName = tagValue.replace('backpack:', '');
            backpackToRemove.push(itemName);
          } else if (tagValue.startsWith('story:')) {
            // Extract story tag name (remove prefix)
            const tagName = tagValue.replace('story:', '');
            storyTagsToRemove.push(tagName);
          } else {
            // Other tags (themes, theme tags) get marked as burned
            tagsToBurn.push(tagValue);
          }
        }
        
        // Build update object
        const updates = {};
        
        // Remove backpack items that were burned
        if (backpackToRemove.length > 0) {
          const updatedBackpack = (character.backpack || []).filter(item => !backpackToRemove.includes(item));
          updates.backpack = updatedBackpack;
        }
        
        // Remove story tags that were burned
        if (storyTagsToRemove.length > 0) {
          const updatedStoryTags = (character.storyTags || []).filter(tag => !storyTagsToRemove.includes(tag));
          updates.storyTags = updatedStoryTags;
        }
        
        // Mark themes/tags as burned (only for non-backpack/non-storyTag items)
        if (tagsToBurn.length > 0) {
          CharacterStorage.markTagsAsBurned(roll.creatorId, roll.characterId, tagsToBurn);
        }
        
        // Apply all updates (backpack and storyTags)
        if (Object.keys(updates).length > 0) {
          CharacterStorage.updateCharacter(roll.creatorId, roll.characterId, updates);
        }
      }
    }

    // Roll 2d6
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const baseRoll = die1 + die2;

    // Calculate modifier using status values and burned tags
    const modifier = RollView.calculateModifier(roll.helpTags, roll.hinderTags, new Set(burnedTags));
    const finalResult = baseRoll + modifier;

    // Format narrator mention if they confirmed the roll
    const narratorMention = roll.confirmedBy ? `<@${roll.confirmedBy}>` : null;

    // Check if this is a reaction roll
    const isReaction = roll.isReaction === true;
    
    // Format roll result using RollView
    const resultData = RollView.formatRollResult(
      die1,
      die2,
      baseRoll,
      modifier,
      finalResult,
      roll.description,
      narratorMention,
      isReaction,
      roll.reactionToRollId
    );

    // Send as a public message
    await interaction.reply(resultData);
  }
}

