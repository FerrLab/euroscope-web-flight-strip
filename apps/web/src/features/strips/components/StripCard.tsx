'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Strip } from '../types';

const DIR_COLORS: Record<Strip['dir'], string> = {
  DEP: 'var(--instrument-starboard-primary-color)',
  ARR: 'var(--instrument-port-primary-color)',
  VFR: 'var(--instrument-enhanced-primary-color)',
};

interface Chip {
  txt: string;
  color: string;
  tip: string;
  anim: string;
}

export interface StripCardProps {
  strip: Strip;
  /** Squawk codes set by more than one aircraft on this tab. */
  duplicateSquawks: ReadonlySet<string>;
  compact: boolean;
  dragging: boolean;
  onDragStart(e: React.DragEvent): void;
  onDragEnd(): void;
  onContextMenu(x: number, y: number): void;
  onSuggestAccept(): void;
  onFreeTextChange(text: string): void;
}

export function StripCard({
  strip,
  duplicateSquawks,
  compact,
  dragging,
  onDragStart,
  onDragEnd,
  onContextMenu,
  onSuggestAccept,
  onFreeTextChange,
}: StripCardProps) {
  const t = useTranslations('strips.strip');
  const tBays = useTranslations('strips.bays');
  const [editingFt, setEditingFt] = useState(false);
  const ftRef = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (editingFt) {
      ftRef.current?.focus();
      ftRef.current?.select();
    }
  }, [editingFt]);

  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [],
  );

  const dup = strip.sqkS !== '' && duplicateSquawks.has(strip.sqkS) && strip.sqkS !== '7000';
  const mismatch = strip.sqkS !== '' && strip.sqkS !== strip.sqkA;
  const ready =
    strip.cleared &&
    strip.sqkS !== '' &&
    strip.sqkS === strip.sqkA &&
    (strip.bay === 'PENDING' || strip.bay === 'CLEARED');

  const allChips: Chip[] = [];
  if (dup) {
    allChips.push({
      txt: t('chips.dup'),
      color: 'var(--alert-alarm-color)',
      tip: t('chips.dupTip'),
      anim: 'fscPulse 1.4s ease infinite',
    });
  }
  if (strip.xfr?.state === 'PENDING') {
    const pos = strip.xfr.to.split('_')[1] ?? strip.xfr.to;
    allChips.push({
      txt: t('chips.xfrPending', { pos }),
      color: 'var(--instrument-enhanced-secondary-dif-color)',
      tip: t('chips.xfrPendingTip', { to: strip.xfr.to }),
      anim: 'fscPulse 1.6s ease infinite',
    });
  }
  if (strip.xfr?.state === 'ACCEPTED') {
    const pos = strip.xfr.to.split('_')[1] ?? strip.xfr.to;
    allChips.push({
      txt: t('chips.xfrOk', { pos }),
      color: 'var(--alert-success-color)',
      tip: t('chips.xfrOkTip', { to: strip.xfr.to }),
      anim: 'none',
    });
  }
  if (ready) {
    allChips.push({
      txt: t('chips.rdy'),
      color: 'var(--alert-success-color)',
      tip: t('chips.rdyTip'),
      anim: 'none',
    });
  }
  if (strip.dcl === 'SENT') {
    allChips.push({
      txt: t('chips.pdc'),
      color: 'var(--instrument-enhanced-secondary-dif-color)',
      tip: t('chips.pdcTip'),
      anim: 'fscPulse 2s ease infinite',
    });
  }
  if (strip.dcl === 'ACK') {
    allChips.push({
      txt: t('chips.pdcOk'),
      color: 'var(--alert-success-color)',
      tip: t('chips.pdcOkTip'),
      anim: 'none',
    });
  }
  if (strip.dir === 'DEP' && !strip.cleared) {
    allChips.push({
      txt: t('chips.noClr'),
      color: 'var(--element-inactive-color)',
      tip: t('chips.noClrTip'),
      anim: 'none',
    });
  }
  const chips = allChips.slice(0, 2);

  const typeWake = `${strip.type}/${strip.wake}`;
  const airlineSuffix = ` · ${strip.airline}`;
  const routeTip = `${strip.adep} – ${strip.ades}`;
  const local = strip.adep === strip.ades;
  const routeLabel = local ? t('routeLocal') : strip.dir === 'ARR' ? t('routeFrom') : t('routeTo');
  const routeVal = local ? strip.adep : strip.dir === 'ARR' ? strip.adep : strip.ades;
  const sqkSetColor = !strip.sqkS
    ? 'var(--element-inactive-color)'
    : dup
      ? 'var(--alert-alarm-color)'
      : mismatch
        ? 'var(--alert-caution-color)'
        : 'var(--alert-success-color)';

  function startPress(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const { clientX, clientY } = e;
    pressStart.current = { x: clientX, y: clientY };
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => onContextMenu(clientX, clientY), 550);
  }

  function cancelPress(e?: React.PointerEvent) {
    if (e && e.type === 'pointermove' && pressStart.current) {
      const dx = Math.abs(e.clientX - pressStart.current.x);
      const dy = Math.abs(e.clientY - pressStart.current.y);
      if (dx < 6 && dy < 6) return;
    }
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  const CELL_LABEL: React.CSSProperties = {
    fontSize: 9,
    lineHeight: '11px',
    letterSpacing: '0.6px',
    color: 'var(--element-inactive-color)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  };
  const CELL_VALUE: React.CSSProperties = {
    fontSize: 12.5,
    lineHeight: '17px',
    fontWeight: 570,
    fontFeatureSettings: "'tnum' 1, 'ss04' 1",
    whiteSpace: 'nowrap',
    minWidth: 0,
    overflow: 'hidden',
  };

  return (
    <div
      data-testid={`strip-${strip.cs}`}
      draggable
      onDragStart={(e) => {
        cancelPress();
        e.dataTransfer.setData('text/plain', strip.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e.clientX, e.clientY);
      }}
      onPointerDown={startPress}
      onPointerUp={(e) => cancelPress(e)}
      onPointerMove={(e) => cancelPress(e)}
      style={{
        flex: 'none',
        background: 'var(--container-background-color)',
        border: `1px solid ${dup || mismatch ? 'var(--alert-caution-color)' : 'var(--border-outline-color)'}`,
        borderLeft: `6px solid ${DIR_COLORS[strip.dir]}`,
        cursor: 'grab',
        userSelect: 'none',
        opacity: dragging ? 0.35 : 1,
        animation: strip.anim ? 'fscSlideIn 260ms ease' : 'none',
        boxShadow: 'var(--shadow-flat)',
        padding: '6px 7px 6px 9px',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
        <span
          style={{
            fontSize: 16,
            lineHeight: '22px',
            fontWeight: 670,
            letterSpacing: '0.3px',
            color: 'var(--element-active-color)',
            fontFeatureSettings: "'tnum' 1, 'ss04' 1",
            flex: 'none',
          }}
        >
          {strip.cs}
        </span>
        <span
          title={t('dirTip', { type: strip.type, wake: strip.wake, dir: strip.dir })}
          style={{
            fontSize: 12,
            lineHeight: '16px',
            color: 'var(--element-neutral-color)',
            fontFeatureSettings: "'tnum' 1",
            flex: 'none',
            whiteSpace: 'nowrap',
            marginLeft: 2,
          }}
        >
          {typeWake}
        </span>
        <span style={{ flex: 1 }} />
        {chips.map((chip) => (
          <span
            key={chip.txt}
            title={chip.tip}
            style={{
              fontSize: 10,
              lineHeight: '13px',
              fontWeight: 670,
              letterSpacing: '0.5px',
              color: chip.color,
              border: `1px solid ${chip.color}`,
              padding: '1px 5px',
              whiteSpace: 'nowrap',
              flex: 'none',
              animation: chip.anim,
            }}
          >
            {chip.txt}
          </span>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(38px, 0.9fr) minmax(78px, 1.5fr) minmax(64px, 1.3fr) minmax(24px, 0.5fr)',
          gap: '2px 4px',
          marginTop: 4,
        }}
      >
        <div style={CELL_LABEL}>{routeLabel}</div>
        <div style={CELL_LABEL}>{t('procLabel', { kind: strip.procKind })}</div>
        <div style={CELL_LABEL}>{t('sqk')}</div>
        <div style={CELL_LABEL}>{t('cfl')}</div>
        <div title={routeTip} style={CELL_VALUE}>
          {routeVal}
        </div>
        <div style={CELL_VALUE}>
          {strip.proc} <span style={{ color: 'var(--element-neutral-color)' }}>{strip.rwy}</span>
        </div>
        <div style={CELL_VALUE}>
          {strip.sqkA} <span style={{ color: sqkSetColor }}>{strip.sqkS || '····'}</span>
        </div>
        <div style={CELL_VALUE}>{strip.cfl}</div>
      </div>

      <div
        style={{
          display: compact ? 'none' : 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 5,
          borderTop: '1px solid var(--border-divider-color)',
          paddingTop: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            lineHeight: '15px',
            color: 'var(--element-neutral-color)',
            whiteSpace: 'nowrap',
          }}
        >
          {t('stand')}{' '}
          <span
            style={{
              fontWeight: 670,
              color: 'var(--element-active-color)',
              fontFeatureSettings: "'tnum' 1",
            }}
          >
            {strip.gate}
          </span>
          {airlineSuffix}
        </span>
        <span style={{ flex: 1 }} />
        {strip.suggest && (
          <button
            type="button"
            data-testid="strip-suggest"
            onClick={(e) => {
              e.stopPropagation();
              onSuggestAccept();
            }}
            title={t('suggestTitle')}
            style={{
              fontSize: 11,
              lineHeight: '14px',
              fontWeight: 670,
              letterSpacing: '0.3px',
              color: 'var(--on-selected-active-color)',
              background: 'var(--selected-enabled-background-color)',
              border: '1px solid var(--selected-enabled-border-color)',
              padding: '3px 8px',
              cursor: 'pointer',
              animation: 'fscPulse 2s ease infinite',
              whiteSpace: 'nowrap',
            }}
          >
            {t('suggest', { bay: tBays(`kinds.${strip.suggest.bay}`) })}
          </button>
        )}
        {editingFt ? (
          <input
            ref={ftRef}
            defaultValue={strip.freeText}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              onFreeTextChange(e.target.value);
              setEditingFt(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            style={{
              flex: 'none',
              width: 120,
              fontSize: 11,
              lineHeight: '14px',
              padding: '2px 6px',
              background: 'var(--indent-enabled-background-color)',
              border: '1px solid var(--indent-enabled-border-color)',
              color: 'var(--element-active-color)',
              outline: '2px solid var(--border-focus-color)',
            }}
          />
        ) : (
          <button
            type="button"
            data-testid="strip-freetext"
            onClick={(e) => {
              e.stopPropagation();
              setEditingFt(true);
            }}
            title={t('freeTextTitle')}
            style={{
              fontSize: 11,
              lineHeight: '15px',
              fontStyle: 'italic',
              fontFamily: 'inherit',
              color: strip.freeText
                ? 'var(--element-active-color)'
                : 'var(--element-disabled-color)',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'text',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 110,
            }}
          >
            {strip.freeText || t('freeText')}
          </button>
        )}
      </div>
    </div>
  );
}
