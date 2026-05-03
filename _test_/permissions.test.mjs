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

test('hasAnyRequiredRole returns false when memberRoles is empty', () => {
  assert.equal(hasAnyRequiredRole(new Set(), ['r1', 'r2']), false);
});

test('hasAnyRequiredRole returns false when requiredRoleIds is empty', () => {
  const memberRoles = new Set(['r1', 'r2']);
  assert.equal(hasAnyRequiredRole(memberRoles, []), false);
});

test('hasAnyRequiredRole returns true when exact match exists', () => {
  const memberRoles = new Set(['admin']);
  assert.equal(hasAnyRequiredRole(memberRoles, ['admin']), true);
});
