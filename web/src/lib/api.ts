import { hc } from 'hono/client';

export type GuildSummary = { id: string; name: string; iconUrl: string | null };
export type RoleSummary = { id: string; name: string };
export type ChannelSummary = { id: string; name: string };
export type MemberSummary = { id: string; name: string; avatarUrl: string };

export type GuildOptions = {
  guild: GuildSummary;
  roles: RoleSummary[];
  channels: ChannelSummary[];
  members: MemberSummary[];
};

export type GuildSettings = {
  guildId: string;
  managerRoleIds: string[];
  language: string;
  giveawayChannelIds: string[];
  defaultClaimDeadline: string | null;
};

export type Giveaway = {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  title: string;
  description: string | null;
  endAt: string;
  winnerCount: number;
  status: 'active' | 'ended' | 'stopped';
  createdBy: string;
  createdAt: string;
  interval: string | null;
  autoRepeat: boolean;
  claimDeadline: string | null;
  winners: string[];
};

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
const adminToken = process.env.NEXT_PUBLIC_ADMIN_API_TOKEN;

type RpcClient = {
  api: {
    guilds: {
      $get: (
        args?: Record<string, never>,
        options?: { headers?: Record<string, string> }
      ) => Promise<Response>;
      ':guildId': {
        options: {
          $get: (
            args: { param: { guildId: string } },
            options?: { headers?: Record<string, string> }
          ) => Promise<Response>;
        };
      };
    };
    settings: {
      ':guildId': {
        $get: (args: { param: { guildId: string } }) => Promise<Response>;
        $put: (
          args: {
            param: { guildId: string };
            json: {
              language: 'en' | 'ja';
              managerRoleIds: string[];
              giveawayChannelIds: string[];
              defaultClaimDeadline: string | null;
            };
          },
          options?: { headers?: Record<string, string> }
        ) => Promise<Response>;
      };
    };
    giveaways: {
      $post: (
        args: {
          json: {
            guildId: string;
            channelId: string;
            title: string;
            description?: string;
            deadline: string;
            winnerCount: number;
          };
        },
        options?: { headers?: Record<string, string> }
      ) => Promise<Response>;
      ':guildId': {
        $get: (args: { param: { guildId: string } }) => Promise<Response>;
      };
      ':id': {
        end: {
          $post: (
            args: { param: { id: string }; json: { guildId: string } },
            options?: { headers?: Record<string, string> }
          ) => Promise<Response>;
        };
        reroll: {
          $post: (
            args: { param: { id: string }; json: { guildId: string } },
            options?: { headers?: Record<string, string> }
          ) => Promise<Response>;
        };
      };
    };
  };
};

const client = hc(baseUrl) as unknown as RpcClient;

function getAdminHeaders(extra: Record<string, string> = {}) {
  return {
    ...(adminToken ? { 'x-admin-token': adminToken } : {}),
    ...extra
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'API request failed');
  }
  return data as T;
}

export async function fetchGuilds() {
  const response = await client.api.guilds.$get({}, { headers: getAdminHeaders() });
  const payload = await parseResponse<{ guilds: GuildSummary[] }>(response);
  return payload.guilds;
}

export async function fetchGuildOptions(guildId: string) {
  const response = await client.api.guilds[':guildId'].options.$get(
    { param: { guildId } },
    { headers: getAdminHeaders() }
  );
  return parseResponse<GuildOptions>(response);
}

export async function fetchSettings(guildId: string) {
  const response = await client.api.settings[':guildId'].$get({ param: { guildId } });
  const payload = await parseResponse<{ settings: GuildSettings }>(response);
  return payload.settings;
}

export async function updateSettings(
  guildId: string,
  input: {
    language: 'en' | 'ja';
    managerRoleIds: string[];
    giveawayChannelIds: string[];
    defaultClaimDeadline: string | null;
  }
) {
  const response = await client.api.settings[':guildId'].$put(
    {
      param: { guildId },
      json: input
    },
    { headers: getAdminHeaders() }
  );
  return parseResponse<{ ok: boolean }>(response);
}

export async function fetchGiveaways(guildId: string) {
  const response = await client.api.giveaways[':guildId'].$get({ param: { guildId } });
  const payload = await parseResponse<{ giveaways: Giveaway[] }>(response);
  return payload.giveaways;
}

export async function createGiveaway(input: {
  guildId: string;
  channelId: string;
  title: string;
  description?: string;
  deadline: string;
  winnerCount: number;
  userId: string;
}) {
  const response = await client.api.giveaways.$post(
    {
      json: {
        guildId: input.guildId,
        channelId: input.channelId,
        title: input.title,
        description: input.description,
        deadline: input.deadline,
        winnerCount: input.winnerCount
      }
    },
    { headers: getAdminHeaders({ 'x-user-id': input.userId }) }
  );
  return parseResponse<{ giveaway: Giveaway }>(response);
}

export async function endGiveaway(giveawayId: string, guildId: string) {
  const response = await client.api.giveaways[':id'].end.$post(
    {
      param: { id: giveawayId },
      json: { guildId }
    },
    { headers: getAdminHeaders() }
  );
  return parseResponse<{ ok: boolean }>(response);
}

export async function rerollGiveaway(giveawayId: string, guildId: string) {
  const response = await client.api.giveaways[':id'].reroll.$post(
    {
      param: { id: giveawayId },
      json: { guildId }
    },
    { headers: getAdminHeaders() }
  );
  return parseResponse<{ winners: string[] }>(response);
}
