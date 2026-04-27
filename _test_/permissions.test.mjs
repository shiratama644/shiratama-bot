import test from 'node:test';
import assert from 'node:assert/strict';

import { hasAnyRequiredRole } from '../backend/dist/commands/permissions.js';

test('hasAnyRequiredRole returns true when at least one role matches', () => {
  const memberRoles = new Set(['r1', 'r2']);
  assert.equal(hasAnyRequiredRole(memberRoles, ['x', 'r2']), true);
});

test('hasAnyRequiredRole returns false when no role matches', () => {
  const memberRoles = new Set(['r1', 'r2']);
  assert.equal(hasAnyRequiredRole(memberRoles, ['x', 'y']), false);
});
