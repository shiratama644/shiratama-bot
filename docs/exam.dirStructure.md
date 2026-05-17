# 現行ディレクトリ構成（2026-05-17時点）

このファイルは、`backend/src` と `web/src` の実装と一致する構成メモです。

## backend/src

backend/src/
├── index.ts
├── app.ts
├── api/
│   ├── index.ts
│   ├── middleware/
│   │   └── cors.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── giveaways.ts
│   │   ├── guilds.ts
│   │   └── settings.ts
│   ├── schemas/
│   │   ├── giveaway.ts
│   │   └── settings.ts
│   └── utils/
│       └── response.ts
├── db/
│   ├── client.ts
│   ├── entries.ts
│   ├── giveaways.ts
│   ├── guildSettings.ts
│   ├── index.ts
│   └── schema.ts
├── discord/
│   └── bot.ts
├── features/
│   ├── auth/
│   │   ├── constants.ts
│   │   ├── cookies.ts
│   │   ├── index.ts
│   │   ├── oauth.ts
│   │   ├── service.ts
│   │   ├── sessionStore.ts
│   │   └── types.ts
│   └── giveaway/
│       ├── index.ts
│       ├── embeds.ts
│       ├── permissions.ts
│       ├── service.ts
│       ├── commands/
│       │   ├── autocomplete.ts
│       │   ├── create.ts
│       │   ├── end.ts
│       │   ├── index.ts
│       │   ├── reroll.ts
│       │   ├── settings.ts
│       │   ├── start.ts
│       │   └── stop.ts
│       └── interactions/
│           ├── button.ts
│           ├── index.ts
│           └── modalSubmit.ts
└── shared/
    ├── constants/
    │   └── ids.ts
    ├── errors/
    │   └── index.ts
    ├── i18n/
    │   └── index.ts
    ├── logger/
    │   └── index.ts
    ├── types/
    │   └── common.ts
    └── utils/
        └── deadline.ts

## web/src

web/src/
├── app/
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── dashboard-app.tsx
└── lib/
    └── api.ts
