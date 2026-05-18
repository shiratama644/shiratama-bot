import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError, getErrorMessage, getErrorStatusCode } from '../backend/dist/shared/errors/index.js';
import { ZodError } from 'zod';

test('AppError has correct name, message, and statusCode', () => {
  const error = new AppError('something went wrong', 422);
  assert.equal(error.name, 'AppError');
  assert.equal(error.message, 'something went wrong');
  assert.equal(error.statusCode, 422);
  assert.ok(error instanceof Error);
});

test('getErrorStatusCode returns status from AppError', () => {
  const error = new AppError('forbidden', 403);
  assert.equal(getErrorStatusCode(error), 403);
});

test('getErrorStatusCode returns 400 for ZodError', () => {
  const zodError = new ZodError([]);
  assert.equal(getErrorStatusCode(zodError), 400);
});

test('getErrorStatusCode returns 500 for plain Error', () => {
  assert.equal(getErrorStatusCode(new Error('oops')), 500);
});

test('getErrorStatusCode returns 500 for unknown value', () => {
  assert.equal(getErrorStatusCode('unexpected'), 500);
});

test('getErrorMessage returns the error message for Error instances', () => {
  const error = new Error('something failed');
  assert.equal(getErrorMessage(error), 'something failed');
});

test('getErrorMessage returns AppError message', () => {
  const error = new AppError('not found', 404);
  assert.equal(getErrorMessage(error), 'not found');
});

test('getErrorMessage falls back for unknown error', () => {
  assert.equal(getErrorMessage('bad'), 'Error');
});

test('getErrorMessage summarizes ZodError issues', () => {
  const zodError = new ZodError([
    {
      code: 'invalid_type',
      expected: 'string',
      path: ['guildId'],
      message: 'Expected string',
      input: 1
    }
  ]);
  assert.equal(getErrorMessage(zodError), 'guildId: Expected string');
});
