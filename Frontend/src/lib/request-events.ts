type RequestListener = (activeRequests: number) => void;

let activeRequests = 0;
const listeners = new Set<RequestListener>();

function notify() {
  listeners.forEach((listener) => listener(activeRequests));
}

export function beginRequest() {
  activeRequests += 1;
  notify();
}

export function endRequest() {
  activeRequests = Math.max(0, activeRequests - 1);
  notify();
}

export function subscribeToRequests(listener: RequestListener) {
  listeners.add(listener);
  listener(activeRequests);
  return () => listeners.delete(listener);
}

export function getActiveRequestCount() {
  return activeRequests;
}
