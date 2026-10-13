import { NttError, NttRequestError, NttTimeoutError } from './errors.js';
import type { NttConfig } from './config.js';
import type { NttAuthRequest } from './internal-types.js';

export class NttTransport {
  #config: NttConfig;
  constructor(config: NttConfig) {
    this.#config = config;
  }

  async encryptedPost(
    path: string,
    payload: NttAuthRequest,
    requestId: string,
    query = false,
  ): Promise<string> {
    const body = new URLSearchParams({ encData: payload.encData, merchId: payload.merchantId });
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const credentials = this.#config.credentials;
    if (credentials.apiSecretKey)
      headers.Authorization =
        'Bearer ' +
        Buffer.from(credentials.merchantId + ':' + credentials.apiSecretKey).toString('base64');
    const url = new URL(path, this.#config.baseUrl);
    if (query) url.search = body.toString();
    const text = await this.request(
      url,
      { method: 'POST', headers, ...(!query ? { body } : {}) },
      requestId,
    );
    let encData: unknown;
    let parsedBody: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedBody = parsed as Record<string, unknown>;
        encData = parsedBody.encData;
      }
    } catch {
      /* NTT also returns form data or bare hex. */
    }
    if (!parsedBody && text.includes('=')) {
      const form = new URLSearchParams(text);
      const formEntries = Object.fromEntries(form.entries());
      parsedBody = formEntries;
      encData = form.get('encData') ?? undefined;
    }
    const providerStatusCode = parsedBody?.txnStatusCode ?? parsedBody?.statusCode;
    const providerMessage = parsedBody?.txnDescription ?? parsedBody?.txnMessage ?? parsedBody?.message;
    if (!encData && (providerStatusCode !== undefined || providerMessage !== undefined)) {
      throw new NttRequestError(
        `NTT rejected the request${providerStatusCode ? ` (${String(providerStatusCode)})` : ''}: ${String(providerMessage ?? 'unknown gateway error')}`,
        undefined,
        requestId,
        { providerStatusCode: providerStatusCode ? String(providerStatusCode) : undefined, providerMessage },
      );
    }
    encData ??= new URLSearchParams(text).get('encData');
    encData ??= /^[a-f0-9]+$/i.test(text) ? text : undefined;
    encData ??= /^[a-f0-9]+&merchId=\d+$/i.test(text) ? text.split('&')[0] : undefined;
    if (typeof encData !== 'string' || !encData)
      throw new NttRequestError('NTT response did not contain encData', undefined, requestId);
    return encData;
  }

  async settlement(
    url: string,
    merchantId: string,
    encData: string,
    requestId: string,
  ): Promise<string> {
    const target = new URL(url);
    target.searchParams.set('merchantId', merchantId);
    target.searchParams.set('encData', encData);
    return this.request(target, { method: 'POST' }, requestId);
  }

  private async request(url: URL, init: RequestInit, requestId: string): Promise<string> {
    const signal = AbortSignal.timeout(this.#config.timeoutMs);
    try {
      const response = await this.#config.fetch(url, {
        ...init,
        headers: {
          ...init.headers,
          Accept: 'application/json, text/plain, */*',
          'X-Request-Id': requestId,
        },
        signal,
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new NttRequestError(
          'NTT request failed; check gateway availability and credentials',
          response.status,
          requestId,
        );
      }
      const reader = response.body?.getReader();
      if (!reader)
        throw new NttRequestError('NTT returned an empty response', response.status, requestId);
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > this.#config.maxResponseBytes) {
            await reader.cancel();
            throw new NttRequestError(
              'NTT response exceeds maxResponseBytes',
              response.status,
              requestId,
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      return Buffer.concat(chunks).toString('utf8').trim();
    } catch (error) {
      if (error instanceof NttError) throw error;
      if (
        signal.aborted ||
        (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
      ) {
        throw new NttTimeoutError(
          'NTT request timed out; query the transaction before retrying a mutation',
          requestId,
        );
      }
      throw new NttRequestError('Unable to complete NTT request', undefined, requestId);
    }
  }
}
