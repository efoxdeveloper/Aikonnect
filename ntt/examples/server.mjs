import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Ntt, NttError } from '@paypilot/ntt';

// Local demonstration only. Production requires durable orders and authenticated routes.
if (process.env.NODE_ENV === 'production')
  throw new Error('This in-memory demo is for local/UAT development only');
const ntt = new Ntt();
const port = Number(process.env.PORT || 3000);
const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:' + port;
const orders = new Map();
const customer = { email: 'buyer@example.com', mobile: '9876543210' };
const html = await readFile(new URL('./index.html', import.meta.url));
const checkoutScript = await readFile(new URL('../dist/checkout.js', import.meta.url));

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 262144) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      res.end(html);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/checkout.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end(checkoutScript);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/payments') {
      if (req.headers.origin !== origin) return json(res, 403, { error: 'Origin mismatch' });
      // A server-issued cookie identifies this demo order. Prices never come from the browser.
      const cookie = /(?:^|;\s*)demo_order=([a-f0-9-]+)/.exec(req.headers.cookie ?? '')?.[1];
      let order = cookie ? orders.get(cookie) : undefined;
      if (!order) {
        const orderId = randomUUID();
        order = { orderId, amount: 10, status: 'CREATED' };
        orders.set(orderId, order);
        res.setHeader('set-cookie', 'demo_order=' + orderId + '; HttpOnly; SameSite=Lax; Path=/');
      }
      // Retain the same promise, including uncertain errors: do not issue duplicate mutations.
      order.creation ??= ntt.payments.create({
        orderId: order.orderId,
        amount: order.amount,
        customer,
        returnUrl: origin + '/callback?order=' + encodeURIComponent(order.orderId),
      });
      const payment = await order.creation;
      order.payment = payment;
      return json(res, 200, { payment, customer });
    }
    if (req.method === 'POST' && url.pathname === '/callback') {
      const order = orders.get(url.searchParams.get('order'));
      if (!order) return json(res, 404, { error: 'Unknown order' });
      const result = await ntt.payments.verifyCallback(await body(req), {
        paymentId: order.orderId,
        amount: order.amount,
        currency: 'INR',
      });
      // A production implementation does this in a DB transaction and enqueues fulfillment once.
      if (result.status === 'SUCCESS' && order.status !== 'SUCCESS') {
        order.status = 'SUCCESS';
        order.atomId = result.providerTransactionId;
      }
      return json(res, 200, {
        paymentId: order.orderId,
        status: order.status,
        verifiedStatus: result.status,
      });
    }
    if (
      req.method === 'POST' &&
      url.pathname === '/simulate' &&
      ntt.configuration.mode === 'mock'
    ) {
      if (req.headers.origin !== origin) return json(res, 403, { error: 'Origin mismatch' });
      const cookie = /(?:^|;\s*)demo_order=([a-f0-9-]+)/.exec(req.headers.cookie ?? '')?.[1];
      const order = orders.get(cookie);
      if (!order) return json(res, 404, { error: 'Create an order first' });
      const input = JSON.parse(await body(req));
      if (!['SUCCESS', 'FAILED', 'PENDING'].includes(input.status))
        return json(res, 400, { error: 'Invalid scenario' });
      const result = await ntt.payments.verifyCallback(
        { paymentId: order.orderId, amount: order.amount, currency: 'INR', status: input.status },
        { paymentId: order.orderId, amount: order.amount },
      );
      if (order.status !== 'SUCCESS') order.status = result.status;
      return json(res, 200, { status: order.status });
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    json(res, error instanceof NttError ? 400 : 500, {
      error: error instanceof NttError ? error.message : 'Request failed',
      ...(error instanceof NttError ? { code: error.code, requestId: error.requestId } : {}),
    });
  }
}).listen(port, '127.0.0.1', () =>
  console.log('Demo: http://localhost:' + port + ' (' + ntt.configuration.mode + ')'),
);
