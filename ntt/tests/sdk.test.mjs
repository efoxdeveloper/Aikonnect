import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { inspect } from 'node:util';
import { Ntt } from '@paypilot/ntt';
import {
  options,
  payment,
  authResponse,
  callback,
  response,
  encryptResponse,
  decryptRequest,
  statusRequest,
  statusResponse,
  refundRequest,
  refundResponse,
  refundStatus,
} from './fixtures.mjs';

const client = (value) => new Ntt({ ...options, fetch: async () => response(value) });
test('ESM and CommonJS exports load independently', () => {
  assert.equal(typeof Ntt, 'function');
  assert.equal(typeof createRequire(import.meta.url)('@paypilot/ntt').Ntt, 'function');
  assert.equal(
    typeof createRequire(import.meta.url)('@paypilot/ntt/checkout').openCheckout,
    'function',
  );
});
test('default sandbox is available outside production', async () => {
  assert.equal((await new Ntt().payments.create(payment)).status, 'INITIATED');
});
test('production rejects missing mode and explicit mock', () => {
  process.env.NODE_ENV = 'production';
  try {
    for (const config of [{}, { mode: 'mock' }])
      assert.throws(() => new Ntt(config), { code: 'NTT_CONFIGURATION_ERROR' });
  } finally {
    process.env.NODE_ENV = 'test';
  }
});
test('configuration rejects environment conflict, insecure URL and missing bearer', () => {
  for (const config of [
    { ...options, environment: 'PRODUCTION' },
    { ...options, baseUrl: 'http://example.com' },
    { ...options, apiSecretKey: '' },
  ]) {
    assert.throws(() => new Ntt(config), { code: 'NTT_CONFIGURATION_ERROR' });
  }
});
test('credentialed client cannot silently default to mock', () =>
  assert.throws(() => new Ntt({ merchantId: '123456' }), { code: 'NTT_CONFIGURATION_ERROR' }));
test('logs and serialization do not expose credentials', () => {
  const ntt = new Ntt(options);
  for (const output of [
    JSON.stringify(ntt),
    inspect(ntt),
    inspect(ntt, { showHidden: true, depth: 10 }),
  ]) {
    assert.ok(!output.includes('fixture-'));
  }
});
test('encrypted auth request uses correct form, HMAC credentials and response', async () => {
  const ntt = new Ntt({
    ...options,
    fetch: async (url, init) => {
      assert.equal(String(url), 'https://paynetzuat.atomtech.in/otsv2/aipay/auth');
      assert.equal(init.redirect, 'error');
      assert.equal(
        init.headers.Authorization,
        'Bearer ' + Buffer.from('123456:fixture-bearer').toString('base64'),
      );
      assert.equal(JSON.parse(decryptRequest(init, url)).payInstrument.payDetails.amount, '10.00');
      return new Response('encData=' + encryptResponse(authResponse) + '&merchId=123456');
    },
  });
  const result = await ntt.payments.create(payment);
  assert.equal(result.checkout.token, 'TOKEN_1');
  assert.match(result.transactionDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(result.createdAt && result.requestId);
});
test('auth denial with token cannot be mistaken for successful initialization', async () => {
  await assert.rejects(
    client({ ...authResponse, responseDetails: { txnStatusCode: 'OTS0522' } }).payments.create(
      payment,
    ),
    (e) => e.code === 'NTT_REQUEST_ERROR' && e.details.providerStatusCode === 'OTS0522',
  );
});
test('invalid ciphertext is rejected without losing request ID', async () => {
  const ntt = new Ntt({ ...options, fetch: async () => new Response('encData=garbage') });
  await assert.rejects(
    ntt.payments.create(payment),
    (e) => e.code === 'NTT_REQUEST_ERROR' && Boolean(e.requestId),
  );
});
for (const amount of [0, -1, 0.001, 1.001, NaN, Infinity, 10000000000])
  test('rejects invalid amount ' + amount, async () => {
    await assert.rejects(new Ntt({ mode: 'mock' }).payments.create({ ...payment, amount }), {
      code: 'NTT_VALIDATION_ERROR',
    });
  });
test('ordinary decimal major-unit amount remains accepted', async () =>
  assert.equal(
    (await new Ntt({ mode: 'mock' }).payments.create({ ...payment, amount: 19.99 })).status,
    'INITIATED',
  ));
test('valid callback normalizes IDs, amount, merchant and currency', async () => {
  const result = await new Ntt(options).payments.verifyCallback(
    { encData: encryptResponse(callback()) },
    { paymentId: 'ORDER_1', amount: 10, currency: 'INR' },
  );
  assert.equal(result.providerTransactionId, '11000000000001');
  assert.equal(result.bankTransactionId, 'BANK_1');
  assert.equal(result.amount, 10);
  assert.equal(result.status, 'SUCCESS');
});
test('form and Buffer callbacks work', async () => {
  const body = 'encData=' + encryptResponse(callback());
  for (const value of [body, Buffer.from(body)])
    assert.equal((await new Ntt(options).payments.verifyCallback(value)).status, 'SUCCESS');
});
test('tampered signature and wrong merchant are rejected', async () => {
  const tampered = callback();
  tampered.payInstrument.merchDetails.merchTxnId = 'ORDER_OTHER';
  for (const value of [tampered, callback({ merchantId: '999999' })])
    await assert.rejects(
      new Ntt(options).payments.verifyCallback({ encData: encryptResponse(value) }),
      { code: 'NTT_CALLBACK_ERROR' },
    );
});
test('callback bound to stored order and amount', async () => {
  for (const expected of [
    { paymentId: 'OTHER', amount: 10 },
    { paymentId: 'ORDER_1', amount: 9 },
    { paymentId: 'ORDER_1', amount: 10, currency: 'USD' },
  ]) {
    await assert.rejects(
      new Ntt(options).payments.verifyCallback({ encData: encryptResponse(callback()) }, expected),
      { code: 'NTT_CALLBACK_ERROR' },
    );
  }
});
test('replay verification is deterministic; host deduplicates fulfillment', async () => {
  const ntt = new Ntt(options),
    body = { encData: encryptResponse(callback()) };
  const a = await ntt.payments.verifyCallback(body),
    b = await ntt.payments.verifyCallback(body);
  assert.equal(a.providerTransactionId, b.providerTransactionId);
});
test('mock supports deterministic timeout, failure, pending, success', async () => {
  const ntt = new Ntt({ mode: 'mock' });
  await assert.rejects(ntt.payments.create({ ...payment, amount: 9993 }), { code: 'NTT_TIMEOUT' });
  await assert.rejects(ntt.payments.create({ ...payment, metadata: { mockScenario: 'TIMEOUT' } }), {
    code: 'NTT_TIMEOUT',
  });
  await assert.rejects(ntt.payments.create({ ...payment, amount: 9991 }), {
    code: 'NTT_REQUEST_ERROR',
  });
  assert.equal((await ntt.payments.create({ ...payment, amount: 9992 })).status, 'PENDING');
  assert.equal((await ntt.payments.create({ ...payment, amount: 9994 })).status, 'SUCCESS');
});
test('requery requires original date and Atom reference', async () => {
  const noDate = { ...statusRequest };
  delete noDate.transactionDate;
  await assert.rejects(client(statusResponse()).payments.status(noDate), {
    code: 'NTT_VALIDATION_ERROR',
  });
  await assert.rejects(
    client(statusResponse()).payments.status({
      ...statusRequest,
      providerTransactionId: undefined,
    }),
    { code: 'NTT_VALIDATION_ERROR' },
  );
});
test('requery converts original timestamp to India date and signs correct request', async () => {
  const ntt = new Ntt({
    ...options,
    fetch: async (url, init) => {
      const data = JSON.parse(decryptRequest(init, url)).payInstrument;
      assert.equal(data.merchDetails.merchTxnDate, '2026-09-02');
      assert.equal(data.payDetails.atomTxnId, '11000000000001');
      assert.match(data.payDetails.signature, /^[a-f0-9]{128}$/);
      return response(statusResponse());
    },
  });
  const request = { ...statusRequest };
  delete request.transactionDate;
  assert.equal(
    (await ntt.payments.status({ ...request, createdAt: '2026-09-01T20:00:00Z' })).status,
    'SUCCESS',
  );
});
for (const [code, status] of [
  ['OTS0002', 'SUCCESS'],
  ['OTS0201', 'PENDING'],
  ['OTS0551', 'PENDING'],
  ['OTS0001', 'FAILED'],
  ['OTS0101', 'CANCELLED'],
])
  test('maps documented code ' + code, async () => {
    assert.equal(
      (await client(statusResponse(code)).payments.status(statusRequest)).status,
      status,
    );
  });
test('empty, unknown-code and mismatched requery responses fail closed', async () => {
  const wrong = statusResponse();
  wrong.payInstrument[0].merchDetails.merchTxnId = 'OTHER';
  for (const value of [{}, statusResponse('OTS9999'), wrong])
    await assert.rejects(client(value).payments.status(statusRequest), {
      code: 'NTT_REQUEST_ERROR',
    });
});
test('callback Atom ID flows into refund request', async () => {
  const ntt = new Ntt({
    ...options,
    fetch: async (url, init) => {
      assert.equal(
        JSON.parse(decryptRequest(init, url)).payInstrument.payDetails.atomTxnId,
        '11000000000001',
      );
      return response(refundResponse());
    },
  });
  const cb = await ntt.payments.verifyCallback({ encData: encryptResponse(callback()) });
  assert.equal(
    (
      await ntt.refunds.create({
        ...refundRequest,
        providerTransactionId: cb.providerTransactionId,
      })
    ).providerRefundId,
    'R100',
  );
});
test('refund creation response must identify the requested refund', async () => {
  const wrong = refundResponse();
  wrong.payInstrument.payDetails.prodDetails[0].prodRefundId = 'OTHER';
  await assert.rejects(client(wrong).refunds.create(refundRequest), { code: 'NTT_REQUEST_ERROR' });
});
test('refund status cannot borrow another refund success', async () => {
  await assert.rejects(client(refundStatus('SUCCESS', 'OTHER')).refunds.status(refundRequest), {
    code: 'NTT_REQUEST_ERROR',
  });
});

test('duplicate refund identifiers require explicit disambiguation',async()=>{
  const value=refundStatus('SUCCESS');
  value.payInstrument.refundStatusDetails.refundDetails[0].refundStatus.push({prodRefundId:'REF_1',refundTxnId:'R200',remarks:'FAILED'});
  await assert.rejects(client(value).refunds.status(refundRequest),{code:'NTT_REQUEST_ERROR'});
  assert.equal((await client(value).refunds.status({...refundRequest,providerRefundId:'R100'})).status,'SUCCESS');
});
test('refund status requires both supplied identifiers to match', async () => {
  await assert.rejects(
    client(refundStatus('SUCCESS')).refunds.status({ ...refundRequest, providerRefundId: 'OTHER' }),
    { code: 'NTT_REQUEST_ERROR' },
  );
});
test('refund remarks use exact states instead of substring success', async () => {
  assert.equal(
    (await client(refundStatus('NOT PROCESSED')).refunds.status(refundRequest)).status,
    'PENDING',
  );
  assert.equal(
    (await client(refundStatus('REFUND PROCESSED')).refunds.status(refundRequest)).status,
    'SUCCESS',
  );
});
test('settlement checks status and validates array schema', async () => {
  const ntt = new Ntt({
    ...options,
    fetch: async () => new Response(encryptResponse([]), { status: 503 }),
  });
  await assert.rejects(
    ntt.settlements.report({ settlementDate: '2026-09-01' }),
    (e) => e.code === 'NTT_REQUEST_ERROR' && e.status === 503,
  );
  const bad = new Ntt({
    ...options,
    fetch: async () => new Response(encryptResponse({ error: 'denied' })),
  });
  await assert.rejects(bad.settlements.report({ settlementDate: '2026-09-01' }), {
    code: 'NTT_REQUEST_ERROR',
  });
});
test('settlement accepts matching records', async () => {
  const ntt = new Ntt({
    ...options,
    fetch: async () =>
      new Response(
        encryptResponse([
          { merchantID: '123456', atomTxnID: '11000000000001', paymentStatus: 'PAYMENT GIVEN' },
        ]),
      ),
  });
  assert.equal(
    (await ntt.settlements.report({ providerTransactionId: '11000000000001' })).records.length,
    1,
  );
});
test('stream/body timeout remains an SDK error with request ID', async () => {
  const ntt = new Ntt({
    ...options,
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new DOMException('fixture', 'TimeoutError'));
          },
        }),
      ),
  });
  await assert.rejects(
    ntt.payments.create(payment),
    (e) => e.code === 'NTT_TIMEOUT' && Boolean(e.requestId),
  );
});
test('HTTP errors retain request correlation without response secrets', async () => {
  const ntt = new Ntt({
    ...options,
    fetch: async () => new Response('fixture-bearer', { status: 401 }),
  });
  await assert.rejects(
    ntt.payments.create(payment),
    (e) =>
      e.status === 401 && Boolean(e.requestId) && !JSON.stringify(e).includes('fixture-bearer'),
  );
});
test('oversized responses are bounded', async () => {
  const ntt = new Ntt({
    ...options,
    maxResponseBytes: 1024,
    fetch: async () => new Response('x'.repeat(2048)),
  });
  await assert.rejects(ntt.payments.create(payment), { code: 'NTT_REQUEST_ERROR' });
});
test('mutating network failure is not automatically retried', async () => {
  let calls = 0;
  const ntt = new Ntt({
    ...options,
    fetch: async () => {
      calls++;
      throw new Error('sensitive url');
    },
  });
  await assert.rejects(
    ntt.payments.create(payment),
    (e) => e.code === 'NTT_REQUEST_ERROR' && !e.message.includes('sensitive'),
  );
  assert.equal(calls, 1);
});
