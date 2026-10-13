import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCheckout } from '@paypilot/ntt/checkout';

test('browser helper validates input, recovers from load failure and shares concurrent script loading', async () => {
  await assert.rejects(openCheckout({}), /browser/);
  const options = {checkout:{type:'SDK_TOKEN',token:'TOKEN',merchantId:'123456',environment:'UAT',returnUrl:'https://merchant.example/callback'},customer:{email:'buyer@example.com',mobile:'9876543210'}};
  const calls=[];
  let fail=true, appended=0;
  globalThis.window={};
  globalThis.document={
    createElement:()=>({remove(){}}),
    head:{appendChild(script){
      appended++;
      setTimeout(()=>{
        if(fail) script.onerror();
        else {
          window.AtomPaynetz=class {constructor(settings,environment){calls.push({settings,environment});}};
          script.onload();
        }
      },0);
    }},
  };
  try {
    await assert.rejects(openCheckout({...options,checkout:{...options.checkout,environment:'MOCK'}}),/simulate mock/);
    await assert.rejects(openCheckout(options),/Unable to load/);
    fail=false;
    await Promise.all([openCheckout(options),openCheckout(options)]);
    assert.equal(appended,2);
    assert.equal(calls.length,2);
    assert.equal(calls[0].settings.atomTokenId,'TOKEN');
    assert.equal(calls[0].environment,'uat');
    await assert.rejects(openCheckout({...options,checkout:{...options.checkout,environment:'PRODUCTION'}}),/switching/);
  } finally {
    delete globalThis.window;delete globalThis.document;
  }
});
