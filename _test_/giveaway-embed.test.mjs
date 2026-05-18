import test from 'node:test';
import assert from 'node:assert/strict';

import { giveawayButton, giveawayButtons, giveawayEmbed } from '../backend/dist/features/giveaway/index.js';

test('giveawayButton builds primary button with giveaway custom id', () => {
  const row = giveawayButton('g1');
  const enterButton = row.components[0];
  const copyButton = row.components[1];

  assert.equal(enterButton.data.custom_id, 'giveaway:toggle:g1');
  assert.equal(enterButton.data.label, 'Enter');
  assert.equal(enterButton.data.style, 1);
  assert.equal(enterButton.data.disabled, false);

  assert.equal(copyButton.data.custom_id, 'giveaway:copy:g1');
  assert.equal(copyButton.data.label, 'Copy ID');
});

test('giveawayButton supports disabled state', () => {
  const row = giveawayButton('g1', true);
  const enterButton = row.components[0];

  assert.equal(enterButton.data.disabled, true);
});

test('giveawayButtons returns the same structure as giveawayButton', () => {
  const row = giveawayButtons('g2');
  const enterButton = row.components[0];
  const copyButton = row.components[1];

  assert.equal(enterButton.data.custom_id, 'giveaway:toggle:g2');
  assert.equal(enterButton.data.disabled, false);
  assert.equal(copyButton.data.custom_id, 'giveaway:copy:g2');
});

test('giveawayButtons supports disabled state', () => {
  const row = giveawayButtons('g3', true);
  assert.equal(row.components[0].data.disabled, true);
});

test('giveawayEmbed includes defaults and active status styling', () => {
  const endAt = new Date('2026-04-22T10:20:30.000Z');
  const embed = giveawayEmbed({
    id: 'g1',
    title: 'Sample',
    endAt,
    winnerCount: 2,
    entries: 5,
    status: 'active',
    createdBy: 'host123'
  });

  assert.equal(embed.data.author?.name, 'Sample');
  assert.equal(embed.data.title, undefined);
  assert.equal(embed.data.color, 0x57f287);

  const ts = Math.floor(endAt.getTime() / 1000);
  assert.ok(embed.data.description?.includes(`<t:${ts}:R>`));
  assert.ok(embed.data.description?.includes('<@host123>'));
  assert.ok(embed.data.description?.includes('**Entries:** 5'));
  assert.ok(embed.data.description?.includes('**Winners:** 2'));
  assert.equal(embed.data.footer?.text, 'Click 🎉 Enter to participate');
});

test('giveawayEmbed uses ended status styling and description when provided', () => {
  const embed = giveawayEmbed({
    id: 'g1',
    title: 'Ended Giveaway',
    description: 'final',
    endAt: new Date('2026-04-22T00:00:00.000Z'),
    winnerCount: 1,
    entries: 1,
    status: 'ended',
    createdBy: 'host123'
  });

  assert.ok(embed.data.description?.endsWith('final'));
  assert.equal(embed.data.color, 0xed4245);
  assert.equal(embed.data.footer?.text, 'Ended');
});

test('giveawayEmbed uses stopped status styling', () => {
  const embed = giveawayEmbed({
    id: 'g2',
    title: 'Stopped Giveaway',
    endAt: new Date('2026-04-23T00:00:00.000Z'),
    winnerCount: 1,
    entries: 0,
    status: 'stopped',
    createdBy: 'host123'
  });

  assert.equal(embed.data.color, 0xed4245);
});

test('giveawayEmbed shows winner mentions when ended with winners', () => {
  const embed = giveawayEmbed({
    id: 'g3',
    title: 'Won Giveaway',
    endAt: new Date('2026-04-22T00:00:00.000Z'),
    winnerCount: 2,
    entries: 3,
    status: 'ended',
    createdBy: 'host123',
    winners: ['user1', 'user2']
  });

  assert.ok(embed.data.description?.includes('<@user1>'));
  assert.ok(embed.data.description?.includes('<@user2>'));
  assert.ok(!embed.data.description?.includes('No winners'));
});

test('giveawayEmbed shows No winners when ended with empty winners', () => {
  const embed = giveawayEmbed({
    id: 'g4',
    title: 'Empty Giveaway',
    endAt: new Date('2026-04-22T00:00:00.000Z'),
    winnerCount: 1,
    entries: 0,
    status: 'ended',
    createdBy: 'host123',
    winners: []
  });

  assert.ok(embed.data.description?.includes('No winners'));
});

test('giveawayEmbed shows Repeats line when autoRepeat and interval are set', () => {
  const embed = giveawayEmbed({
    id: 'g5',
    title: 'Repeating Giveaway',
    endAt: new Date('2026-04-22T10:00:00.000Z'),
    winnerCount: 1,
    entries: 0,
    status: 'active',
    createdBy: 'host123',
    autoRepeat: true,
    interval: '1d'
  });

  assert.ok(embed.data.description?.includes('**Repeats:**'));
  assert.ok(embed.data.description?.includes('`1d`'));
});

test('giveawayEmbed does not show Repeats line when autoRepeat is false', () => {
  const embed = giveawayEmbed({
    id: 'g6',
    title: 'No-Repeat Giveaway',
    endAt: new Date('2026-04-22T10:00:00.000Z'),
    winnerCount: 1,
    entries: 0,
    status: 'active',
    createdBy: 'host123',
    autoRepeat: false,
    interval: '1d'
  });

  assert.ok(!embed.data.description?.includes('**Repeats:**'));
});

test('giveawayEmbed shows Claim Window line for active giveaway with claimDeadline', () => {
  const embed = giveawayEmbed({
    id: 'g7',
    title: 'Claim Window Giveaway',
    endAt: new Date('2026-04-22T10:00:00.000Z'),
    winnerCount: 1,
    entries: 0,
    status: 'active',
    createdBy: 'host123',
    claimDeadline: '2h'
  });

  assert.ok(embed.data.description?.includes('**Claim Window:**'));
  assert.ok(embed.data.description?.includes('`2h`'));
});

test('giveawayEmbed shows Claim Deadline timestamp for ended giveaway with claimDeadline', () => {
  const endAt = new Date('2026-04-22T10:00:00.000Z');
  const embed = giveawayEmbed({
    id: 'g8',
    title: 'Claim Deadline Giveaway',
    endAt,
    winnerCount: 1,
    entries: 1,
    status: 'ended',
    createdBy: 'host123',
    claimDeadline: '1h'
  });

  const endTs = Math.floor(endAt.getTime() / 1000);
  const expectedClaimTs = endTs + 3600;
  assert.ok(embed.data.description?.includes(`<t:${expectedClaimTs}:R>`));
  assert.ok(embed.data.description?.includes('**Claim Deadline:**'));
});

test('giveawayEmbed ignores "def" claimDeadline value', () => {
  const embed = giveawayEmbed({
    id: 'g9',
    title: 'Def Claim Giveaway',
    endAt: new Date('2026-04-22T10:00:00.000Z'),
    winnerCount: 1,
    entries: 0,
    status: 'active',
    createdBy: 'host123',
    claimDeadline: 'def'
  });

  assert.ok(!embed.data.description?.includes('Claim'));
});
