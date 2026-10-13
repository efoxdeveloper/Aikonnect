import { randomUUID } from 'node:crypto';

export type NttErrorCode =
  | 'NTT_CONFIGURATION_ERROR'
  | 'NTT_VALIDATION_ERROR'
  | 'NTT_REQUEST_ERROR'
  | 'NTT_TIMEOUT'
  | 'NTT_CALLBACK_ERROR';

export class NttError extends Error {
  constructor(
    message: string,
    public readonly code: NttErrorCode,
    public readonly status?: number,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'NttError';
    this.requestId ??= randomUUID();
  }
}

export class NttConfigurationError extends NttError {
  constructor(message: string, details?: unknown) {
    super(message, 'NTT_CONFIGURATION_ERROR', undefined, undefined, details);
    this.name = 'NttConfigurationError';
  }
}

export class NttValidationError extends NttError {
  constructor(message: string, details?: unknown) {
    super(message, 'NTT_VALIDATION_ERROR', 400, undefined, details);
    this.name = 'NttValidationError';
  }
}

export class NttRequestError extends NttError {
  constructor(message: string, status?: number, requestId?: string, details?: unknown) {
    super(message, 'NTT_REQUEST_ERROR', status, requestId, details);
    this.name = 'NttRequestError';
  }
}

export class NttTimeoutError extends NttError {
  constructor(message = 'NTT request timed out', requestId?: string) {
    super(message, 'NTT_TIMEOUT', 504, requestId);
    this.name = 'NttTimeoutError';
  }
}

export class NttCallbackError extends NttError {
  constructor(message: string, details?: unknown, requestId?: string) {
    super(message, 'NTT_CALLBACK_ERROR', 400, requestId, details);
    this.name = 'NttCallbackError';
  }
}
