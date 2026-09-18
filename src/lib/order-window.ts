import { useEffect, useState } from "react";

/** Orders drop off the Orders list once they are older than this. They are never deleted. */
export const ORDER_VISIBILITY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** ISO timestamp of the oldest order that should still appear in the list. */
export function orderVisibilityCutoff(now: number = Date.now()): string {
  return new Date(now - ORDER_VISIBILITY_WINDOW_MS).toISOString();
}

export function isWithinOrderWindow(createdAt: string, now: number = Date.now()): boolean {
  return now - new Date(createdAt).getTime() <= ORDER_VISIBILITY_WINDOW_MS;
}

/**
 * Ticks so rows age out of the list on their own. Without this, an order cached
 * just under the cutoff would linger on screen until the next manual reload.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}