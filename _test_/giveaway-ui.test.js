import test from 'node:test';
import assert from 'node:assert/strict';

import { giveawayButton, giveawayEmbed } from '../backend/dist/giveawayService.js';

test('giveawayButton builds primary button with giveaway custom id', () => {
  const row = giveawayButton('g1');
  const button = row.components[0];

  assert.equal(button.data.custom_id, 'giveaway:toggle:g1');
  assert.equal(button.data.label, '参加 / 退出');
  assert.equal(button.data.style, 1);
  assert.equal(button.data.disabled, false);
});

test('giveawayButton supports disabled state', () => {
  const row = giveawayButton('g1', true);
  const button = row.components[0];

  assert.equal(button.data.disabled, true);
});

test('giveawayEmbed includes defaults and active status styling', () => {
  const endAt = new Date('2026-04-22T10:20:30.000Z');
  const embed = giveawayEmbed({
    id: 'g1',
    title: 'Sample',
    endAt,
    winnerCount: 2,
    entries: 5,
    status: 'active'
  });

  assert.equal(embed.data.title, '🎁 Sample');
  assert.equal(embed.data.description, '説明なし');
  assert.equal(embed.data.color, 0x57f287);

  const fields = embed.data.fields ?? [];
  assert.equal(fields.length, 4);
  assert.equal(fields[0].name, '締切');
  assert.equal(fields[0].value, `<t:${Math.floor(endAt.getTime() / 1000)}:F>`);
  assert.equal(fields[1].value, '2');
  assert.equal(fields[2].value, '5');
  assert.equal(fields[3].value, '開催中');
});

test('giveawayEmbed uses ended status styling and description when provided', () => {
  const embed = giveawayEmbed({
    id: 'g1',
    title: 'Ended Giveaway',
    description: 'final',
    endAt: new Date('2026-04-22T00:00:00.000Z'),
    winnerCount: 1,
    entries: 1,
    status: 'ended'
  });

  assert.equal(embed.data.description, 'final');
  assert.equal(embed.data.color, 0xed4245);

  const fields = embed.data.fields ?? [];
  assert.equal(fields[3].value, '終了');
});
