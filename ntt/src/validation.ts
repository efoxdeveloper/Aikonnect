import { NttRequestError, NttValidationError } from './errors.js';
import type { NttPaymentStatus } from './types.js';

export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const scalar = (value: unknown): string | undefined =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : undefined;

export function id(value: unknown, label: string, max = 50): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > max ||
    !/^[A-Za-z0-9_.-]+$/.test(value)
  ) {
    throw new NttValidationError(
      label + ' must contain 1-' + max + ' letters, digits, underscores, dots, or hyphens',
    );
  }
}

export function money(value: unknown): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0.01 ||
    value > 9_999_999_999.99 ||
    Number(value.toFixed(2)) !== value
  ) {
    throw new NttValidationError(
      'amount must be 0.01–9999999999.99 in major currency units, with at most two decimal places',
    );
  }
}

export function currency(value: unknown): string {
  if (value === undefined) return 'INR';
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value))
    throw new NttValidationError('currency must be a three-letter code');
  return value.toUpperCase();
}

export function dateOnly(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    throw new NttValidationError('transactionDate/settlementDate must be a valid YYYY-MM-DD date');
  }
  return value;
}

export function nttDate(value: Date): string {
  if (!Number.isFinite(value.getTime()))
    throw new NttValidationError('createdAt must be a valid date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return (
    part('year') +
    '-' +
    part('month') +
    '-' +
    part('day') +
    ' ' +
    part('hour') +
    ':' +
    part('minute') +
    ':' +
    part('second')
  );
}

// Transaction Status (Requery) API v1.20, p24. Query errors are not payment failures.
const statuses: Record<string, NttPaymentStatus> = {
  OTS0000: 'SUCCESS',
  OTS0002: 'SUCCESS',
  OTS0001: 'FAILED',
  OTS0101: 'CANCELLED',
  OTS0201: 'PENDING',
  OTS0301: 'PENDING',
  OTS0351: 'PENDING',
  OTS0551: 'PENDING',
  OTS0600: 'FAILED',
  OTS0615: 'FAILED',
  SUCCESS: 'SUCCESS',
  CAPTURED: 'SUCCESS',
  AUTHORIZED: 'AUTHORIZED',
  PENDING: 'PENDING',
  INITIATED: 'INITIATED',
  FAILED: 'FAILED',
  FAILURE: 'FAILED',
  CANCELLED: 'CANCELLED',
  CANCELED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
};
export function paymentStatus(code: string, requestId: string): NttPaymentStatus {
  const status = statuses[code.toUpperCase()];
  if (!status)
    throw new NttRequestError(
      'NTT returned an unsupported status or rejected the query; payment state is unchanged',
      undefined,
      requestId,
      { providerStatusCode: code },
    );
  return status;
}

export function required(value: unknown, label: string, requestId: string): string {
  const result = scalar(value);
  if (!result)
    throw new NttRequestError(
      'NTT response is missing or has invalid ' + label,
      undefined,
      requestId,
    );
  return result;
}

export function instrument(value: unknown, requestId: string): Record<string, unknown> {
  const payload = record(value).payInstrument;
  if (Array.isArray(payload) && payload.length !== 1)
    throw new NttRequestError('NTT returned an ambiguous payment response', undefined, requestId);
  const result = record(Array.isArray(payload) ? payload[0] : payload);
  if (!Object.keys(result).length)
    throw new NttRequestError('NTT response is missing payInstrument', undefined, requestId);
  return result;
}
