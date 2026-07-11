'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Spinner } from '@eurostrip/ui';
import { useRotateTokenMutation, useTokenStatusQuery } from '../api';

const GATEWAY_BASE =
  process.env.NEXT_PUBLIC_GATEWAY_BASE_URL ?? 'http://127.0.0.1:8000/api/euroscope';

// `.wsc` config-file directives, not translatable copy — see
// docs/conventions/i18n.md "What NOT to translate".
const wscUrlLine = `.wsc gateway url ${GATEWAY_BASE}`;
const wscTokenLine = (token: string) => `.wsc gateway token ${token}`;

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
          <code className="break-all font-mono text-xs">{wscUrlLine}</code>
          <code className="break-all font-mono text-xs">{wscTokenLine(secret)}</code>
        </div>
      )}
    </div>
  );
}
