import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Ntt } from '@paypilot/ntt';
import { options, payment } from './fixtures.mjs';

test('actual streaming HTTP body is aborted at configured deadline', async()=>{
  const server=createServer((_req,res)=>{
    res.writeHead(200,{'content-type':'text/plain'});
    res.write('encData=');
    // Keep response open to test the timeout after headers have arrived.
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const target='http://127.0.0.1:'+server.address().port;
    const ntt=new Ntt({...options,timeoutMs:1000,fetch:(_url,init)=>fetch(target,init)});
    await assert.rejects(ntt.payments.create(payment),e=>e.code==='NTT_TIMEOUT'&&Boolean(e.requestId));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
