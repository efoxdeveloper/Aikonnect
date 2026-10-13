export interface NttCredentials {
  merchantId: string;
  userId: string;
  apiSecretKey: string;
  transactionPassword: string;
  requestEncryptionKey: string;
  requestSalt: string;
  responseEncryptionKey: string;
  responseSalt: string;
  requestHashKey: string;
  responseHashKey: string;
}

export interface NttAuthResponse {
  encData: string;
}

export interface NttAuthRequest {
  encData: string;
  merchantId: string;
}

export interface NttAuthRequestDraft {
  payInstrument: {
    headDetails: { version: 'OTSv1.1'; api: 'AUTH'; platform: 'FLASH' };
    merchDetails: {
      merchId: string;
      userId: string;
      password: string;
      merchTxnId: string;
      merchTxnDate: string;
    };
    payDetails: { amount: string; product: string; custAccNo: string; txnCurrency: string };
    custDetails: { custEmail: string; custMobile: string };
    extras: Record<string, string>;
  };
}
