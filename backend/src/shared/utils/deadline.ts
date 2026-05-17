import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

const INTERVAL_SEGMENT_RE = /(\d+)(w|d|h|m|s)/gi;
const FULL_INTERVAL_RE = /^(\d+(w|d|h|m|s))+$/i;

const UNIT_TO_MS: Record<string, number> = {
  w: 7 * 24 * 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  m: 60 * 1000,
  s: 1000
};

export function parseIntervalMs(input: string): number | null {
  const value = input.trim().toLowerCase();
  if (!value) {
    return null;
  }
  if (!FULL_INTERVAL_RE.test(value)) {
    return null;
  }

  let total = 0;
  for (const match of value.matchAll(INTERVAL_SEGMENT_RE)) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error('The deadline must be greater than 0.');
    }
    total += amount * UNIT_TO_MS[unit];
  }
  return total;
}

export function parseDeadline(input: string): Date {
  const value = input.trim();
  if (!value) {
    throw new Error('Deadline is required.');
  }

  const intervalMs = parseIntervalMs(value);
  if (intervalMs && intervalMs > 0) {
    return new Date(Date.now() + intervalMs);
  }

  const ensureFuture = (date: Date): Date => {
    if (date.getTime() <= Date.now()) {
      throw new Error('Deadline must be a future date/time.');
    }
    return date;
  };

  const parsed = dayjs(value, 'YYYY/MM/DD', true);
  if (!parsed.isValid()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return ensureFuture(date);
    }
    throw new Error('Deadline must be in YYYY/MM/DD or interval format like 10m/10h/5d/1w.');
  }

  return ensureFuture(parsed.endOf('day').toDate());
}
