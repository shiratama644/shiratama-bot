src/
├── app.ts                           # アプリ全体の起動・初期化
│
├── api/                             # HTTP API関連
│   ├── index.ts                     # APIアプリの入口
│   │
│   ├── routes/                      # APIルート定義
│   │   ├── auth.ts
│   │   ├── giveaways.ts
│   │   ├── guilds.ts
│   │   └── settings.ts
│   │
│   ├── middleware/                  # API共通middleware
│   │   ├── auth.ts
│   │   ├── cors.ts
│   │   └── errorHandler.ts
│   │
│   ├── schemas/                     # zod等の入力検証schema
│   │   ├── auth.ts
│   │   ├── giveaway.ts
│   │   └── settings.ts
│   │
│   ├── types/                       # API専用型定義
│   │   └── auth.ts
│   │
│   └── utils/                       # API用の軽量utility
│       └── response.ts
│
├── features/                        # 機能単位のメインロジック
│   ├── giveaway/                    # Giveaway機能
│   │   ├── commands/                # Slash Command実装
│   │   │   ├── start.ts
│   │   │   ├── stop.ts
│   │   │   ├── reroll.ts
│   │   │   ├── settings.ts
│   │   │   └── create.ts
│   │   │
│   │   ├── interactions/            # Button/Modal interaction
│   │   │   ├── button.ts
│   │   │   └── modalSubmit.ts
│   │   │
│   │   ├── service.ts               # Business logic
│   │   ├── repository.ts            # DBアクセス
│   │   ├── embeds.ts                # Discord Embed生成
│   │   ├── scheduler.ts             # 時間・繰り返し処理
│   │   ├── permissions.ts           # 権限判定
│   │   ├── validators.ts            # feature内部検証
│   │   ├── constants.ts             # feature定数
│   │   ├── types.ts                 # feature専用型
│   │   └── index.ts                 # feature公開API
│   │
│   ├── guild-settings/              # Guild設定機能
│   │   ├── service.ts
│   │   ├── repository.ts
│   │   ├── validators.ts
│   │   ├── constants.ts
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   └── auth/                        # 認証・セッション管理
│       ├── service.ts
│       ├── oauth.ts
│       ├── sessionStore.ts
│       ├── cookies.ts
│       ├── constants.ts
│       ├── types.ts
│       └── index.ts
│
├── discord/                         # Discord.js adapter層
│   ├── bot.ts                       # Discord Client初期化
│   ├── commands.ts                  # Command登録・収集
│   ├── interactions.ts              # Interaction dispatcher
│   ├── permissions.ts               # Discord共通権限処理
│   ├── transforms.ts                # Discord DTO変換
│   │
│   ├── events/                      # Discord Event handler
│   │   ├── ready.ts
│   │   ├── interactionCreate.ts
│   │   └── guildCreate.ts
│   │
│   └── utils/                       # Discord専用utility
│       ├── channels.ts
│       ├── members.ts
│       └── messages.ts
│
├── db/                              # Database infrastructure
│   ├── client.ts                    # DB client生成
│   ├── schema.ts                    # DB schema/type
│   ├── migrations/                  # Migrationファイル
│   ├── seeds/                       # Seedデータ
│   └── types.ts                     # DB関連型
│
├── shared/                          # feature非依存の共有コード
│   ├── errors/                      # エラーシステム
│   │   ├── AppError.ts
│   │   ├── codes.ts
│   │   ├── helpers.ts
│   │   └── index.ts
│   │
│   ├── logger/                      # ログシステム
│   │   ├── index.ts
│   │   └── formats.ts
│   │
│   ├── i18n/                        # 国際化
│   │   ├── index.ts
│   │   ├── en.ts
│   │   ├── ja.ts
│   │   └── types.ts
│   │
│   ├── constants/                   # グローバル定数
│   │   ├── ids.ts
│   │   └── env.ts
│   │
│   ├── types/                       # グローバル共通型
│   │   ├── common.ts
│   │   └── api.ts
│   │
│   └── utils/                       # 汎用pure utility
│       ├── array.ts
│       ├── async.ts
│       ├── date.ts
│       ├── object.ts
│       ├── random.ts
│       ├── string.ts
│       └── validation.ts
│
└── config/                          # アプリ設定・環境変数
    ├── env.ts
    ├── app.ts
    └── constants.ts