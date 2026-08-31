'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ObcToggleSwitch } from '@oicl/openbridge-webcomponents-react/components/toggle-switch/toggle-switch';
import type { ArchivedStrip, FeedEvent, FeedKind } from '../types';

const KIND_COLOR: Record<FeedKind, string> = {
  info: 'var(--instrument-enhanced-secondary-dif-color)',
  ok: 'var(--alert-success-color)',
  warn: 'var(--alert-caution-color)',
  alarm: 'var(--alert-alarm-color)',
};

export interface ActivityFeedProps {
  icao: string;
  feed: FeedEvent[];
  archived: ArchivedStrip[];
  liveOn: boolean;
  onLiveToggle(on: boolean): void;
  onRestore(cs: string): void;
  /** Resolves a bay id param to its display title for feed copy. */
  resolveBay(bayId: string): string;
}

export function ActivityFeed({
  icao,
  feed,
  archived,
  liveOn,
  onLiveToggle,
  onRestore,
  resolveBay,
}: ActivityFeedProps) {
  const t = useTranslations('strips');
  const [archiveOpen, setArchiveOpen] = useState(false);

  function renderEvent(event: FeedEvent): string {
    const params = { ...event.params };
    if (typeof params.bay === 'string') params.bay = resolveBay(params.bay);
    return t(`feed.events.${event.key}`, params);
  }

  return (
    <>
      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          padding: '8px 8px 8px 16px',
          borderBottom: '1px solid var(--border-divider-color)',
        }}
      >
        <span
          style={{
            fontSize: 12,
            lineHeight: '16px',
            letterSpacing: '0.6px',
            color: 'var(--element-neutral-color)',
            textTransform: 'uppercase',
            flex: 1,
          }}
        >
          {t('activity.title', { icao })}
        </span>
        <span style={{ transform: 'scale(0.85)', transformOrigin: 'right center' }}>
          <ObcToggleSwitch
            label={t('activity.live')}
            checked={liveOn}
            onInput={(e) => onLiveToggle((e.target as HTMLElement & { checked: boolean }).checked)}
          />
        </span>
      </div>
      <div
        data-testid="activity-feed"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 8px' }}
      >
        {feed.map((event, index) => {
          const meta = `${event.time} ${t('activity.utc')} · ${t(`feed.src.${event.src}`)}`;
          return (
            <div
              key={`${event.time}-${event.key}-${index}`}
              style={{
                display: 'flex',
                gap: 8,
                padding: '6px 8px',
                animation: 'fscFadeIn 200ms ease',
              }}
            >
              <span
                className="rounded-full"
                style={{
                  width: 8,
                  height: 8,
                  background: KIND_COLOR[event.kind],
                  flex: 'none',
                  marginTop: 5,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{ fontSize: 13, lineHeight: '18px', color: 'var(--element-active-color)' }}
                >
                  {renderEvent(event)}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    lineHeight: '14px',
                    color: 'var(--element-inactive-color)',
                    fontFeatureSettings: "'tnum' 1",
                  }}
                >
                  {meta}
                </div>
              </div>
            </div>
          );
        })}
        {feed.length === 0 && (
          <div
            style={{
              padding: 16,
              fontSize: 13,
              color: 'var(--element-inactive-color)',
              textAlign: 'center',
            }}
          >
            {t('activity.empty')}
          </div>
        )}
      </div>
      {archiveOpen && archived.length > 0 && (
        <div
          data-testid="archived-list"
          style={{
            flex: 'none',
            maxHeight: 180,
            overflowY: 'auto',
            borderTop: '1px solid var(--border-divider-color)',
            padding: '4px 8px',
          }}
        >
          {archived.map((entry) => {
            const archivedAt = `${entry.time} ${t('activity.utc')}`;
            return (
              <div
                key={`${entry.cs}-${entry.time}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px' }}
              >
                <span
                  style={{
                    fontSize: 13,
                    lineHeight: '18px',
                    fontWeight: 670,
                    fontFeatureSettings: "'tnum' 1",
                    flex: 1,
                  }}
                >
                  {entry.cs}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    lineHeight: '14px',
                    color: 'var(--element-inactive-color)',
                    fontFeatureSettings: "'tnum' 1",
                  }}
                >
                  {archivedAt}
                </span>
                <button
                  type="button"
                  data-testid={`archived-restore-${entry.cs}`}
                  onClick={() => onRestore(entry.cs)}
                  style={{
                    fontSize: 11,
                    lineHeight: '14px',
                    fontWeight: 670,
                    letterSpacing: '0.3px',
                    color: 'var(--instrument-enhanced-secondary-dif-color)',
                    border: '1px solid var(--instrument-enhanced-secondary-dif-color)',
                    background: 'transparent',
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                >
                  {t('activity.restore')}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        data-testid="archived-toggle"
        onClick={() => setArchiveOpen((open) => !open)}
        style={{
          flex: 'none',
          borderTop: '1px solid var(--border-divider-color)',
          borderBottom: 'none',
          borderLeft: 'none',
          borderRight: 'none',
          background: 'transparent',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          fontFamily: 'inherit',
        }}
      >
        <span
          style={{ width: 20, height: 20, display: 'block', color: 'var(--element-neutral-color)' }}
        >
          <obi-history-google style={{ width: 20, height: 20, display: 'block' }} />
        </span>
        <span
          style={{
            fontSize: 13,
            lineHeight: '18px',
            color: 'var(--element-neutral-color)',
            flex: 1,
          }}
        >
          {t('activity.archived')}
        </span>
        <span
          style={{
            fontSize: 14,
            lineHeight: '18px',
            fontWeight: 670,
            fontFeatureSettings: "'tnum' 1",
            color: 'var(--element-active-color)',
          }}
        >
          {archived.length}
        </span>
      </button>
    </>
  );
}
