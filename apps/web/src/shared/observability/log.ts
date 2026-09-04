type Level = 'info' | 'warn' | 'error';

/**
 * Server-side structured logging for route handlers.
 *
 * Route handlers run in the Next server process, so console output lands on
 * stdout and reaches `docker logs` — unlike the Laravel side, which needed
 * LOG_STACK=single,stderr to get there. One JSON line per event keeps it both
 * greppable (`grep auth.exchange`) and machine-readable, and mirrors the
 * backend's dotted-event convention so a single round trip reads as one
 * sequence across both services.
 *
 * Never pass the exchange code or an access token as context: the code is
 * bearer-equivalent for its 60-second life, and neither is needed to diagnose
 * anything. Log the backend *origin* instead of a full URL for the same reason.
 */
export function serverLog(
  level: Level,
  event: string,
  context: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({ level, event, ...context });

  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.info(line);
}

/**
 * The origin alone is what makes a misconfigured EUROSTRIP_BACKEND_URL
 * obvious in a log line, without carrying the query string (and its code)
 * along with it. Falls back to the raw value when it will not parse, since a
 * malformed URL is itself the thing worth seeing.
 */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
