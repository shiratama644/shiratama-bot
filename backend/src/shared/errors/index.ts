import { ZodError } from 'zod';

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

function summarizeZodError(error: ZodError): string {
  if (error.issues.length === 0) {
    return 'Invalid request payload.';
  }
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    })
    .join('; ');
}

export function getErrorStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  if (error instanceof ZodError) {
    return 400;
  }
  return 500;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return summarizeZodError(error);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Error';
}

export function getPublicErrorMessage(statusCode: number): string {
  if (statusCode === 400) return 'Invalid request.';
  if (statusCode === 401) return 'Authentication required.';
  if (statusCode === 403) return 'Forbidden.';
  if (statusCode === 404) return 'Resource not found.';
  return 'Internal server error.';
}
