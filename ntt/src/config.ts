import { NttConfigurationError } from './errors.js';
import type { NttCredentials } from './internal-types.js';
import type { NttConfigView, NttMode, NttOptions } from './types.js';

const value = (provided: string | undefined, name: string, source: NodeJS.ProcessEnv): string => {
  const result = provided ?? source[name] ?? '';
  if (typeof result !== 'string' || (result.length > 0 && !result.trim())) {
    throw new NttConfigurationError(name + ' must be a non-blank string when supplied');
  }
  return result;
};

export class NttConfig {
  readonly mode: NttMode;
  readonly environment: string;
  readonly baseUrl: string;
  readonly authPath: string;
  readonly statusPath: string;
  readonly refundPath: string;
  readonly refundStatusPath: string;
  readonly settlementUrl: string;
  readonly productId: string;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly fetch: typeof globalThis.fetch;
  readonly credentials: NttCredentials;

  constructor(options: NttOptions = {}, source: NodeJS.ProcessEnv = process.env) {
    const explicitMode = value(options.mode, 'NTT_MODE', source);
    if (source.NODE_ENV === 'production' && (!explicitMode || explicitMode === 'mock')) {
      throw new NttConfigurationError(
        'Set NTT_MODE=uat or live explicitly; mock mode is disabled in production',
      );
    }
    if (!explicitMode && (options.merchantId || source.NTT_MERCHANT_ID)) {
      throw new NttConfigurationError('Set NTT_MODE explicitly when supplying credentials');
    }
    const requestedMode = explicitMode || 'mock';
    if (!['mock', 'uat', 'live'].includes(requestedMode)) {
      throw new NttConfigurationError('NTT_MODE must be mock, uat, or live');
    }
    this.mode = requestedMode as NttMode;
    this.environment = this.mode === 'live' ? 'PRODUCTION' : this.mode.toUpperCase();
    const configuredEnvironment = value(options.environment, 'NTT_ENVIRONMENT', source);
    if (configuredEnvironment && configuredEnvironment.toUpperCase() !== this.environment) {
      throw new NttConfigurationError('NTT_ENVIRONMENT conflicts with NTT_MODE');
    }
    this.baseUrl =
      value(options.baseUrl, 'NTT_BASE_URL', source) ||
      (this.mode === 'live' ? 'https://payment.atomtech.in' : 'https://paynetzuat.atomtech.in');
    this.authPath = value(options.authPath, 'NTT_AUTH_PATH', source) || '/otsv2/aipay/auth';
    this.statusPath =
      value(options.statusPath, 'NTT_STATUS_PATH', source) ||
      (this.mode === 'live'
        ? 'https://payment1.atomtech.in/otsv2/payment/status'
        : '/otsv2/payment/status');
    this.refundPath =
      value(options.refundPath, 'NTT_REFUND_PATH', source) || '/otsv2/payment/refund';
    this.refundStatusPath =
      value(options.refundStatusPath, 'NTT_REFUND_STATUS_PATH', source) || '/otsv2/payment/status';
    this.settlementUrl =
      value(options.settlementUrl, 'NTT_SETTLEMENT_URL', source) ||
      (this.mode === 'live'
        ? 'https://pgreports.atomtech.in/SettlementReport/generateReport'
        : 'https://titanuat.atomtech.in/SettlementReport/generateReport');
    this.productId = value(options.productId, 'NTT_PRODUCT_ID', source) || 'NSE';
    this.timeoutMs = options.timeoutMs ?? Number(source.NTT_TIMEOUT_MS || 15_000);
    this.maxResponseBytes = options.maxResponseBytes ?? 2_097_152;
    this.fetch = options.fetch ?? globalThis.fetch;

    if (typeof this.fetch !== 'function')
      throw new NttConfigurationError('This Node.js runtime does not provide fetch');
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 120_000) {
      throw new NttConfigurationError('timeoutMs must be between 1000 and 120000 milliseconds');
    }
    if (
      !Number.isInteger(this.maxResponseBytes) ||
      this.maxResponseBytes < 1024 ||
      this.maxResponseBytes > 16_777_216
    )
      throw new NttConfigurationError('maxResponseBytes must be between 1024 and 16777216');
    for (const endpoint of [
      this.baseUrl,
      this.authPath,
      this.statusPath,
      this.refundPath,
      this.refundStatusPath,
      this.settlementUrl,
    ]) {
      try {
        const url = new URL(endpoint, this.baseUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search)
          throw new Error();
      } catch {
        throw new NttConfigurationError(
          'NTT endpoints must be HTTPS URLs without embedded credentials, queries or fragments',
        );
      }
    }

    const requestEncryptionKey = value(
      options.requestEncryptionKey,
      'NTT_REQUEST_ENCRYPTION_KEY',
      source,
    );
    const responseEncryptionKey = value(
      options.responseEncryptionKey,
      'NTT_RESPONSE_ENCRYPTION_KEY',
      source,
    );
    this.credentials = {
      merchantId: value(options.merchantId, 'NTT_MERCHANT_ID', source),
      userId:
        value(options.userId, 'NTT_USER_ID', source) ||
        value(options.merchantId, 'NTT_MERCHANT_ID', source),
      apiSecretKey: value(options.apiSecretKey, 'NTT_API_SECRET_KEY', source),
      transactionPassword: value(options.transactionPassword, 'NTT_TRANSACTION_PASSWORD', source),
      requestEncryptionKey,
      requestSalt: value(options.requestSalt, 'NTT_REQUEST_SALT', source) || requestEncryptionKey,
      responseEncryptionKey,
      responseSalt:
        value(options.responseSalt, 'NTT_RESPONSE_SALT', source) || responseEncryptionKey,
      requestHashKey: value(options.requestHashKey, 'NTT_REQUEST_HASH_KEY', source),
      responseHashKey: value(options.responseHashKey, 'NTT_RESPONSE_HASH_KEY', source),
    };

    if (this.mode !== 'mock') {
      this.assertCredentials();
      if (!/^\d{1,15}$/.test(this.credentials.merchantId))
        throw new NttConfigurationError('merchantId must contain 1 to 15 digits');
      if (!this.productId.trim() || this.productId.length > 50)
        throw new NttConfigurationError('productId must contain 1 to 50 characters');
      if (
        [this.authPath, this.statusPath, this.refundPath, this.refundStatusPath].some((path) =>
          path.includes('/otsv2/'),
        ) &&
        !this.credentials.apiSecretKey
      ) {
        throw new NttConfigurationError(
          'NTT_API_SECRET_KEY is required for otsv2 endpoints; configure NTT-approved legacy paths for accounts without a bearer key',
        );
      }
    }
  }

  view(): NttConfigView {
    return {
      mode: this.mode,
      environment: this.environment,
      baseUrl: this.baseUrl,
      productId: this.productId,
      merchantId: this.credentials.merchantId,
      configured: this.mode === 'mock' || this.missingCredentials().length === 0,
    };
  }

  private missingCredentials(): string[] {
    const required: Array<keyof NttCredentials> = [
      'merchantId',
      'userId',
      'transactionPassword',
      'requestEncryptionKey',
      'requestSalt',
      'responseEncryptionKey',
      'responseSalt',
      'requestHashKey',
      'responseHashKey',
    ];
    return required.filter((key) => !this.credentials[key]);
  }

  private assertCredentials(): void {
    const missing = this.missingCredentials();
    if (missing.length > 0) {
      throw new NttConfigurationError(`NTT configuration is missing: ${missing.join(', ')}`);
    }
  }
}
