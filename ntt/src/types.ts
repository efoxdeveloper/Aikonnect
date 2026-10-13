export type NttMode = 'mock' | 'uat' | 'live';

export type NttPaymentStatus =
  'INITIATED' | 'PENDING' | 'AUTHORIZED' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

export type NttRefundStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface NttOptions {
  mode?: NttMode;
  environment?: string;
  baseUrl?: string;
  authPath?: string;
  statusPath?: string;
  refundPath?: string;
  refundStatusPath?: string;
  settlementUrl?: string;
  productId?: string;
  merchantId?: string;
  userId?: string;
  apiSecretKey?: string;
  transactionPassword?: string;
  requestEncryptionKey?: string;
  requestSalt?: string;
  responseEncryptionKey?: string;
  responseSalt?: string;
  requestHashKey?: string;
  responseHashKey?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetch?: typeof globalThis.fetch;
}

export interface NttCustomer {
  email: string;
  mobile: string;
  name?: string;
}

export interface CreatePaymentRequest {
  orderId: string;
  amount: number;
  currency?: string;
  customer: NttCustomer;
  returnUrl?: string;
  metadata?: Record<string, string>;
}

export interface NttCheckout {
  type: 'SDK_TOKEN';
  token: string;
  merchantId: string;
  environment: string;
  returnUrl?: string;
}

export interface CreatePaymentResult {
  requestId: string;
  createdAt: string;
  transactionDate: string;
  paymentId: string;
  orderId: string;
  status: NttPaymentStatus;
  checkout?: NttCheckout;
  providerPaymentId?: string;
  providerTransactionId?: string;
  providerStatusCode?: string;
}

export interface PaymentStatusRequest {
  paymentId?: string;
  orderId?: string;
  amount: number;
  currency?: string;
  providerTransactionId?: string;
  createdAt?: Date | string;
  transactionDate?: string;
}

export interface PaymentStatusResult {
  requestId: string;
  bankTransactionId?: string;
  paymentId: string;
  status: NttPaymentStatus;
  providerStatusCode: string;
  providerPaymentId?: string;
  providerTransactionId?: string;
}

export interface VerifiedCallback {
  requestId: string;
  merchantId: string;
  amount: number;
  totalAmount: number;
  currency: string;
  bankTransactionId: string;
  paymentId: string;
  orderId: string;
  status: NttPaymentStatus;
  providerPaymentId: string;
  providerTransactionId: string;
  providerStatusCode: string;
  raw: unknown;
}

export interface RefundRequest {
  refundId: string;
  paymentId: string;
  amount: number;
  currency?: string;
  providerTransactionId: string;
}

export interface RefundResult {
  requestId: string;
  refundId: string;
  status: NttRefundStatus;
  providerRefundId?: string;
  providerStatusCode: string;
}

export interface RefundStatusRequest {
  refundId: string;
  paymentId: string;
  providerTransactionId: string;
  providerRefundId?: string;
}

export interface SettlementReportRequest {
  settlementDate?: string;
  providerTransactionId?: string;
}

export interface SettlementReportResult {
  requestId: string;
  records: Array<Record<string, unknown>>;
}

/** Compare these values with the order persisted by your server, never browser input. */
export interface ExpectedPayment {
  paymentId: string;
  amount: number;
  currency?: string;
}

export interface NttConfigView {
  mode: NttMode;
  environment: string;
  baseUrl: string;
  productId: string;
  merchantId: string;
  configured: boolean;
}
