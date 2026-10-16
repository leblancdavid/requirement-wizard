export function runtimeRequestTimeout(input: RequestInfo | URL, init?: RequestInit): number {
  const url = input instanceof Request ? input.url : input.toString();
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  // Scans have a fifteen-minute service deadline; ordinary rounds still cancel
  // through their caller's five-minute signal. Do not cut scans short here.
  return method === "POST" && /\/session\/[^/]+\/message(?:\?|$)/.test(url) ? 900_000 : 90_000;
}

/** The generated SDK passes a Request, not a URL plus RequestInit. */
export const runtimeFetch: typeof fetch = (input, init) => {
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const timeout = AbortSignal.timeout(runtimeRequestTimeout(input, init));
  return fetch(input, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
};
