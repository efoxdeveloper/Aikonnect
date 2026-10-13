import { createCipheriv, createDecipheriv, createHmac, pbkdf2Sync } from 'node:crypto';

// Synthetic fixtures; never load the repository .env or contact any gateway.
for (const name of Object.keys(process.env)) if (name.startsWith('NTT_')) delete process.env[name];
process.env.NODE_ENV = 'test';
export const options = {
  mode: 'uat',
  merchantId: '123456',
  userId: '123456',
  apiSecretKey: 'fixture-bearer',
  transactionPassword: 'fixture-password',
  requestEncryptionKey: 'fixture-request-key',
  responseEncryptionKey: 'fixture-response-key',
  requestHashKey: 'fixture-request-hash',
  responseHashKey: 'fixture-response-hash',
  requestSalt: 'fixture-request-salt',
  responseSalt: 'fixture-response-salt',
};
const iv = Buffer.from(Array.from({ length: 16 }, (_, i) => i));
const requestKey = pbkdf2Sync(
  options.requestEncryptionKey,
  options.requestSalt,
  65536,
  32,
  'sha512',
);
const responseKey = pbkdf2Sync(
  options.responseEncryptionKey,
  options.responseSalt,
  65536,
  32,
  'sha512',
);
export function encryptResponse(value) {
  const cipher = createCipheriv('aes-256-cbc', responseKey, iv);
  return Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]).toString(
    'hex',
  );
}
export function decryptRequest(init, url) {
  const cipher = createDecipheriv('aes-256-cbc', requestKey, iv);
  const enc = init.body?.get('encData') ?? new URL(url).searchParams.get('encData');
  return Buffer.concat([cipher.update(Buffer.from(enc, 'hex')), cipher.final()]).toString('utf8');
}
export const response = (value) =>
  new Response(JSON.stringify({ encData: encryptResponse(value) }), {
    headers: { 'content-type': 'application/json' },
  });
export const payment = {
  orderId: 'ORDER_1',
  amount: 10,
  customer: { email: 'buyer@example.com', mobile: '9876543210' },
};
export const statusRequest = {
  paymentId: 'ORDER_1',
  amount: 10,
  transactionDate: '2026-09-01',
  providerTransactionId: '11000000000001',
};
export const refundRequest = {
  refundId: 'REF_1',
  paymentId: 'ORDER_1',
  amount: 10,
  providerTransactionId: '11000000000001',
};
export const authResponse = {
  atomTokenId: 'TOKEN_1',
  responseDetails: { txnStatusCode: 'OTS0000' },
};
export function callback({ merchantId = '123456', amount = 10, code = 'OTS0000' } = {}) {
  const sig = createHmac('sha512', options.responseHashKey)
    .update(merchantId + '11000000000001' + 'ORDER_1' + amount.toFixed(2) + code + 'NB' + 'BANK_1')
    .digest('hex');
  return {
    payInstrument: {
      merchDetails: { merchId: merchantId, merchTxnId: 'ORDER_1' },
      payDetails: {
        atomTxnId: '11000000000001',
        totalAmount: amount,
        txnCurrency: 'INR',
        signature: sig,
      },
      responseDetails: { statusCode: code },
      payModeSpecificData: { subChannel: ['NB'], bankDetails: { bankTxnId: 'BANK_1' } },
    },
  };
}
export function statusResponse(code = 'OTS0000') {
  return {
    payInstrument: [
      {
        merchDetails: { merchId: '123456', merchTxnId: 'ORDER_1' },
        payDetails: { atomTxnId: '11000000000001', amount: 10 },
        responseDetails: { statusCode: code },
      },
    ],
  };
}
export function refundResponse() {
  return {
    payInstrument: {
      payDetails: {
        atomTxnId: '11000000000001',
        prodDetails: [
          {
            prodName: 'NSE',
            prodRefundId: 'REF_1',
            prodRefundAmount: 10,
            refundTxnId: 'R100',
            prodStatusCode: 'OTS0000',
          },
        ],
      },
      responseDetails: { statusCode: 'OTS0000' },
    },
  };
}
export function refundStatus(remark = 'REFUND INITIATED', refundId = 'REF_1') {
  return {
    payInstrument: {
      payDetails: { atomTxnId: '11000000000001' },
      responseDetails: { statusCode: 'OTS0000' },
      refundStatusDetails: {
        refundDetails: [
          {
            prodName: 'NSE',
            refundStatus: [{ prodRefundId: refundId, refundTxnId: 'R100', remarks: remark }],
          },
        ],
      },
    },
  };
}
