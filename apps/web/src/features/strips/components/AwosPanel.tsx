'use client';

import { useTranslations } from 'next-intl';
import { AIRPORTS } from '../airports';
import { catOf, roseOf } from '../metar';
import type { Metar } from '../types';
import { WindRose } from './WindRose';

const FIELD_LABEL: React.CSSProperties = {
  fontSize: 10,
  lineHeight: '12px',
  letterSpacing: '0.8px',
  color: 'var(--element-inactive-color)',
  marginBottom: 2,
};

const FIELD_VALUE: React.CSSProperties = {
  fontSize: 17,
  lineHeight: '22px',
  fontWeight: 570,
  fontFeatureSettings: "'tnum' 1, 'ss04' 1",
  whiteSpace: 'nowrap',
};

const FIELD_UNIT: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--element-neutral-color)',
  fontWeight: 370,
};

const FIELD_NOTE: React.CSSProperties = {
  fontSize: 11,
  lineHeight: '14px',
  color: 'var(--element-neutral-color)',
  fontFeatureSettings: "'tnum' 1",
};

export function AwosPanel({ metar, icao }: { metar: Metar; icao: string }) {
  const t = useTranslations('strips.awos');
  const cat = catOf(metar);
  const rose = roseOf(metar, icao);
  const stationLabel = `${metar.station} ${AIRPORTS[icao]?.name ?? ''}`.trim();
  const obsTime = metar.obsTime ? `${metar.obsTime}Z` : '';

  return (
    <div
      style={{
        flex: 'none',
        padding: '12px 16px 14px',
        borderBottom: '1px solid var(--border-divider-color)',
        background: 'var(--container-background-color)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
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
          {t('title', { station: stationLabel })}
        </span>
        <span
          style={{
            fontSize: 12,
            lineHeight: '16px',
            color: 'var(--element-inactive-color)',
            fontFeatureSettings: "'tnum' 1, 'ss04' 1",
          }}
        >
          {obsTime}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 56,
            height: 56,
            flex: 'none',
            border: '1px solid var(--instrument-frame-primary-color)',
            background: 'var(--container-global-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: 8,
              lineHeight: '10px',
              letterSpacing: 1,
              color: 'var(--element-neutral-color)',
            }}
          >
            {t('atis')}
          </span>
          <span
            style={{
              fontSize: 32,
              lineHeight: '34px',
              fontWeight: 670,
              color: 'var(--instrument-enhanced-primary-color)',
            }}
          >
            {metar.atis}
          </span>
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              data-testid="awos-category"
              style={{
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 670,
                letterSpacing: '0.5px',
                color: cat.color,
                border: `1px solid ${cat.color}`,
                padding: '2px 8px',
              }}
            >
              {cat.cat}
            </span>
            <span
              style={{ fontSize: 12, lineHeight: '16px', color: 'var(--element-neutral-color)' }}
            >
              {t(`cat.${cat.note}`)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{ fontSize: 12, lineHeight: '16px', color: 'var(--element-neutral-color)' }}
            >
              {t('rwy')}
            </span>
            {metar.rwys.map((rwy) => (
              <span
                key={rwy}
                style={{
                  fontSize: 14,
                  lineHeight: '18px',
                  fontWeight: 670,
                  color: 'var(--element-active-color)',
                  border: '1px solid var(--border-outline-color)',
                  background: 'var(--container-global-color)',
                  padding: '1px 8px',
                  fontFeatureSettings: "'tnum' 1, 'ss04' 1",
                }}
              >
                {rwy}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.25fr 1fr 1fr',
          gap: '10px 8px',
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={FIELD_LABEL}>{t('wind')}</div>
          <div style={FIELD_VALUE}>
            {metar.wind}
            <span style={FIELD_UNIT}> {t('kt')}</span>
          </div>
          <div style={FIELD_NOTE}>{metar.windNote}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={FIELD_LABEL}>{t('qnh')}</div>
          <div style={FIELD_VALUE}>
            {metar.qnh}
            <span style={FIELD_UNIT}> {t('hpa')}</span>
          </div>
          <div style={FIELD_NOTE}>{metar.qnhAlt}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={FIELD_LABEL}>{t('tdp')}</div>
          <div style={FIELD_VALUE}>
            {metar.temp}
            <span style={FIELD_UNIT}> {t('celsius')}</span>
          </div>
          <div style={{ ...FIELD_NOTE, fontFeatureSettings: undefined }}>{metar.hum}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={FIELD_LABEL}>{t('vis')}</div>
          <div style={FIELD_VALUE}>
            {metar.vis}
            <span style={FIELD_UNIT}> {metar.visUnit}</span>
          </div>
        </div>
        <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
          <div style={FIELD_LABEL}>{t('ceiling')}</div>
          <div style={FIELD_VALUE}>
            {metar.ceil}
            <span style={FIELD_UNIT}> {metar.ceilUnit}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <WindRose rose={rose} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div>
            <div style={FIELD_LABEL}>{t('rwyHdg', { id: rose.rwyId })}</div>
            <div style={{ ...FIELD_VALUE, lineHeight: '20px' }}>{rose.hdgTxt}</div>
          </div>
          <div>
            <div style={FIELD_LABEL}>
              {rose.hwLabel === 'HEADWIND' ? t('headwind') : t('tailwind')}
            </div>
            <div style={{ ...FIELD_VALUE, lineHeight: '20px', color: rose.hwColor }}>
              {rose.hwVal}
              <span style={FIELD_UNIT}>
                {' '}
                {t('kt')} {rose.hwGust}
              </span>
            </div>
          </div>
          <div>
            <div style={FIELD_LABEL}>{t('crosswind')}</div>
            <div
              data-testid="awos-crosswind"
              style={{ ...FIELD_VALUE, lineHeight: '20px', color: rose.xwColor }}
            >
              {rose.xwVal}
              <span style={FIELD_UNIT}>
                {' '}
                {t('kt')} {rose.xwSide} {rose.xwGust}
              </span>
            </div>
          </div>
        </div>
      </div>

      {metar.raw && (
        <div
          style={{
            fontSize: 11.5,
            lineHeight: '16px',
            color: 'var(--element-neutral-color)',
            background: 'var(--container-global-color)',
            border: '1px solid var(--border-outline-color)',
            padding: '6px 8px',
            fontFeatureSettings: "'tnum' 1, 'ss04' 1",
            letterSpacing: '0.2px',
          }}
        >
          {metar.raw}
        </div>
      )}
    </div>
  );
}
