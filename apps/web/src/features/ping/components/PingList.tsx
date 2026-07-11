'use client';

import { useTranslations } from 'next-intl';
import { ObcSequenceLoadingSpinner } from '@oicl/openbridge-webcomponents-react/components/sequence-loading-spinner/sequence-loading-spinner';
import { ObcTable } from '@oicl/openbridge-webcomponents-react/components/table/table';
import { ObcTableCellType } from '@oicl/openbridge-webcomponents/dist/components/table/table.js';
import { useListPingsQuery, type PingDto } from '../api';

export function PingList() {
  const t = useTranslations('ping');
  const { data, isLoading, isError } = useListPingsQuery();

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" aria-label={t('loading')}>
        <ObcSequenceLoadingSpinner />
        <span className="sr-only">{t('loading')}</span>
      </div>
    );
  }
  if (isError) {
    return <p className="text-accent-danger">{t('error')}</p>;
  }
  if (!data || data.length === 0) {
    return <p className="text-fg-tertiary">{t('empty')}</p>;
  }

  const rows = data.map((r: PingDto) => ({
    id: r.id,
    id_display: { type: ObcTableCellType.Regular, text: r.id.slice(0, 8) },
    note: { type: ObcTableCellType.Regular, text: r.note.en ?? Object.values(r.note)[0] },
    when: { type: ObcTableCellType.Regular, text: new Date(r.created_at).toLocaleString() },
  }));

  return (
    <ObcTable
      data={rows}
      columns={[
        { key: 'id_display', label: t('id') },
        { key: 'note', label: t('noteText') },
        { key: 'when', label: t('when') },
      ]}
    />
  );
}
