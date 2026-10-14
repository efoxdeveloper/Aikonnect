import type { NttCheckout, NttCustomer } from './types.js';

export interface CheckoutOptions {
  checkout: NttCheckout;
  customer: NttCustomer;
  returnUrl?: string;
  onClose?: () => void;
}

declare global {
  interface Window {
    AtomPaynetz?: new (options: Record<string, string>, environment: string) => unknown;
  }
}

let loading: Promise<void> | undefined;
let loadedEnvironment: string | undefined;

function observeCheckoutClose(existingFrames: Set<HTMLIFrameElement>, onClose?: () => void) {
  if (!onClose || typeof MutationObserver === 'undefined' || !document.body) return;
  let checkoutWasVisible = false;
  let finished = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(check);
  const isVisible = (frame: HTMLIFrameElement) => {
    if (!frame.isConnected) return false;
    let element: HTMLElement | null = frame;
    while (element) {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
        return false;
      element = element.parentElement;
    }
    const bounds = frame.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  };
  const checkoutFrames = () =>
    Array.from(document.querySelectorAll('iframe')).filter((frame) => !existingFrames.has(frame));
  const finish = () => {
    if (finished) return;
    finished = true;
    observer.disconnect();
    if (closeTimer) clearTimeout(closeTimer);
    onClose();
  };
  function check() {
    const frames = checkoutFrames();
    if (frames.some(isVisible)) {
      checkoutWasVisible = true;
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = undefined;
    } else if (checkoutWasVisible && !closeTimer) {
      // Let the SDK finish its hide animation and DOM cleanup before reporting close.
      closeTimer = setTimeout(finish, 250);
    }
  }
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'style', 'src'],
    childList: true,
    subtree: true,
  });
  check();
  setTimeout(() => observer.disconnect(), 20 * 60 * 1000);
}

/** Browser-only entry. No credentials, Node imports, or automatic payment confirmation. */
export async function openCheckout(options: CheckoutOptions): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined')
    throw new Error('openCheckout must run in the browser');
  const { checkout, customer } = options;
  if (!checkout || !['UAT', 'PRODUCTION'].includes(checkout.environment))
    throw new Error(
      'Real checkout requires UAT or PRODUCTION; simulate mock payments on your server',
    );
  if (!checkout.token || !checkout.merchantId || !customer?.email || !customer.mobile)
    throw new Error('Missing checkout token, merchant ID, or customer details');
  const returnUrl = options.returnUrl ?? checkout.returnUrl;
  if (!returnUrl) throw new Error('A server callback returnUrl is required');
  const url = new URL(returnUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (checkout.environment === 'PRODUCTION' && url.protocol !== 'https:')
  )
    throw new Error('Invalid checkout returnUrl');
  if (loadedEnvironment && loadedEnvironment !== checkout.environment)
    throw new Error('Reload the page before switching checkout environments');
  if (!loading) {
    loadedEnvironment = checkout.environment;
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => {
        clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        script.remove();
        loading = undefined;
        loadedEnvironment = undefined;
        reject(
          new Error(
            'Unable to load NTT checkout; check network access and approved domain configuration',
          ),
        );
      };
      const timer = setTimeout(fail, 15_000);
      script.src =
        checkout.environment === 'PRODUCTION'
          ? 'https://psa.atomtech.in/staticdata/ots/js/atomcheckout.js'
          : 'https://pgtest.atomtech.in/staticdata/ots/js/atomcheckout.js';
      script.onload = () => {
        if (!window.AtomPaynetz) {
          fail();
          return;
        }
        clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        resolve();
      };
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  await loading;
  if (!window.AtomPaynetz) throw new Error('NTT checkout did not initialize');
  const existingFrames = new Set(Array.from(document.querySelectorAll('iframe')));
  new window.AtomPaynetz(
    {
      atomTokenId: checkout.token,
      merchId: checkout.merchantId,
      custEmail: customer.email,
      custMobile: customer.mobile,
      returnUrl,
    },
    checkout.environment.toLowerCase(),
  );
  observeCheckoutClose(existingFrames, options.onClose);
}
