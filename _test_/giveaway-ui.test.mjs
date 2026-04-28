import test from 'node:test';
import assert from 'node:assert/strict';

import { giveawayButton, giveawayEmbed } from '../backend/dist/giveawayService.js';

test('giveawayButton builds primary button with giveaway custom id', () => {
  const row = giveawayButton('g1');
  const enterButton = row.components[0];
  const copyButton = row.components[1];

  assert.equal(enterButton.data.custom_id, 'giveaway:toggle:g1');
  assert.equal(enterButton.data.label, 'Enter');
  assert.equal(enterButton.data.style, 1);
  assert.equal(enterButton.data.disabled, false);

  assert.equal(copyButton.data.custom_id, 'copy_id_g1');
  assert.equal(copyButton.data.label, 'Copy ID');
});

test('giveawayButton supports disabled state', () => {
  const row = giveawayButton('g1', true);
  const enterButton = row.components[0];

  assert.equal(enterButton.data.disabled, true);
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
