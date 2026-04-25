import { ChatInputCommandInteraction, Client } from 'discord.js';

export interface Command {
  name: string;
  description: string;
  options?: any[];
  execute: (client: Client, interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: any) => Promise<void>;
}

import { gcCommand } from './gc.js';
import { gendCommand } from './gend.js';
import { gstopCommand } from './gstop.js';
import { gstartCommand } from './gstart.js';
import { grerollCommand } from './greroll.js';
import { gsettingsCommand } from './gsettings.js';

export const commands: Command[] = [
  gcCommand,
  gendCommand,
  gstopCommand,
  gstartCommand,
  grerollCommand,
  gsettingsCommand
];
