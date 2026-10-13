import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { NttConfig } from './config.js';
import {
  NttCallbackError,
  NttRequestError,
  NttTimeoutError,
  NttValidationError,
} from './errors.js';
import { decrypt, encrypt, sign, verify } from './crypto.js';
import { NttTransport } from './transport.js';
import {
  currency,
  dateOnly,
  id,
  instrument,
  money,
  nttDate,
  paymentStatus,
  record,
  required,
  scalar,
} from './validation.js';
import type {
  CreatePaymentRequest,
  CreatePaymentResult,
  ExpectedPayment,
  NttOptions,
  NttConfigView,
  PaymentStatusRequest,
  PaymentStatusResult,
  RefundRequest,
  RefundResult,
  RefundStatusRequest,
  SettlementReportRequest,
  SettlementReportResult,
  VerifiedCallback,
} from './types.js';

export * from './errors.js';
export * from './types.js';

export class Ntt {
  #config: NttConfig;
  #transport: NttTransport;
  readonly payments = {
    create: (request: CreatePaymentRequest) => this.createPayment(request),
    status: (request: PaymentStatusRequest) => this.getPaymentStatus(request),
    verifyCallback: (body: unknown, expected?: ExpectedPayment) =>
      this.verifyCallback(body, expected),
  };
  readonly refunds = {
    create: (request: RefundRequest) => this.createRefund(request),
    status: (request: RefundStatusRequest) => this.getRefundStatus(request),
  };
  readonly settlements = {
    report: (request: SettlementReportRequest) => this.getSettlementReport(request),
  };

  constructor(options: NttOptions = {}) {
    this.#config = new NttConfig(options);
    this.#transport = new NttTransport(this.#config);
  }
  get configuration(): NttConfigView {
    return this.#config.view();
  }
  toJSON(): NttConfigView {
    return this.configuration;
  }
  [inspect.custom](): NttConfigView {
    return this.configuration;
  }

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResult> {
    id(request?.orderId, 'orderId');
    money(request?.amount);
    const txnCurrency = currency(request.currency);
    if (
      typeof request.customer?.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.customer.email) ||
      request.customer.email.length > 254 ||
      typeof request.customer.mobile !== 'string' ||
      !/^\+?[0-9]{8,15}$/.test(request.customer.mobile)
    ) {
      throw new NttValidationError('customer.email and customer.mobile must be valid');
    }
    if (request.returnUrl !== undefined) {
      let url: URL;
      try {
        url = new URL(request.returnUrl);
      } catch {
        throw new NttValidationError('returnUrl must be an absolute URL');
      }
      if (
        url.username ||
        url.password ||
        !['http:', 'https:'].includes(url.protocol) ||
        (this.#config.mode === 'live' && url.protocol !== 'https:')
      ) {
        throw new NttValidationError(
          'returnUrl must use HTTPS in live mode and must not contain credentials',
        );
      }
    }
    if (
      request.metadata !== undefined &&
      (request.metadata === null ||
        typeof request.metadata !== 'object' ||
        Array.isArray(request.metadata) ||
        Object.entries(request.metadata).some(
          ([k, v]) => typeof v !== 'string' || k.length + v.length > 250,
        ))
    ) {
      throw new NttValidationError('metadata must contain short string values');
    }
    const requestId = randomUUID();
    const createdAt = new Date();
    const transactionDate = nttDate(createdAt).slice(0, 10);
    const common = {
      paymentId: request.orderId,
      orderId: request.orderId,
      requestId,
      createdAt: createdAt.toISOString(),
      transactionDate,
    };
    if (this.#config.mode === 'mock') {
      const scenario =
        request.metadata?.mockScenario?.toUpperCase() ??
        { 9991: 'FAILED', 9992: 'PENDING', 9993: 'TIMEOUT', 9994: 'SUCCESS' }[request.amount] ??
        'INITIATED';
      if (!['FAILED', 'PENDING', 'TIMEOUT', 'SUCCESS', 'INITIATED'].includes(scenario))
        throw new NttValidationError('Unknown mockScenario');
      if (scenario === 'TIMEOUT') throw new NttTimeoutError('Simulated NTT timeout', requestId);
      if (scenario === 'FAILED')
        throw new NttRequestError('Simulated NTT initialization failure', undefined, requestId);
      const token = 'MOCK_NTT_TOKEN_' + randomUUID();
      return {
        ...common,
        status: scenario as 'PENDING' | 'SUCCESS' | 'INITIATED',
        checkout: {
          type: 'SDK_TOKEN',
          token,
          merchantId: 'MOCK',
          environment: 'MOCK',
          ...(request.returnUrl ? { returnUrl: request.returnUrl } : {}),
        },
        providerPaymentId: token,
      };
    }
    const c = this.#config.credentials;
    const payload = {
      payInstrument: {
        headDetails: { version: 'OTSv1.1', api: 'AUTH', platform: 'FLASH' },
        merchDetails: {
          merchId: c.merchantId,
          userId: c.userId,
          password: c.transactionPassword,
          merchTxnId: request.orderId,
          merchTxnDate: nttDate(createdAt),
        },
        payDetails: {
          amount: request.amount.toFixed(2),
          product: this.#config.productId,
          custAccNo: request.customer.mobile,
          txnCurrency,
        },
        custDetails: { custEmail: request.customer.email, custMobile: request.customer.mobile },
        extras: {
          udf1: request.orderId,
          ...Object.fromEntries(
            Object.entries(request.metadata ?? {})
              .slice(0, 4)
              .map(([k, v], i) => ['udf' + (i + 2), k + ':' + v]),
          ),
        },
      },
    };
    const decoded = record(await this.call(this.#config.authPath, payload, requestId, false));
    const code = required(
      record(decoded.responseDetails).txnStatusCode,
      'txnStatusCode',
      requestId,
    );
    if (code !== 'OTS0000')
      throw new NttRequestError('NTT rejected payment initialization', undefined, requestId, {
        providerStatusCode: code,
      });
    const token = required(decoded.atomTokenId, 'atomTokenId', requestId);
    return {
      ...common,
      status: 'INITIATED',
      providerPaymentId: token,
      providerStatusCode: code,
      checkout: {
        type: 'SDK_TOKEN',
        token,
        merchantId: c.merchantId,
        environment: this.#config.environment,
        ...(request.returnUrl ? { returnUrl: request.returnUrl } : {}),
      },
    };
  }

  async verifyCallback(body: unknown, expected?: ExpectedPayment): Promise<VerifiedCallback> {
    const requestId = randomUUID();
    try {
      let result: VerifiedCallback;
      if (this.#config.mode === 'mock') {
        const input = record(body);
        const paymentId = required(input.paymentId ?? input.orderId, 'paymentId', requestId);
        const amount = Number(input.amount);
        money(amount);
        result = {
          requestId,
          paymentId,
          orderId: paymentId,
          merchantId: 'MOCK',
          amount,
          totalAmount: amount,
          currency: currency(input.currency),
          status: paymentStatus(required(input.status, 'status', requestId), requestId),
          providerPaymentId: 'MOCK_ATOM_' + paymentId,
          providerTransactionId: 'MOCK_ATOM_' + paymentId,
          bankTransactionId: 'MOCK_BANK_' + paymentId,
          providerStatusCode: String(input.status),
          raw: body,
        };
      } else {
        if (Buffer.isBuffer(body)) body = body.toString('utf8');
        if (typeof body === 'string') {
          if (Buffer.byteLength(body) > this.#config.maxResponseBytes) throw new Error();
          try {
            body = JSON.parse(body);
          } catch {
            body = Object.fromEntries(new URLSearchParams(body as string));
          }
        }
        const encData = required(record(body).encData, 'encData', requestId);
        if (encData.length > this.#config.maxResponseBytes) throw new Error();
        const decoded = await this.decode(encData, requestId);
        const data = instrument(decoded, requestId);
        const merchant = record(data.merchDetails),
          pay = record(data.payDetails),
          mode = record(data.payModeSpecificData);
        const merchantId = required(merchant.merchId, 'merchId', requestId);
        if (merchantId !== this.#config.credentials.merchantId)
          throw new NttCallbackError(
            'Callback merchant does not match configured merchant',
            undefined,
            requestId,
          );
        const paymentId = required(merchant.merchTxnId, 'merchTxnId', requestId);
        const atomId = required(pay.atomTxnId, 'atomTxnId', requestId);
        const bankId = required(record(mode.bankDetails).bankTxnId, 'bankTxnId', requestId);
        const code = required(record(data.responseDetails).statusCode, 'statusCode', requestId);
        const channel = required(
          Array.isArray(mode.subChannel) ? mode.subChannel[0] : mode.subChannel,
          'subChannel',
          requestId,
        );
        if (typeof pay.totalAmount !== 'number' && typeof pay.totalAmount !== 'string')
          throw new Error();
        const totalAmount = Number(pay.totalAmount);
        money(totalAmount);
        const signature = required(pay.signature, 'signature', requestId);
        if (
          !verify(
            merchantId + atomId + paymentId + totalAmount.toFixed(2) + code + channel + bankId,
            signature,
            this.#config.credentials.responseHashKey,
          )
        )
          throw new NttCallbackError('NTT callback signature is invalid', undefined, requestId);
        const txnCurrency = currency(required(pay.txnCurrency, 'txnCurrency', requestId));
        result = {
          requestId,
          merchantId,
          paymentId,
          orderId: paymentId,
          amount: totalAmount,
          totalAmount,
          currency: txnCurrency,
          status: paymentStatus(code, requestId),
          providerPaymentId: atomId,
          providerTransactionId: atomId,
          bankTransactionId: bankId,
          providerStatusCode: code,
          raw: decoded,
        };
      }
      if (expected) {
        id(expected.paymentId, 'expected.paymentId');
        money(expected.amount);
        if (
          result.paymentId !== expected.paymentId ||
          result.totalAmount !== expected.amount ||
          result.currency !== currency(expected.currency)
        ) {
          throw new NttCallbackError(
            'Callback order, amount, or currency does not match the stored order',
            undefined,
            requestId,
          );
        }
      }
      return result;
    } catch (error) {
      if (error instanceof NttCallbackError) throw error;
      throw new NttCallbackError(
        'Invalid NTT callback; decryption, signature, or field validation failed',
        undefined,
        requestId,
      );
    }
  }

  async getPaymentStatus(request: PaymentStatusRequest): Promise<PaymentStatusResult> {
    const paymentId = request?.paymentId ?? request?.orderId;
    id(paymentId, 'paymentId/orderId');
    money(request.amount);
    const txnCurrency = currency(request.currency);
    if (request.paymentId && request.orderId && request.paymentId !== request.orderId)
      throw new NttValidationError('paymentId and orderId must identify the same transaction');
    let transactionDate: string;
    if (request.transactionDate !== undefined) transactionDate = dateOnly(request.transactionDate);
    else if (request.createdAt !== undefined) {
      if (
        typeof request.createdAt === 'string' &&
        !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(request.createdAt)
      )
        throw new NttValidationError(
          'createdAt must be an ISO timestamp with timezone; or supply transactionDate',
        );
      transactionDate = nttDate(new Date(request.createdAt)).slice(0, 10);
    } else
      throw new NttValidationError(
        'Provide the original transactionDate returned by payments.create (or createdAt)',
      );
    if (request.providerTransactionId) id(request.providerTransactionId, 'providerTransactionId');
    const requestId = randomUUID();
    if (this.#config.mode === 'mock')
      return {
        requestId,
        paymentId,
        status: request.amount === 9992 ? 'PENDING' : 'SUCCESS',
        providerStatusCode: request.amount === 9992 ? 'OTS0551' : 'OTS0000',
        providerTransactionId: request.providerTransactionId ?? 'MOCK_ATOM_' + paymentId,
      };
    if (!request.providerTransactionId)
      throw new NttValidationError(
        'providerTransactionId (Atom transaction ID) is required for the OTS requery API',
      );
    const c = this.#config.credentials;
    const payload = {
      payInstrument: {
        headDetails: { api: 'TXNVERIFICATION', source: 'OTS' },
        merchDetails: {
          merchId: Number(c.merchantId),
          password: c.transactionPassword,
          merchTxnId: paymentId,
          merchTxnDate: transactionDate,
        },
        payDetails: {
          amount: request.amount,
          txnCurrency,
          atomTxnId: request.providerTransactionId,
          signature: sign(
            c.merchantId +
              c.transactionPassword +
              paymentId +
              request.amount.toFixed(2) +
              txnCurrency +
              'TXNVERIFICATION',
            c.requestHashKey,
          ),
        },
      },
    };
    const data = instrument(
      await this.call(this.#config.statusPath, payload, requestId),
      requestId,
    );
    const code = required(record(data.responseDetails).statusCode, 'statusCode', requestId);
    const status = paymentStatus(code, requestId);
    const merchant = record(data.merchDetails),
      pay = record(data.payDetails);
    if (
      required(merchant.merchId, 'merchId', requestId) !== c.merchantId ||
      required(merchant.merchTxnId, 'merchTxnId', requestId) !== paymentId ||
      Number(pay.amount) !== request.amount ||
      required(pay.atomTxnId, 'atomTxnId', requestId) !== request.providerTransactionId
    ) {
      throw new NttRequestError(
        'NTT status response does not match the requested payment',
        undefined,
        requestId,
      );
    }
    if (pay.txnCurrency !== undefined && pay.txnCurrency !== txnCurrency)
      throw new NttRequestError('NTT status currency mismatch', undefined, requestId);
    const bankTransactionId = scalar(
      record(record(data.payModeSpecificData).bankDetails).bankTxnId,
    );
    return {
      requestId,
      paymentId,
      status,
      providerStatusCode: code,
      providerPaymentId: request.providerTransactionId,
      providerTransactionId: request.providerTransactionId,
      ...(bankTransactionId ? { bankTransactionId } : {}),
    };
  }

  async createRefund(request: RefundRequest): Promise<RefundResult> {
    id(request?.refundId, 'refundId', 45);
    id(request?.paymentId, 'paymentId');
    id(request?.providerTransactionId, 'providerTransactionId');
    money(request.amount);
    const txnCurrency = currency(request.currency),
      requestId = randomUUID();
    if (this.#config.mode === 'mock')
      return {
        requestId,
        refundId: request.refundId,
        status: 'PENDING',
        providerRefundId: 'MOCK_REF_' + request.refundId,
        providerStatusCode: 'OTS0000',
      };
    const c = this.#config.credentials;
    const payload = {
      payInstrument: {
        headDetails: { api: 'REFUNDINIT', source: 'OTS' },
        merchDetails: {
          merchId: Number(c.merchantId),
          password: c.transactionPassword,
          merchTxnId: request.paymentId,
        },
        payDetails: {
          atomTxnId: request.providerTransactionId,
          totalRefundAmount: request.amount,
          txnCurrency,
          signature: sign(
            c.merchantId +
              c.transactionPassword +
              request.paymentId +
              request.amount.toFixed(2) +
              txnCurrency +
              'REFUNDINIT',
            c.requestHashKey,
          ),
          prodDetails: [
            {
              prodName: this.#config.productId,
              prodRefundAmount: request.amount,
              prodRefundId: request.refundId,
            },
          ],
        },
      },
    };
    const data = instrument(
      await this.call(this.#config.refundPath, payload, requestId),
      requestId,
    );
    const code = required(record(data.responseDetails).statusCode, 'statusCode', requestId);
    if (!['OTS0000', 'OTS0001'].includes(code))
      throw new NttRequestError(
        'NTT did not confirm refund initiation; query before retrying',
        undefined,
        requestId,
        { providerStatusCode: code },
      );
    const pay = record(data.payDetails);
    this.assertAtom(pay, request.providerTransactionId, requestId);
    const products = Array.isArray(pay.prodDetails) ? pay.prodDetails.map(record) : [];
    const matches = products.filter(
      (p) => scalar(p.prodRefundId) === request.refundId && p.prodName === this.#config.productId,
    );
    const product = matches[0];
    if (matches.length !== 1 || !product || Number(product.prodRefundAmount) !== request.amount)
      throw new NttRequestError(
        'NTT refund response does not match requested refund',
        undefined,
        requestId,
      );
    const productCode = required(product.prodStatusCode, 'prodStatusCode', requestId);
    if (!['OTS0000', 'OTS0001'].includes(productCode))
      throw new NttRequestError('NTT rejected the product refund', undefined, requestId, {
        providerStatusCode: productCode,
      });
    return {
      requestId,
      refundId: request.refundId,
      status: 'PENDING',
      providerRefundId: required(product.refundTxnId, 'refundTxnId', requestId),
      providerStatusCode: code,
    };
  }

  async getRefundStatus(request: RefundStatusRequest): Promise<RefundResult> {
    id(request?.refundId, 'refundId', 45);
    id(request?.paymentId, 'paymentId');
    id(request?.providerTransactionId, 'providerTransactionId');
    if (request.providerRefundId !== undefined) id(request.providerRefundId, 'providerRefundId');
    const requestId = randomUUID();
    if (this.#config.mode === 'mock')
      return {
        requestId,
        refundId: request.refundId,
        status: 'SUCCESS',
        providerRefundId: request.providerRefundId ?? 'MOCK_REF_' + request.refundId,
        providerStatusCode: 'OTS0000',
      };
    const c = this.#config.credentials;
    const payload = {
      payInstrument: {
        headDetails: { api: 'REFUNDSTATUS', source: 'OTS_ARS' },
        merchDetails: {
          merchId: Number(c.merchantId),
          password: Buffer.from(c.transactionPassword).toString('base64'),
        },
        payDetails: {
          atomTxnId: request.providerTransactionId,
          prodDetails: [{ prodName: this.#config.productId }],
        },
      },
    };
    const data = instrument(
      await this.call(this.#config.refundStatusPath, payload, requestId),
      requestId,
    );
    const code = required(record(data.responseDetails).statusCode, 'statusCode', requestId);
    if (!['OTS0000', 'OTS0001'].includes(code))
      throw new NttRequestError(
        'NTT rejected the refund query; refund state is unchanged',
        undefined,
        requestId,
        { providerStatusCode: code },
      );
    this.assertAtom(record(data.payDetails), request.providerTransactionId, requestId);
    const details = record(data.refundStatusDetails).refundDetails;
    if (!Array.isArray(details))
      throw new NttRequestError('NTT response is missing refundDetails', undefined, requestId);
    const matches = details
      .map(record)
      .filter((p) => p.prodName === this.#config.productId)
      .flatMap((p) => (Array.isArray(p.refundStatus) ? p.refundStatus.map(record) : []))
      .filter(
        (p) =>
          scalar(p.prodRefundId) === request.refundId &&
          (!request.providerRefundId || scalar(p.refundTxnId) === request.providerRefundId),
      );
    const match = matches[0];
    if (matches.length !== 1 || !match)
      throw new NttRequestError(
        'Requested refund was not found or is ambiguous; supply its providerRefundId',
        undefined,
        requestId,
      );
    const remarks = required(match.remarks, 'remarks', requestId).trim().toUpperCase();
    // Exact values only: NOT PROCESSED must never match PROCESSED.
    const status = [
      'SUCCESS',
      'REFUND SUCCESS',
      'REFUND SUCCESSFUL',
      'REFUND PROCESSED',
      'PROCESSED',
    ].includes(remarks)
      ? 'SUCCESS'
      : ['FAILED', 'REFUND FAILED', 'REFUND REJECTED', 'REJECTED'].includes(remarks)
        ? 'FAILED'
        : 'PENDING';
    return {
      requestId,
      refundId: request.refundId,
      status,
      providerRefundId: required(match.refundTxnId, 'refundTxnId', requestId),
      providerStatusCode: code,
    };
  }

  async getSettlementReport(request: SettlementReportRequest): Promise<SettlementReportResult> {
    if (Boolean(request?.settlementDate) === Boolean(request?.providerTransactionId))
      throw new NttValidationError('Provide exactly one settlementDate or providerTransactionId');
    if (request.settlementDate) dateOnly(request.settlementDate);
    if (request.providerTransactionId) id(request.providerTransactionId, 'providerTransactionId');
    const requestId = randomUUID(),
      c = this.#config.credentials;
    if (this.#config.mode === 'mock')
      return {
        requestId,
        records: [
          {
            merchantID: 'MOCK',
            atomTxnID: request.providerTransactionId ?? 'MOCK_ATOM',
            settlementDate:
              request.settlementDate ?? dateOnly(new Date().toISOString().slice(0, 10)),
            paymentStatus: 'PAYMENT GIVEN',
          },
        ],
      };
    const plain =
      'merchantId=' +
      c.merchantId +
      '|settlementDate=' +
      (request.settlementDate ?? '') +
      '|transactionId=' +
      (request.providerTransactionId ?? '') +
      '|responseType=json';
    const body = await this.#transport.settlement(
      this.#config.settlementUrl,
      c.merchantId,
      await encrypt(plain, c.requestEncryptionKey, c.requestSalt),
      requestId,
    );
    const parsed = await this.decode(body, requestId);
    if (!Array.isArray(parsed))
      throw new NttRequestError(
        'NTT settlement response must be an array of records',
        undefined,
        requestId,
      );
    const records = parsed.map(record);
    if (
      records.some(
        (r) =>
          scalar(r.merchantID) !== c.merchantId ||
          !scalar(r.atomTxnID) ||
          !scalar(r.paymentStatus) ||
          (request.providerTransactionId && scalar(r.atomTxnID) !== request.providerTransactionId),
      )
    )
      throw new NttRequestError(
        'NTT returned invalid or mismatched settlement records',
        undefined,
        requestId,
      );
    return { requestId, records };
  }

  private assertAtom(pay: Record<string, unknown>, expected: string, requestId: string): void {
    if (required(pay.atomTxnId, 'atomTxnId', requestId) !== expected)
      throw new NttRequestError(
        'NTT response transaction does not match request',
        undefined,
        requestId,
      );
  }
  private async call(
    path: string,
    payload: unknown,
    requestId: string,
    query = true,
  ): Promise<unknown> {
    const c = this.#config.credentials;
    const encData = await encrypt(JSON.stringify(payload), c.requestEncryptionKey, c.requestSalt);
    return this.decode(
      await this.#transport.encryptedPost(
        path,
        { encData, merchantId: c.merchantId },
        requestId,
        query,
      ),
      requestId,
    );
  }
  private async decode(payload: string, requestId: string): Promise<unknown> {
    const c = this.#config.credentials;
    try {
      return JSON.parse(await decrypt(payload, c.responseEncryptionKey, c.responseSalt));
    } catch {
      throw new NttRequestError('NTT returned an invalid encrypted response', undefined, requestId);
    }
  }
}

export const createNtt = (options?: NttOptions): Ntt => new Ntt(options);
