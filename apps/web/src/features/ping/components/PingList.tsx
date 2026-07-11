'use client';

import { useTranslations } from 'next-intl';
import { Spinner, Table } from '@azimuth/ui';
import { useListPingsQuery, type PingDto } from '../api';

export function PingList() {
  const t = useTranslations('ping');
  const { data, isLoading, isError } = useListPingsQuery();

  if (isLoading) {
    return <Spinner label={t('loading')} />;
  }
  if (isError) {
    return <p className="text-accent-danger">{t('error')}</p>;
  }
  return (
    <Table<PingDto>
      caption={t('title')}
      columns={[
        { key: 'id', header: t('id'), cell: (r) => r.id.slice(0, 8) },
        {
          key: 'note',
          header: t('noteText'),
          cell: (r) => r.note.en ?? Object.values(r.note)[0],
        },
        {
          key: 'created_at',
          header: t('when'),
          cell: (r) => new Date(r.created_at).toLocaleString(),
        },
      ]}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyLabel={t('empty')}
    />
  );
}
