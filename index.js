import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import { commands } from './commands/index.js';
import * as TagRemovalHandler from './handlers/TagRemovalHandler.js';
import * as CharacterHandler from './handlers/CharacterHandler.js';
import * as CharacterCreateHandler from './handlers/CharacterCreateHandler.js';
import * as FellowshipHandler from './handlers/FellowshipHandler.js';
import * as RollHandler from './handlers/RollHandler.js';
import * as NarratorGuideHandler from './handlers/NarratorGuideHandler.js';
import { initializeEnvs } from './utils/ServerConfig.js';
import { WebhookServer } from './utils/WebhookServer.js';

// Load environment variables (base .env and all guild-specific .env.{guildId} files)
initializeEnvs();

// Initialize webhook server (optional - only if WEBHOOK_PORT and WEBHOOK_URL are set)
let webhookServer = null;
if (process.env.WEBHOOK_PORT && process.env.WEBHOOK_URL) {
  const webhookPort = parseInt(process.env.WEBHOOK_PORT, 10) || 3000;
  webhookServer = new WebhookServer(webhookPort, '/webhook/sheets');
  
  // Start webhook server
  webhookServer.start().catch(error => {
    console.error('❌ Failed to start webhook server:', error);
  });
}

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

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
    } else if (commandName === 'char-create') {
      await CharacterCreateHandler.handleCharacterCreateAutocomplete(interaction);
    } else if (commandName === 'fellowship-lookup') {
      await FellowshipHandler.handleFellowshipLookupAutocomplete(interaction);
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
    try {
      if (interaction.customId.startsWith('roll_submit_')) {
        await RollHandler.handleRollSubmit(interaction, client);
      } else if (interaction.customId.startsWith('roll_edit_justification_')) {
        await RollHandler.handleEditJustification(interaction, client);
      } else if (interaction.customId.startsWith('roll_help_action_cancel_') || interaction.customId.startsWith('roll_remove_help_action_cancel_') || interaction.customId.startsWith('roll_hinder_action_cancel_') || interaction.customId.startsWith('roll_remove_hinder_action_cancel_')) {
        await RollHandler.handleHelpActionCancel(interaction, client);
      } else if (interaction.customId.startsWith('roll_help_action_') && !interaction.customId.includes('_cancel_')) {
        await RollHandler.handleHelpAction(interaction, client);
      } else if (interaction.customId.startsWith('roll_remove_help_action_') && !interaction.customId.includes('_select_')) {
        await RollHandler.handleRemoveHelpAction(interaction, client);
      } else if (interaction.customId.startsWith('roll_hinder_action_') && !interaction.customId.includes('_cancel_')) {
        await RollHandler.handleHinderAction(interaction, client);
      } else if (interaction.customId.startsWith('roll_remove_hinder_action_') && !interaction.customId.includes('_select_')) {
        await RollHandler.handleRemoveHinderAction(interaction, client);
      } else if (interaction.customId.startsWith('roll_reconfirm_') && interaction.customId.includes('_cancel_')) {
        await RollHandler.handleRollReconfirmCancel(interaction, client);
      } else if (interaction.customId.startsWith('roll_reconfirm_')) {
        await RollHandler.handleRollReconfirm(interaction, client);
      } else if (interaction.customId.startsWith('roll_confirm_')) {
        await RollHandler.handleRollConfirm(interaction, client);
      } else if (interaction.customId.startsWith('roll_cancel_')) {
        await RollHandler.handleRollCancel(interaction, client);
      } else if (interaction.customId.startsWith('roll_might_button_')) {
        await RollHandler.handleMightButtonClick(interaction, client);
      } else if (interaction.customId.startsWith('edit_character_')) {
        await CharacterHandler.handleEditCharacterButton(interaction, client);
      } else if (interaction.customId.startsWith('edit_backpack_')) {
        await CharacterHandler.handleEditBackpackButton(interaction, client);
      } else if (interaction.customId.startsWith('edit_statuses_')) {
        await CharacterHandler.handleEditStatusesButton(interaction, client);
      } else if (interaction.customId.startsWith('statuses_')) {
        await CharacterHandler.handleStatusesEditor(interaction, client);
      } else if (interaction.customId.startsWith('burn_refresh_')) {
        await CharacterHandler.handleBurnRefreshButton(interaction, client);
      } else if (interaction.customId.startsWith('retry_create_character_')) {
        await CharacterHandler.handleRetryCreateCharacter(interaction, client);
      } else if (interaction.customId.startsWith('set_sheet_url_btn_')) {
        await CharacterHandler.handleSetSheetUrlButton(interaction, client);
      } else if (interaction.customId.startsWith('sync_to_sheet_')) {
        await CharacterHandler.handleSyncToSheetButton(interaction, client);
      } else if (interaction.customId.startsWith('sync_from_sheet_')) {
        await CharacterHandler.handleSyncFromSheetButton(interaction, client);
      } else if (interaction.customId.startsWith('toggle_auto_sync_')) {
        await CharacterHandler.handleToggleAutoSync(interaction, client);
      } else if (interaction.customId.startsWith('confirm_enable_auto_sync_')) {
        await CharacterHandler.handleConfirmEnableAutoSync(interaction, client);
      } else if (interaction.customId.startsWith('cancel_enable_auto_sync_')) {
        await CharacterHandler.handleCancelEnableAutoSync(interaction, client);
      } else if (interaction.customId.startsWith('delete_character_confirm_')) {
        await CharacterHandler.handleDeleteCharacterConfirm(interaction, client);
      } else if (interaction.customId.startsWith('delete_character_cancel_')) {
        await CharacterHandler.handleDeleteCharacterCancel(interaction, client);
      } else if (interaction.customId.startsWith('delete_character_')) {
        await CharacterHandler.handleDeleteCharacterButton(interaction, client);
      } else if (interaction.customId.startsWith('confirm_remove_tags_') || interaction.customId.startsWith('cancel_remove_tags_')) {
        await TagRemovalHandler.handleTagRemovalButton(interaction, client);
      }
    } catch (error) {
      console.error('Error handling button interaction:', error);
      console.error('Button customId:', interaction.customId);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing your button click.',
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.followUp({
          content: 'An error occurred while processing your button click.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  } else if (interaction.isStringSelectMenu()) {
    // Handle select menu interactions
    if (interaction.customId.startsWith('select_active_character_')) {
      await CharacterHandler.handleSelectActiveCharacter(interaction, client);
    } else if (interaction.customId.startsWith('burn_refresh_select_')) {
      await CharacterHandler.handleBurnRefreshSelect(interaction, client);
    } else if (interaction.customId.startsWith('statuses_remove_')) {
      await CharacterHandler.handleStatusesRemove(interaction, client);
    } else if (interaction.customId.startsWith('statuses_edit_select_')) {
      await CharacterHandler.handleStatusesEditSelect(interaction, client);
    } else if (interaction.customId.startsWith('narrator_guide_select_')) {
      await NarratorGuideHandler.handleNarratorGuideSelect(interaction, client);
    } else if (interaction.customId.startsWith('roll_help_character_')) {
      await RollHandler.handleHelpCharacterSelect(interaction, client);
    } else if (interaction.customId.startsWith('roll_help_tag_')) {
      await RollHandler.handleHelpTagSelect(interaction, client);
    } else if (interaction.customId.startsWith('roll_remove_help_action_select_')) {
      await RollHandler.handleRemoveHelpActionSelect(interaction, client);
    } else if (interaction.customId.startsWith('roll_hinder_character_')) {
      await RollHandler.handleHinderCharacterSelect(interaction, client);
    } else if (interaction.customId.startsWith('roll_hinder_tag_')) {
      await RollHandler.handleHinderTagSelect(interaction, client);
    } else if (interaction.customId.startsWith('roll_remove_hinder_action_select_')) {
      await RollHandler.handleRemoveHinderActionSelect(interaction, client);
    } else if (interaction.customId.startsWith('roll_might_modifier_')) {
      await RollHandler.handleMightModifierSelect(interaction, client);
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
    if (interaction.customId.startsWith('roll_justification_modal_')) {
      await RollHandler.handleJustificationModal(interaction, client);
    } else if (interaction.customId.startsWith('set_sheet_url_')) {
      await CharacterHandler.handleSetSheetUrlModal(interaction);
    } else {
      await CharacterHandler.handleModalSubmit(interaction, client);
    }
  }
});

// Log in to Discord with client token
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN is not set in environment variables!');
  process.exit(1);
}

client.login(token);

