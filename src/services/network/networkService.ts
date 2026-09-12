import { logger } from '../../utils/logger';

const TAG = 'NetworkService';

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

// Simple dedup map: key => in-flight promise
const inflight = new Map<string, Promise<Response>>();

/**
 * Central fetch wrapper with timeout, retry, and request deduplication.
 */
export async function networkFetch(
  url: string,
  options: FetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 8000,
    retries = 2,
    retryDelayMs = 500,
    ...fetchOptions
  } = options;

  // Dedup key: url + JSON body
  const dedupKey = `${url}:${fetchOptions.body ?? ''}`;

  const existing = inflight.get(dedupKey);
  if (existing) {
    logger.debug(TAG, 'Dedup hit', url);
    return existing.then((r) => r.clone());
  }

  const attempt = async (retriesLeft: number): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res;
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (retriesLeft > 0 && !isAbort) {
        logger.warn(TAG, `Retry (${retries - retriesLeft + 1}) for ${url}`);
        await new Promise((r) => setTimeout(r, retryDelayMs * (retries - retriesLeft + 1)));
        return attempt(retriesLeft - 1);
      }
      throw err;
    }
  };

  const promise = attempt(retries).finally(() => inflight.delete(dedupKey));
  inflight.set(dedupKey, promise);
  return promise.then(response => response.clone());
}
