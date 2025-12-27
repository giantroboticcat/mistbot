import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { RollStorage } from '../utils/RollStorage.js';
import RollStatus from '../constants/RollStatus.js';
import { RollView } from '../utils/RollView.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { requireGuildId } from '../utils/GuildUtils.js';

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
          .setRequired(true))
      .addStringOption(option =>
        option
          .setName('strategy')
          .setDescription('Optional: Throw caution to the wind or Hedge your risks')
          .setRequired(true)
          .addChoices(
            { name: 'None (No modifier)', value: 'none' },
            { name: 'Throw caution to the wind (Power +1, Roll -1)', value: 'throw_caution' },
            { name: 'Hedge your risks (Power -1, Roll +1)', value: 'hedge_risks' }
          ));
  }

  async execute(interaction) {
    const guildId = requireGuildId(interaction);
    const rollId = interaction.options.getInteger('id', true);
    const strategy = interaction.options.getString('strategy');
    const userId = interaction.user.id;
    
    // Get the roll
    const roll = RollStorage.getRoll(guildId, rollId);
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

    // Validate strategy before making any changes
    // Calculate base modifier to check strategy conditions
    const burnedTags = roll.burnedTags || new Set();
    const baseModifier = RollView.calculateModifier(roll.helpTags, roll.hinderTags, burnedTags, guildId);
    
    let strategyModifier = 0;
    let strategyName = null;
    let originalPower = baseModifier;
    let strategyError = null;
    
    if (strategy === 'throw_caution') {
      if (baseModifier > 2) {
        strategyError = `Cannot use "Throw caution to the wind" - your Power is ${baseModifier}, but it requires Power ≤ 2.`;
      } else {
        strategyModifier = -1; // Reduce Power by 1
        strategyName = 'Throw caution to the wind';
      }
    } else if (strategy === 'hedge_risks') {
      if (baseModifier < 2) {
        strategyError = `Cannot use "Hedge your risks" - your Power is ${baseModifier}, but it requires Power ≥ 2.`;
      } else {
        strategyModifier = +1; // Add 1 to Power
        strategyName = 'Hedge your risks';
      }
    }
    
    // If strategy was invalid, return error
    if (strategyError) {
      await interaction.reply({
        content: `❌ ${strategyError}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Mark as executed
    RollStorage.updateRoll(guildId, rollId, { status: RollStatus.EXECUTED });

    // Process burned tags - delete backpack/storyTags, mark others as burned
    if (burnedTags.size > 0) {
      const character = CharacterStorage.getCharacter(guildId, roll.creatorId, roll.characterId);
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
          CharacterStorage.markTagsAsBurned(guildId, roll.creatorId, roll.characterId, tagsToBurn);
        }
        
        // Apply all updates (backpack and storyTags)
        if (Object.keys(updates).length > 0) {
          CharacterStorage.updateCharacter(guildId, roll.creatorId, roll.characterId, updates);
        }
      }
    }

    // Roll 2d6
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const baseRoll = die1 + die2;
    
    // Apply strategy modifier to the roll result
    const finalResult = baseRoll + baseModifier + strategyModifier;

    // Format narrator mention if they confirmed the roll
    const narratorMention = roll.confirmedBy ? `<@${roll.confirmedBy}>` : null;

    // Check if this is a reaction roll and determine if roll is successful (for power modifications)
    // For reaction rolls: 10+ is success, for regular rolls: 10+ is success (or 7-9 is partial)
    const isReactionRoll = roll.isReaction === true;
    let isSuccessful = false;
    if (die1 === 6 && die2 === 6) {
      isSuccessful = true;
    } 
    else if (die1 === 1 && die2 === 1) {
      isSuccessful = false;
    }
    else if (isReactionRoll) {
      isSuccessful = finalResult >= 10;
    } else {
      // Regular roll: 10+ is full success, 7-9 is partial (we'll count both as "successful" for power changes)
      isSuccessful = finalResult >= 7;
    }
    
    // Calculate spending power based on strategy and success
    // Throw caution to the wind: if successful, can spend original Power + 1
    // Hedge your risks: if successful, spend original Power - 1
    let spendingPower = null;
    if (isSuccessful) {
      if (strategy === 'throw_caution') {
        spendingPower = Math.max(originalPower, 1) + 1; // Can spend original Power + 1
      } else if (strategy === 'hedge_risks') {
        spendingPower = Math.max(originalPower, 1) - 1; // Spend original Power - 1
      } else {
        spendingPower = Math.max(originalPower, 1);
      }
    }
    
    // Format roll result using RollView
    const resultData = RollView.formatRollResult(
      die1,
      die2,
      baseRoll,
      baseModifier,
      finalResult,
      roll.description,
      narratorMention,
      isReactionRoll,
      roll.reactionToRollId,
      strategyName,
      strategyModifier,
      originalPower,
      spendingPower
    );

    // Send as a public message
    await interaction.reply(resultData);
  }
}

