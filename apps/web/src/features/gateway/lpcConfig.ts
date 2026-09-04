const GATEWAY_BASE =
  process.env.NEXT_PUBLIC_GATEWAY_BASE_URL ?? 'http://127.0.0.1:8000/api/euroscope';

// EuroScope's `.lpc` command line (the euroscope-longpolling-connector
// plugin, formerly euroscope-websocket-connector / `.wsc`) does not accept
// `/` or `:` in arguments, so the URL and token are packed into one blob
// instead of separate `.lpc gateway url`/`.lpc gateway token` lines.
// Standard base64 (btoa) still emits `+` and `/` in its alphabet — for a
// JWT-length Passport token that's nearly certain — so this encodes
// base64url instead (RFC 4648 §5: `+`→`-`, `/`→`_`, padding stripped),
// leaving only [A-Za-z0-9_-]. The plugin decodes base64url and splits the
// payload on the LAST `:` (the URL itself contains `:`); see
// docs/architecture/gateway.md. Not translatable copy — see
// docs/conventions/i18n.md "What NOT to translate".
function toBase64Url(raw: string): string {
  return btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** The single line a controller pastes into EuroScope to point the plugin here. */
export function lpcConfigLine(token: string): string {
  return `.lpc gateway config ${toBase64Url(`${GATEWAY_BASE}:${token}`)}`;
}
