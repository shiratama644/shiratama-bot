import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  RESTPostAPIChatInputApplicationCommandsJSONBody
} from 'discord.js';

export interface Command {
  name: string;
  description: string;
  options?: RESTPostAPIChatInputApplicationCommandsJSONBody['options'];
  execute: (client: Client, interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

import { createCommand } from './create.js';
import { endCommand } from './end.js';
import { stopCommand } from './stop.js';
import { startCommand } from './start.js';
import { rerollCommand } from './reroll.js';
import { settingsCommand } from './settings.js';

export const commands: Command[] = [
  createCommand,
  endCommand,
  stopCommand,
  startCommand,
  rerollCommand,
  settingsCommand
];
