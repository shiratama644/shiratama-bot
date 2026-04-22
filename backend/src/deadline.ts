import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

const DURATION_RE = /^(\d+)(m|h|d)$/i;

export function parseDeadline(input: string): Date {
  const value = input.trim();
  const durationMatch = value.match(DURATION_RE);

  if (durationMatch) {
    const amount = Number(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    if (amount <= 0) {
      throw new Error('期限は0より大きい必要があります。');
    }
    const result = dayjs().add(amount, unit as 'm' | 'h' | 'd');
    return result.toDate();
  }

  const parsed = dayjs(value, 'YYYY/MM/DD', true);
  if (!parsed.isValid()) {
    throw new Error('期限は YYYY/MM/DD または 10m/10h/5d の形式で入力してください。');
  }

  return parsed.endOf('day').toDate();
}
