import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform, arch } from 'node:os';

/**
 * Constants for UI Feedback
 */
const COLORS = {
  RESET: '\x1b[0m',
  SUCCESS: '\x1b[32m', // Green
  WARNING: '\x1b[33m', // Yellow
  INFO: '\x1b[36m',    // Cyan
  DIM: '\x1b[90m',     // Gray
} as const;

/**
 * Result of environment check
 */
interface CompatibilityResult {
  canUseTurbo: boolean;
  reason?: string;
}

/**
 * Detects if the current environment is compatible with Turbo Pack.
 * Next.js Turbo Pack (Rust-based) has specific requirements for libc and architecture.
 */
function checkTurboCompatibility(): CompatibilityResult {
  // 1. Termux Detection (Android-based Linux)
  // Termux uses Bionic libc, which is incompatible with standard glibc/musl Rust binaries.
  const isTermux = 
    !!process.env.TERMUX_VERSION || 
    process.env.PREFIX?.includes('com.termux') || 
    existsSync('/data/data/com.termux');

  if (isTermux) {
    return { canUseTurbo: false, reason: 'Termux environment (Bionic libc incompatibility)' };
  }

  // 2. OS Support
  const supportedPlatforms = ['win32', 'darwin', 'linux'];
  if (!supportedPlatforms.includes(platform())) {
    return { canUseTurbo: false, reason: `Unsupported OS: ${platform()}` };
  }

  // 3. Architecture Support
  const supportedArches = ['x64', 'arm64'];
  if (!supportedArches.includes(arch())) {
    return { canUseTurbo: false, reason: `Unsupported Architecture: ${arch()}` };
  }

  return { canUseTurbo: true };
}

/**
 * Main Application Logic
 */
async function launchDevServer() {
  const { canUseTurbo, reason } = checkTurboCompatibility();
  
  // Base command: pnpm --filter web exec next dev
  const command = 'pnpm';
  const args = ['--filter', 'web', 'exec', 'next', 'dev'];

  if (canUseTurbo) {
    args.push('--turbo');
    console.log(`${COLORS.SUCCESS}⚡ Turbo Pack enabled${COLORS.RESET}`);
  } else {
    console.log(`${COLORS.WARNING}⚠️  Falling back to Webpack${COLORS.RESET} ${COLORS.DIM}(Reason: ${reason})${COLORS.RESET}`);
  }

  console.log(`${COLORS.INFO}🚀 Executing:${COLORS.RESET} ${command} ${args.join(' ')}\n`);

  const child: ChildProcess = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
  });

  // Handle process termination
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

// Start execution
launchDevServer().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
