const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(`${CYAN}[INFO]${RESET} ${new Date().toISOString()}: ${message}`, ...args);
  },
  error: (message: string, error?: unknown, ...args: unknown[]) => {
    console.error(`${BOLD}${RED}[ERROR]${RESET} ${new Date().toISOString()}: ${message}`, error, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`${YELLOW}[WARN]${RESET} ${new Date().toISOString()}: ${message}`, ...args);
  }
};
