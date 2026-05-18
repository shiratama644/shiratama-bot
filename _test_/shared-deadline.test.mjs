import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDeadline } from '../backend/dist/shared/utils/deadline.js';

test('parseDeadline parses duration in minutes', () => {
  const start = Date.now();
  const parsed = parseDeadline('10m');
  const diff = parsed.getTime() - start;

  assert.ok(diff >= 9 * 60 * 1000, `diff too small: ${diff}`);
  assert.ok(diff <= 11 * 60 * 1000, `diff too large: ${diff}`);
});

test('parseDeadline trims input and parses duration in hours case-insensitively', () => {
  const start = Date.now();
  const parsed = parseDeadline(' 2H ');
  const diff = parsed.getTime() - start;

  assert.ok(diff >= 119 * 60 * 1000, `diff too small: ${diff}`);
  assert.ok(diff <= 121 * 60 * 1000, `diff too large: ${diff}`);
});

test('parseDeadline parses duration in days', () => {
  const start = Date.now();
  const parsed = parseDeadline('3d');
  const diff = parsed.getTime() - start;

  assert.ok(diff >= 3 * 24 * 60 * 60 * 1000 - 5000, `diff too small: ${diff}`);
  assert.ok(diff <= 3 * 24 * 60 * 60 * 1000 + 5000, `diff too large: ${diff}`);
});

test('parseDeadline parses date and returns end of day', () => {
  const parsed = parseDeadline('2099/04/22');

  assert.equal(parsed.getHours(), 23);
  assert.equal(parsed.getMinutes(), 59);
  assert.equal(parsed.getSeconds(), 59);
  assert.equal(parsed.getMilliseconds(), 999);
});

test('parseDeadline rejects non-positive durations', () => {
  assert.throws(() => parseDeadline('0d'), /The deadline must be greater than 0/);
});

test('parseDeadline rejects zero hours', () => {
  assert.throws(() => parseDeadline('0h'), /The deadline must be greater than 0/);
});

test('parseDeadline rejects invalid formats', () => {
  assert.throws(
    () => parseDeadline('not-a-deadline'),
    /Deadline must be in YYYY\/MM\/DD or interval format like 10m\/10h\/5d\/1w/
  );
});
