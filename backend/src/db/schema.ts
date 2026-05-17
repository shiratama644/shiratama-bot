import type { ColumnType } from 'kysely';
import type { Giveaway } from '../shared/types/common.js';

export interface GuildSettingsTable {
  guild_id: string;
  manager_role_ids: ColumnType<string[], string[] | undefined, string[]>;
  giveaway_creator_role_ids: ColumnType<string[], string[] | undefined, string[]>;
  dashboard_view_role_ids: ColumnType<string[], string[] | undefined, string[]>;
  language: ColumnType<string, string | undefined, string>;
  giveaway_channel_ids: ColumnType<string[], string[] | undefined, string[]>;
  default_claim_deadline: ColumnType<string | null, string | null | undefined, string | null>;
}

export interface GiveawaysTable {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: ColumnType<string | null, string | null | undefined, string | null>;
  title: string;
  description: ColumnType<string | null, string | null | undefined, string | null>;
  end_at: Date;
  winner_count: number;
  status: ColumnType<Giveaway['status'], Giveaway['status'] | undefined, Giveaway['status']>;
  created_by: string;
  created_at: ColumnType<Date, Date | undefined, Date>;
  interval: ColumnType<string | null, string | null | undefined, string | null>;
  auto_repeat: ColumnType<boolean, boolean | undefined, boolean>;
  claim_deadline: ColumnType<string | null, string | null | undefined, string | null>;
  winners: ColumnType<string[], string[] | undefined, string[]>;
}

export interface GiveawayEntriesTable {
  giveaway_id: string;
  user_id: string;
  joined_at: ColumnType<Date, Date | undefined, Date>;
}

export interface AuditLogsTable {
  id: string;
  guild_id: ColumnType<string | null, string | null | undefined, string | null>;
  actor_id: ColumnType<string | null, string | null | undefined, string | null>;
  action: string;
  target_type: ColumnType<string | null, string | null | undefined, string | null>;
  target_id: ColumnType<string | null, string | null | undefined, string | null>;
  detail: ColumnType<string | null, string | null | undefined, string | null>;
  created_at: ColumnType<Date, Date | undefined, Date>;
}

export interface IdempotencyKeysTable {
  key: string;
  actor_id: string;
  guild_id: string;
  giveaway_id: ColumnType<string | null, string | null | undefined, string | null>;
  created_at: ColumnType<Date, Date | undefined, Date>;
}

export interface AuthSessionsTable {
  token: string;
  session_json: string;
  expires_at: ColumnType<Date, Date, Date>;
  created_at: ColumnType<Date, Date | undefined, Date>;
}

export interface OauthStatesTable {
  state: string;
  expires_at: ColumnType<Date, Date, Date>;
  created_at: ColumnType<Date, Date | undefined, Date>;
}

export interface Database {
  guild_settings: GuildSettingsTable;
  giveaways: GiveawaysTable;
  giveaway_entries: GiveawayEntriesTable;
  audit_logs: AuditLogsTable;
  idempotency_keys: IdempotencyKeysTable;
  auth_sessions: AuthSessionsTable;
  oauth_states: OauthStatesTable;
}
