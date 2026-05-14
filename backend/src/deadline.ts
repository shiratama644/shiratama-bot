import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

const COMPOUND_DURATION_RE = /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?$/i;

function parseCompoundDuration(value: string): Date | null {
  const trimmed = value.trim();
  const match = trimmed.match(COMPOUND_DURATION_RE);
  if (!match) return null;
  const [, w, d, h, m] = match;
  if (!w && !d && !h && !m) return null;
  const totalMs =
    ((Number(w ?? 0) * 7 * 24 * 3600) +
     (Number(d ?? 0) * 24 * 3600) +
     (Number(h ?? 0) * 3600) +
     (Number(m ?? 0) * 60)) * 1000;
  if (totalMs <= 0) return null;
  return new Date(Date.now() + totalMs);
}

export function parseDeadline(input: string): Date {
  const value = input.trim();

  // Try compound duration (1w, 1h, 30m, 1w2d3h, etc.)
  const compoundDate = parseCompoundDuration(value);
  if (compoundDate) return compoundDate;

  // Try YYYY/MM/DD (strict)
  const slashDate = dayjs(value, 'YYYY/MM/DD', true);
  if (slashDate.isValid()) return slashDate.endOf('day').toDate();

  // Try ISO 8601 and other datetime formats via dayjs
  const isoDate = dayjs(value);
  if (isoDate.isValid()) return isoDate.toDate();

  throw new Error(
    'Deadline must be a duration (e.g. 1h, 1w2d3h), YYYY/MM/DD, or ISO 8601 datetime.'
  );
}
