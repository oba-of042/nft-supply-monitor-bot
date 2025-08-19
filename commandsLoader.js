// commandsLoader.js
// commandsLoader.js
import { REST, Routes } from 'discord.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { logInfo, logError } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function loadCommands(client) {
  const commandsPath = path.join(__dirname, 'commands');
  const files = (await fs.readdir(commandsPath)).filter(f => f.endsWith('.js'));
  const commands = [];

  client.commands = client.commands || new Map();

  for (const file of files) {
    const module = await import(`./commands/${file}`);
    const cmd = module.default || module;
    if (!cmd?.data || !cmd?.execute) {
      logInfo(`Skipping invalid command file ${file}`);
      continue;
    }
    client.commands.set(cmd.data.name, cmd);
    commands.push(cmd.data.toJSON());
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    logInfo(`Registering ${commands.length} commands...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    logInfo('Slash commands registered.');
  } catch (err) {
    logError('Failed to register commands:');
    console.error(err);
  }
}
