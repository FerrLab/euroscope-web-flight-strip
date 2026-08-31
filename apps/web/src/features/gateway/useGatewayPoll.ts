'use client';

import { useEffect } from 'react';
import { useAppDispatch } from '@/shared/store/hooks';
import { batchReceived, pollFailed, type GatewayBatch } from './slice';

const POLL_URL = '/api/proxy/api/gateway/console/poll';
const SERVER_HOLD_SECONDS = 15;
// Must exceed the server hold, or healthy long polls get aborted mid-wait.
const CLIENT_TIMEOUT_MS = 20_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

/**
 * Owns the console's long-poll loop: backfill on mount (no cursor), then
 * cursor-tail polls that the server holds up to 15s. Errors back off
 * exponentially; unmount aborts the in-flight request and ends the loop.
 */
export function useGatewayPoll(enabled = true) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let controller = new AbortController();
    let cursor: string | null = null;
    let backoffMs = 0;

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    async function loop() {
      while (!cancelled) {
        if (backoffMs > 0) {
          await sleep(backoffMs);
        }
        if (cancelled) {
          return;
        }
        controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
        try {
          const params = new URLSearchParams({ timeout: String(SERVER_HOLD_SECONDS) });
          if (cursor) {
            params.set('after', cursor);
          }
          const res = await fetch(`${POLL_URL}?${params.toString()}`, {
            signal: controller.signal,
            credentials: 'include',
          });
          if (res.status === 401) {
            // Session expired: stop the loop and return to login
            // instead of hammering the backend with doomed polls.
            const locale = window.location.pathname.split('/')[1] || 'en';
            window.location.assign(`/${locale}/login`);
            return;
          }
          if (!res.ok) {
            throw new Error(`poll failed with ${res.status}`);
          }
          const batch = (await res.json()) as GatewayBatch;
          if (cancelled) {
            return;
          }
          if (batch.cursor) {
            cursor = batch.cursor;
          }
          dispatch(batchReceived(batch));
          backoffMs = 0;
        } catch {
          if (cancelled) {
            return;
          }
          dispatch(pollFailed());
          backoffMs = backoffMs === 0 ? BACKOFF_MIN_MS : Math.min(backoffMs * 2, BACKOFF_MAX_MS);
        } finally {
          clearTimeout(timer);
        }
      }
    }

    void loop();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, dispatch]);
}
