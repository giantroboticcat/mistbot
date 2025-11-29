# MistBot - Discord Bot

A Discord bot built with discord.js.

## Setup

1. Install dependencies:
   ```bash
   npm i
   ```

2. Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   ```

3. Add your Discord bot credentials to the `.env` file:
   ```
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_application_id_here
   GUILD_ID=your_test_server_id_here
   ```

   To get these values:
   - Go to https://discord.com/developers/applications
   - Create a new application
   - **CLIENT_ID**: Found in "General Information" > Application ID
   - Go to the "Bot" section
   - **DISCORD_TOKEN**: Create a bot and copy the token
   - **GUILD_ID**: First enable Developer Mode in User Settings, then right-click your test server > "Copy ID"

4. Invite your bot to your server with the following permissions:
   - Send Messages
   - Read Message History
   - View Channels

## Deploying Commands

Before running the bot, you need to deploy slash commands to Discord:

- **Deploy to a test server** (recommended for development):
  ```bash
  npm run deploy
  ```
  Requires `GUILD_ID` in your `.env` file.

- **Deploy globally** (for production - affects all servers):
  ```bash
  npm run deploy:global
  ```
  This will deploy to all servers your bot is in.

**Note**: Only necessary to deploy commands when you change command apis (name, description, options). You can modify command logic without redeploying.

## Running

- Start the bot:
  ```bash
  npm start
  ```

- Run in development mode (with auto-restart):
  ```bash
  npm run dev
  ```

## Linting

- Check for linting errors:
  ```bash
  npm run lint
  ```

- Fix linting errors automatically:
  ```bash
  npm run lint:fix
  ```

## Requirements

- Node.js 18.0.0 or higher

