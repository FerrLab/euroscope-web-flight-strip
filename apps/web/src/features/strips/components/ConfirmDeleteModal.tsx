'use client';

import { useTranslations } from 'next-intl';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ButtonVariant } from '@oicl/openbridge-webcomponents/dist/components/button/button.js';
import { useAppDispatch } from '@/shared/store/hooks';
import { stripsActions } from '../slice';
import type { Strip } from '../types';
import { ModalShell } from './ModalShell';

export function ConfirmDeleteModal({ strip, onClose }: { strip: Strip; onClose(): void }) {
  const t = useTranslations('strips.modals');
  const dispatch = useAppDispatch();

  return (
    <ModalShell
      title={t('confirm.title')}
      identity={strip.cs}
      width={460}
      onClose={onClose}
      buttons={
        <>
          <ObcButton variant={ButtonVariant.flat} onClick={onClose}>
            {t('cancel')}
          </ObcButton>
          <ObcButton
            variant={ButtonVariant.normal}
            onClick={() => {
              dispatch(stripsActions.stripDeleted(strip.id));
              onClose();
            }}
          >
            {t('confirm.delete')}
          </ObcButton>
        </>
      }
    >
      <div style={{ padding: '20px 20px 4px', display: 'flex', gap: 12 }}>
        <span
          style={{
            width: 24,
            height: 24,
            flex: 'none',
            display: 'block',
            color: 'var(--alert-alarm-color)',
          }}
        >
          <obi-warning-google style={{ width: 24, height: 24, display: 'block' }} />
        </span>
        <div>
          <div style={{ fontSize: 15, lineHeight: '22px' }}>
            {t('confirm.text', { cs: strip.cs, adep: strip.adep, ades: strip.ades })}
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: '17px',
              color: 'var(--element-neutral-color)',
              marginTop: 4,
            }}
          >
            {t('confirm.note')}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
