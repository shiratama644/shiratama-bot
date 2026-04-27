import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError, getErrorMessage, getErrorStatusCode } from '../backend/dist/errors.js';

test('getErrorStatusCode returns status from AppError', () => {
  const error = new AppError('forbidden', 403);
  assert.equal(getErrorStatusCode(error), 403);
});

test('getErrorMessage falls back for unknown error', () => {
  assert.equal(getErrorMessage('bad'), 'エラー');
});
