import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import dotenv from 'dotenv';
import { commands } from './commands/index.js';
import * as TagRemovalHandler from './handlers/TagRemovalHandler.js';
import * as CharacterHandler from './handlers/CharacterHandler.js';
import * as RollHandler from './handlers/RollHandler.js';

// Load environment variables
dotenv.config();

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Role ID that can edit rolls (set via environment variable)
const ROLL_EDITOR_ROLE_ID = process.env.ROLL_EDITOR_ROLE_ID || null;
// Role name for error messages (optional, set via environment variable)
const ROLL_EDITOR_ROLE = process.env.ROLL_EDITOR_ROLE || 'editor role';

// Create a map of command names to command instances for quick lookup
const commandMap = new Map();
commands.forEach(command => {
  const commandData = command.getData();
  commandMap.set(commandData.name, command);
});

// When the client is ready, log in
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// Initialize tag removal selections and item type maps
client.tagRemovalSelections = new Map();
client.tagRemovalItemTypes = new Map();
// Initialize character creation state map
client.characterCreation = new Map();
// Initialize roll states map
client.rollStates = new Map();

// Handle slash command interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    // Handle autocomplete interactions
    const commandName = interaction.commandName;
    
    if (commandName === 'char-lookup') {
      await CharacterHandler.handleCharLookupAutocomplete(interaction);
    }
  } else if (interaction.isChatInputCommand()) {
    const command = commandMap.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing ${interaction.commandName}:`, error);
      const errorMessage = { content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  } else if (interaction.isButton()) {
    // Handle button interactions
    if (interaction.customId.startsWith('roll_submit_')) {
      await RollHandler.handleRollSubmit(interaction, client);
    } else if (interaction.customId.startsWith('roll_confirm_')) {
      await RollHandler.handleRollConfirm(interaction, client);
    } else if (interaction.customId.startsWith('roll_now_')) {
      await RollHandler.handleRollButton(interaction, client);
    } else if (interaction.customId.startsWith('roll_cancel_')) {
      await RollHandler.handleRollCancel(interaction, client);
    } else if (interaction.customId.startsWith('edit_character_')) {
      await CharacterHandler.handleEditCharacterButton(interaction, client);
    } else if (interaction.customId.startsWith('edit_backpack_')) {
      await CharacterHandler.handleEditBackpackButton(interaction, client);
    } else if (interaction.customId.startsWith('burn_refresh_')) {
      await CharacterHandler.handleBurnRefreshButton(interaction, client);
    } else if (interaction.customId.startsWith('retry_create_character_')) {
      await CharacterHandler.handleRetryCreateCharacter(interaction, client);
    } else {
      // Handle tag removal button
      await TagRemovalHandler.handleTagRemovalButton(interaction, client);
    }
  } else if (interaction.isStringSelectMenu()) {
    // Handle select menu interactions
    if (interaction.customId.startsWith('select_active_character_')) {
      await CharacterHandler.handleSelectActiveCharacter(interaction, client);
    } else if (interaction.customId.startsWith('burn_refresh_select_')) {
      await CharacterHandler.handleBurnRefreshSelect(interaction, client);
    } else if (interaction.customId.startsWith('roll_help_page_') || interaction.customId.startsWith('roll_hinder_page_')) {
      await RollHandler.handleRollPageSelect(interaction, client);
    } else if (interaction.customId.startsWith('roll_burn_')) {
      await RollHandler.handleRollBurn(interaction, client);
    } else if (interaction.customId.startsWith('roll_help_') || interaction.customId.startsWith('roll_hinder_')) {
      await RollHandler.handleRollSelect(interaction, client);
    } else {
      // Handle tag removal select menu
      await TagRemovalHandler.handleTagRemovalSelect(interaction, client);
    }
  } else if (interaction.isModalSubmit()) {
    // Handle modal submissions
    await CharacterHandler.handleModalSubmit(interaction, client);
  }
});

// Log in to Discord with client token
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN is not set in environment variables!');
  process.exit(1);
}

client.login(token);

