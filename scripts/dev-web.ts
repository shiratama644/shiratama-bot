import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform, arch } from 'node:os';

/**
 * UIフィードバック用のカラー定数
 */
const COLORS = {
  RESET: '\x1b[0m',
  SUCCESS: '\x1b[32m', // 緑
  WARNING: '\x1b[33m', // 黄色
  INFO: '\x1b[36m',    // シアン
  DIM: '\x1b[90m',     // グレー
} as const;

/**
 * 環境チェックの結果型定義
 */
interface CompatibilityResult {
  canUseTurbo: boolean;
  reason?: string;
}

/**
 * 現在の実行環境が Turbo Pack と互換性があるか判定します。
 * Termux (Android) や非サポートのOS/アーキテクチャを検知します。
 */
function checkTurboCompatibility(): CompatibilityResult {
  // 1. Termux の判定 (Android Linux)
  // Termux は Bionic libc を使用しており、標準的な Rust バイナリと互換性がありません。
  const isTermux = 
    !!process.env.TERMUX_VERSION || 
    process.env.PREFIX?.includes('com.termux') || 
    existsSync('/data/data/com.termux');

  if (isTermux) {
    return { canUseTurbo: false, reason: 'Termux environment (Bionic libc incompatibility)' };
  }

  // 2. サポート対象 OS の判定
  const supportedPlatforms = ['win32', 'darwin', 'linux'];
  if (!supportedPlatforms.includes(platform())) {
    return { canUseTurbo: false, reason: `Unsupported OS: ${platform()}` };
  }

  // 3. サポート対象アーキテクチャの判定
  const supportedArches = ['x64', 'arm64'];
  if (!supportedArches.includes(arch())) {
    return { canUseTurbo: false, reason: `Unsupported Architecture: ${arch()}` };
  }

  return { canUseTurbo: true };
}

/**
 * 開発サーバーの起動メインロジック
 */
async function launchDevServer() {
  const { canUseTurbo, reason } = checkTurboCompatibility();
  
  // 基本コマンド: pnpm --filter web exec next dev
  // ポート 3000 の競合を避けるため、フロントエンドは明示的に 3001 を使用します
  const command = 'pnpm';
  const args = ['--filter', 'web', 'exec', 'next', 'dev', '-p', '3001'];

  if (canUseTurbo) {
    args.push('--turbo');
    console.log(`${COLORS.SUCCESS}⚡ Turbo Pack enabled${COLORS.RESET}`);
  } else {
    // Next.js 15+ では --webpack を指定することで WASM 版 Turbopack のエラーを確実に回避できます
    args.push('--webpack');
    console.log(`${COLORS.WARNING}⚠️  Falling back to Webpack${COLORS.RESET} ${COLORS.DIM}(Reason: ${reason})${COLORS.RESET}`);
  }

  console.log(`${COLORS.INFO}🚀 Executing:${COLORS.RESET} ${command} ${args.join(' ')}\n`);

  const child: ChildProcess = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd()
  });

  // シグナル転送の設定 (Ctrl+C 等で子プロセスも終了させる)
  const handleSignal = (signal: NodeJS.Signals) => {
    if (child.pid) child.kill(signal);
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    console.error(`${COLORS.WARNING}Failed to start child process:${COLORS.RESET}`, err);
    process.exit(1);
  });
}

// 実行開始
launchDevServer().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});