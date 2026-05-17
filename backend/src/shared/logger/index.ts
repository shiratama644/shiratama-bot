import pino from 'pino';

const appLogger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: undefined
});

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    appLogger.info({ args }, message);
  },
  error: (message: string, error?: unknown, ...args: unknown[]) => {
    appLogger.error({ error, args }, message);
  },
  warn: (message: string, ...args: unknown[]) => {
    appLogger.warn({ args }, message);
  }
};
