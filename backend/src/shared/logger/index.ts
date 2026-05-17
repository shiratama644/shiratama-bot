import pino from 'pino';

const appLogger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: undefined
});

function splitBindings(args: unknown[]): { bindings: Record<string, unknown>; rest: unknown[] } {
  if (args.length > 0 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    return { bindings: args[0] as Record<string, unknown>, rest: args.slice(1) };
  }
  return { bindings: {}, rest: args };
}

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    const { bindings, rest } = splitBindings(args);
    appLogger.info(rest.length > 0 ? { ...bindings, args: rest } : bindings, message);
  },
  error: (message: string, error?: unknown, ...args: unknown[]) => {
    const { bindings, rest } = splitBindings(args);
    appLogger.error(
      rest.length > 0 ? { ...bindings, error, args: rest } : { ...bindings, error },
      message
    );
  },
  warn: (message: string, ...args: unknown[]) => {
    const { bindings, rest } = splitBindings(args);
    appLogger.warn(rest.length > 0 ? { ...bindings, args: rest } : bindings, message);
  }
};
