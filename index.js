// index.js
import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { monitorTasks } from './monitors/monitorTasks.js';
import { logInfo, logError } from './utils/logger.js';
import { startWalletTracker } from './utils/walletTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimal intents for slash commands + channel visibility
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// Load command modules safely
let commandFiles = [];
try {
  commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
} catch {
  logError(`Commands folder not found at ${commandsPath}`);
}

for (const file of commandFiles) {
  const commandPath = `./commands/${file}`;
  try {
    const commandModule = await import(commandPath);
    if (!commandModule.data || !commandModule.execute) {
      logError(`❌ Command "${file}" is missing required "data" or "execute" export`);
      continue;
    }
    client.commands.set(commandModule.data.name, commandModule);
    commands.push(commandModule.data.toJSON());
    logInfo(`✅ Loaded command: ${commandModule.data.name}`);
  } catch (err) {
    logError(`Failed to load command file "${file}": ${err.message}`);
  }
}

client.once('ready', () => {
  logInfo(`✅ Logged in as ${client.user.tag}`);

  // Start periodic jobs safely
  try { monitorTasks(client); } catch (e) { logError(`monitorTasks failed: ${e.message}`); }
  try { startWalletTracker(client); } catch (e) { logError(`walletTracker failed: ${e.message}`); }
});

// Register slash commands (guild-scoped)
(async () => {
  try {
    logInfo(`📌 Registering ${commands.length} slash commands...`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    logInfo(`✅ Slash commands registered successfully`);
  } catch (error) {
    logError(`Failed to register commands: ${error}`);
  }
})();

// Public command handling
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    logError(`Error executing command "${interaction.commandName}": ${error}`);
    // Reply publicly if possible; otherwise fallback once
    try {
      await interaction.reply({ content: '❌ Error executing command.', flags: 0 }); // public
    } catch {
      try { await interaction.reply({ content: '❌ Error executing command.', ephemeral: true }); } catch {}
    }
  }
});

// Harden process so it won’t die on async errors
process.on('unhandledRejection', (reason) => logError(`Unhandled Rejection: ${reason}`));
process.on('uncaughtException', (err) => logError(`Uncaught Exception: ${err?.stack || err}`));

client.login(process.env.DISCORD_TOKEN);
