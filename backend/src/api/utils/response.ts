import { AppError, getErrorMessage, getErrorStatusCode, getPublicErrorMessage } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';

export function requireParam(value: string | undefined, key: string): string {
  if (!value) {
    throw new AppError(`Invalid route parameter: ${key}`, 400);
  }
  return value;
}

type ApiErrorStatus = 400 | 401 | 403 | 404 | 500;

type ErrorResponseContext = {
  json: (body: { error: string }, status: ApiErrorStatus) => Response;
};

export function respondError(c: ErrorResponseContext, error: unknown) {
  const statusCode = getErrorStatusCode(error) as ApiErrorStatus;
  const logPayload = { statusCode, error: getErrorMessage(error), rawError: error };
  if (statusCode >= 500) {
    logger.error('API request failed', logPayload);
  } else {
    logger.warn('API request failed', logPayload);
  }
  return c.json({ error: getPublicErrorMessage(statusCode) }, statusCode);
}
