import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('installed example creates a stable mock order and deduplicates fulfillment',async()=>{
  const reservation=createServer();
  await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  const env={...process.env,NODE_ENV:'development',PORT:String(port)};
  for(const name of Object.keys(env)) if(name.startsWith('NTT_') || name==='PUBLIC_ORIGIN') delete env[name];
  env.NTT_MODE='mock';
  const path=fileURLToPath(new URL('../examples/server.mjs',import.meta.resolve('@paypilot/ntt')));
  const child=spawn(process.execPath,[path],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  const exited=once(child,'exit');
  let errors='';
  child.stderr.on('data',data=>{errors+=data;});
  try {
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Demo startup timed out: '+errors)),10000);
      child.stdout.on('data',data=>{if(String(data).includes('Demo:')){clearTimeout(timeout);resolve();}});
      child.once('exit',()=>{clearTimeout(timeout);reject(new Error('Demo exited: '+errors));});
      child.once('error',error=>{clearTimeout(timeout);reject(error);});
    });
    const origin='http://localhost:'+port, target='http://127.0.0.1:'+port;
    assert.equal((await fetch(target)).status,200);
    assert.equal((await fetch(target+'/checkout.js')).status,200);
    const first=await fetch(target+'/payments',{method:'POST',headers:{origin}});
    assert.equal(first.status,200);
    const cookie=first.headers.get('set-cookie').split(';')[0];
    const a=await first.json();
    const second=await fetch(target+'/payments',{method:'POST',headers:{origin,cookie}});
    const b=await second.json();
    assert.equal(a.payment.paymentId,b.payment.paymentId);
    assert.equal(a.payment.checkout.token,b.payment.checkout.token);
    for(const status of ['SUCCESS','SUCCESS','FAILED']) {
      const result=await fetch(target+'/simulate',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({status})});
      assert.equal((await result.json()).status,'SUCCESS');
    }
  } finally {
    child.kill();
    await exited;
  }
});
