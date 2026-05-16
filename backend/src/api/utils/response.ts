import { AppError, getErrorMessage, getErrorStatusCode } from '../../shared/errors/index.js';

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
  return c.json({ error: getErrorMessage(error) }, getErrorStatusCode(error) as ApiErrorStatus);
}
