export type RetryOptions = {
  retries: number;
  retryOnStatuses: number[];
  backoffMs: number;
  maxBackoffMs: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options?: Partial<RetryOptions>
): Promise<Response> {
  const retries = options?.retries ?? 0;
  const retryOnStatuses = options?.retryOnStatuses ?? [429, 500];
  const backoffMs = options?.backoffMs ?? 500;
  const maxBackoffMs = options?.maxBackoffMs ?? 4000;
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, init);
      if (
        res.ok ||
        attempt >= retries ||
        !retryOnStatuses.includes(res.status)
      ) {
        return res;
      }
    } catch (err) {
      if (attempt >= retries) {
        throw err;
      }
    }
    const delay = Math.min(backoffMs * Math.pow(2, attempt), maxBackoffMs);
    await sleep(delay);
    attempt += 1;
  }
}
