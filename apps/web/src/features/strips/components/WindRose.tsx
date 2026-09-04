'use client';

import { useTranslations } from 'next-intl';
import type { Rose } from '../metar';

/**
 * Compass rose with the runway strip, centerline, wind arrow and the
 * runway ident at the approach end. Geometry comes precomputed from
 * roseOf() so this stays a pure view.
 */
export function WindRose({ rose }: { rose: Rose }) {
  const t = useTranslations('strips.awos');
  return (
    <svg
      viewBox="-72 -72 144 144"
      style={{ width: 124, height: 124, flex: 'none', display: 'block' }}
    >
      <circle
        r={58}
        style={{
          fill: 'var(--container-global-color)',
          stroke: 'var(--instrument-frame-primary-color)',
          strokeWidth: 1,
        }}
      />
      {rose.ticks.map((tick) => (
        <line
          key={tick.rot}
          x1={0}
          y1={-58}
          x2={0}
          y2={tick.y2}
          transform={`rotate(${tick.rot})`}
          style={{ stroke: tick.color, strokeWidth: 1.5 }}
        />
      ))}
      <text
        x={0}
        y={-62}
        style={{
          fill: 'var(--instrument-tick-mark-label-primary-color)',
          fontSize: 9,
          fontWeight: 570,
          textAnchor: 'middle',
        }}
      >
        {t('north')}
      </text>
      <g transform={`rotate(${rose.rwyRot})`}>
        <rect
          x={-7}
          y={-46}
          width={14}
          height={92}
          style={{
            fill: 'var(--container-section-color)',
            stroke: 'var(--instrument-frame-primary-color)',
            strokeWidth: 1,
          }}
        />
        <line
          x1={0}
          y1={-34}
          x2={0}
          y2={34}
          style={{ stroke: 'var(--element-neutral-color)', strokeWidth: 1, strokeDasharray: '5 4' }}
        />
      </g>
      <text
        x={rose.lx}
        y={rose.ly}
        style={{
          fill: 'var(--element-active-color)',
          fontSize: 9,
          fontWeight: 670,
          textAnchor: 'middle',
          dominantBaseline: 'middle',
        }}
      >
        {rose.rwyId}
      </text>
      <g
        transform={`rotate(${rose.windRot})`}
        style={{ color: 'var(--instrument-enhanced-primary-color)' }}
      >
        <line
          x1={0}
          y1={-54}
          x2={0}
          y2={-33}
          style={{ stroke: 'currentColor', strokeWidth: 2.5 }}
        />
        <polygon points="0,-25 -5,-35 5,-35" style={{ fill: 'currentColor' }} />
      </g>
      <circle r={2} style={{ fill: 'var(--instrument-tick-mark-primary-color)' }} />
    </svg>
  );
}
