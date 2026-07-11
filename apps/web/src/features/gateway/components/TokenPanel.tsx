'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Spinner } from '@eurostrip/ui';
import { useRotateTokenMutation, useTokenStatusQuery } from '../api';

const GATEWAY_BASE =
  process.env.NEXT_PUBLIC_GATEWAY_BASE_URL ?? 'http://127.0.0.1:8000/api/euroscope';

// EuroScope's `.wsc` command line does not accept `/` or `:` in arguments,
// so the URL and token are packed into one blob instead of the raw
// `.wsc gateway url`/`.wsc gateway token` pair. Standard base64 (btoa) still
// emits `+` and `/` in its alphabet — for a JWT-length Passport token that's
// nearly certain — so this encodes base64url instead (RFC 4648 §5: `+`→`-`,
// `/`→`_`, padding stripped), leaving only [A-Za-z0-9_-]. The plugin must
// decode base64url and split the payload on the LAST `:` (the URL itself
// contains `:`); see docs/architecture/gateway.md. Not translatable copy —
// see docs/conventions/i18n.md "What NOT to translate".
function toBase64Url(raw: string): string {
  return btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
const wscConfigLine = (token: string) =>
  `.wsc gateway config ${toBase64Url(`${GATEWAY_BASE}:${token}`)}`;

export function TokenPanel() {
  const t = useTranslations('gateway.token');
  const { data, isLoading } = useTokenStatusQuery();
  const [rotateToken, { isLoading: isRotating }] = useRotateTokenMutation();
  const [confirming, setConfirming] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return <Spinner label={t('loading')} />;
  }

  const exists = data?.exists ?? false;

  async function rotate() {
    setConfirming(false);
    setError(null);
    const result = await rotateToken();
    if ('error' in result && result.error) {
      setError(t('error'));
    } else if (result.data) {
      setSecret(result.data.token);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {exists && data?.created_at ? (
        <p className="text-sm">
          {t('createdAt', { date: new Date(data.created_at).toLocaleString() })}
        </p>
      ) : (
        <p className="text-sm">{t('none')}</p>
      )}

      {!confirming && (
        <Button
          type="button"
          disabled={isRotating}
          onClick={() => (exists ? setConfirming(true) : void rotate())}
        >
          {exists ? t('rotate') : t('generate')}
        </Button>
      )}

      {confirming && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t('confirm')}</p>
          <div className="flex gap-2">
            <Button type="button" disabled={isRotating} onClick={() => void rotate()}>
              {t('confirmYes')}
            </Button>
            <Button type="button" onClick={() => setConfirming(false)}>
              {t('confirmNo')}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-accent-danger text-sm">{error}</p>}

      {secret && (
        <div className="flex flex-col gap-2 border border-neutral-600 p-4">
          <p className="text-sm font-semibold">{t('revealHint')}</p>
          <code data-testid="gateway-token-secret" className="break-all font-mono text-xs">
            {secret}
          </code>
          <code className="break-all font-mono text-xs">{wscConfigLine(secret)}</code>
        </div>
      )}
    </div>
  );
}
