import { REST, Routes } from 'discord.js';
import { initializeEnvs } from './utils/ServerConfig.js';
import { commands } from './commands/index.js';

// Load environment variables (base .env and all guild-specific .env.{guildId} files)
initializeEnvs();

// Get guild ID from command line argument or environment variable
// Usage: node deploy-commands.js <guildId>
const guildIdArg = process.argv[2];
const guildId = guildIdArg || process.env.GUILD_ID;

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token) {
  console.error('DISCORD_TOKEN is not set in environment variables!');
  process.exit(1);
}

if (!clientId) {
  console.error('CLIENT_ID is not set in environment variables!');
  process.exit(1);
}

// Convert command classes to JSON format for deployment
const commandsData = commands.map(command => command.getData().toJSON());

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// Deploy commands
(async () => {
  try {
    console.log(`Started refreshing ${commandsData.length} application (/) commands.`);

    let data;

    if (guildId) {
      // Deploy to a specific guild (faster for testing - updates immediately)
      console.log(`Deploying to guild: ${guildId}`);
      data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandsData },
      );
      console.log(`Successfully reloaded ${data.length} application (/) commands in the guild.`);
    } else {
      // Deploy globally (can take up to an hour to propagate)
      console.log('Deploying globally...');
      console.log('Note: To deploy to a specific guild, pass the guild ID as an argument:');
      console.log('  node deploy-commands.js <guildId>');
      data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandsData },
      );
      console.log(`Successfully reloaded ${data.length} application (/) commands globally.`);
      console.log('Note: Global commands may take up to an hour to propagate.');
    }
  } catch (error) {
    console.error('Error deploying commands:', error);
    process.exit(1);
  }
})();

