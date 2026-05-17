import { AppError } from '../../shared/errors/index.js';
import type { AuthGuild, AuthSession } from './types.js';

export function getSessionGuild(session: AuthSession, guildId: string): AuthGuild {
  const guild = session.guilds.find((item) => item.id === guildId);
  if (!guild || !guild.canUseDashboard) {
    throw new AppError(
      'You do not have permission to access this server dashboard. Ask a server owner to add your role to dashboard access settings.',
      403
    );
  }
  return guild;
}
