'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAppDispatch } from '@/shared/store/hooks';
import { KINDS } from '../airports';
import { checkMove } from '../guards';
import { stripsActions } from '../slice';
import type { Bay, BayKind, Strip, StripsTab } from '../types';
import { bayDisplayTitle } from './bayTitle';
import { StripCard } from './StripCard';

export interface StripBoardProps {
  tab: StripsTab;
  compact: boolean;
  onStripContextMenu(stripId: string, x: number, y: number): void;
  onBayContextMenu(bayId: string, x: number, y: number): void;
  /** Bay currently being renamed inline (lifted so menus can start it). */
  renamingBay: string | null;
  onRenamingBayChange(bayId: string | null): void;
}

export function StripBoard({
  tab,
  compact,
  onStripContextMenu,
  onBayContextMenu,
  renamingBay,
  onRenamingBayChange,
}: StripBoardProps) {
  const t = useTranslations('strips.bays');
  const dispatch = useAppDispatch();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragBay, setDragBay] = useState<string | null>(null);
  const [rejectBay, setRejectBay] = useState<string | null>(null);
  /** Insertion preview: the strip the drop would land before (null = bay end). */
  const [dropSlot, setDropSlot] = useState<{ bayId: string; beforeStripId: string | null } | null>(
    null,
  );
  /** Height of the card being dragged, so the preview slot matches it. */
  const [dragHeight, setDragHeight] = useState(0);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingBay) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [renamingBay]);

  useEffect(
    () => () => {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
    },
    [],
  );

  const duplicateSquawks = new Set(
    Object.entries(
      tab.strips.reduce<Record<string, number>>((acc, s) => {
        if (s.sqkS) acc[s.sqkS] = (acc[s.sqkS] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .filter(([, n]) => n > 1)
      .map(([code]) => code),
  );

  const kindLabel = (kind: BayKind) => t(`kinds.${kind}`);

  function dropAllowed(bayId: string): boolean {
    if (!dragging) return false;
    const strip = tab.strips.find((s) => s.id === dragging);
    return strip ? checkMove(strip, tab, bayId).ok : false;
  }

  /**
   * Before/after test against the CARD inside the slot wrapper, not
   * the wrapper itself: the wrapper grows by the preview padding, and
   * hit-testing against it would move the decision boundary as the
   * gap opens — the feedback loop behind drag jitter.
   */
  function isBeforeCard(e: React.DragEvent): boolean {
    const card = (e.currentTarget as HTMLElement).firstElementChild;
    const rect = (card ?? e.currentTarget).getBoundingClientRect();
    return e.clientY - rect.top < rect.height / 2;
  }

  /**
   * Opens the insertion preview ("bump" the neighbors apart) for a
   * legal drop, and closes it for illegal or no-op positions — a slot
   * directly adjacent to the dragged card would change nothing.
   */
  function updateDropSlot(bay: Bay, strips: Strip[], anchor: string | null) {
    const dragged = tab.strips.find((s) => s.id === dragging);
    const sameBay = dragged?.bay === bay.id;
    const legal = sameBay || dropAllowed(bay.id);
    let noop = false;
    if (dragged && sameBay) {
      if (anchor === dragged.id) noop = true;
      else if (anchor === null) noop = strips[strips.length - 1]?.id === dragged.id;
      else {
        const anchorIndex = strips.findIndex((s) => s.id === anchor);
        noop = anchorIndex > 0 && strips[anchorIndex - 1]?.id === dragged.id;
      }
    }
    if (!dragged || !legal || noop) {
      if (dropSlot?.bayId === bay.id) setDropSlot(null);
      return;
    }
    if (dropSlot?.bayId !== bay.id || dropSlot.beforeStripId !== anchor) {
      setDropSlot({ bayId: bay.id, beforeStripId: anchor });
    }
  }

  function handleDrop(bay: Bay, e: React.DragEvent, beforeStripId?: string | null) {
    e.preventDefault();
    const stripId = e.dataTransfer.getData('text/plain') || dragging;
    setDragBay(null);
    setDragging(null);
    setDropSlot(null);
    if (!stripId || stripId === beforeStripId) return;
    const strip = tab.strips.find((s) => s.id === stripId);
    const sameBay = strip?.bay === bay.id;
    const verdict = strip ? checkMove(strip, tab, bay.id) : { ok: false as const };
    dispatch(
      stripsActions.stripMoved({
        stripId,
        bayId: bay.id,
        source: 'drag',
        ...(beforeStripId !== undefined ? { beforeStripId } : {}),
      }),
    );
    // Same-bay drops with an anchor are reorders — never shake those.
    if (strip && !verdict.ok && !verdict.silent && !(sameBay && beforeStripId !== undefined)) {
      setRejectBay(bay.id);
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setRejectBay(null), 500);
    }
  }

  function renderBay(bay: Bay, indexInKind: number) {
    const strips = tab.strips.filter((s) => s.bay === bay.id);
    const locked = !!tab.locks[bay.id];
    const isOver = dragBay === bay.id && !!dragging;
    const ok = isOver ? dropAllowed(bay.id) : true;
    const title = bayDisplayTitle(bay, tab, kindLabel);
    const count = strips.length;
    const kindDef = KINDS.find((k) => k.kind === bay.kind);

    return (
      <div
        key={bay.id}
        data-testid={`bay-${bay.id}`}
        style={{
          flex: '1 1 0',
          minHeight: 148,
          display: 'flex',
          flexDirection: 'column',
          animation: rejectBay === bay.id ? 'fscShake 400ms ease' : 'none',
          borderTop: indexInKind > 0 ? '1px solid var(--border-divider-color)' : 'none',
        }}
      >
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBayContextMenu(bay.id, e.clientX, e.clientY);
          }}
          style={{
            flex: 'none',
            height: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 4px 0 12px',
            background: 'var(--container-global-color)',
            borderBottom: '1px solid var(--border-divider-color)',
          }}
        >
          {renamingBay === bay.id ? (
            <input
              ref={renameRef}
              defaultValue={title}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                dispatch(stripsActions.bayRenamed({ bayId: bay.id, title: e.target.value }));
                onRenamingBayChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
              }}
              style={{
                flex: 1,
                minWidth: 0,
                width: '100%',
                boxSizing: 'border-box',
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 670,
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                color: 'var(--element-active-color)',
                background: 'var(--indent-enabled-background-color)',
                border: '1px solid var(--indent-enabled-border-color)',
                padding: '3px 6px',
                outline: '2px solid var(--border-focus-color)',
              }}
            />
          ) : (
            <>
              <span
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onRenamingBayChange(bay.id);
                }}
                title={t('renameTitle')}
                style={{
                  fontSize: 12,
                  lineHeight: '16px',
                  fontWeight: 670,
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  color: 'var(--element-active-color)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                {title}
              </span>
              <span
                style={{
                  fontSize: 12,
                  lineHeight: '16px',
                  color:
                    kindDef?.cap !== undefined && count >= kindDef.cap
                      ? 'var(--alert-caution-color)'
                      : 'var(--element-neutral-color)',
                  fontFeatureSettings: "'tnum' 1",
                  flex: 1,
                }}
              >
                {bay.cap !== undefined ? t('countCap', { n: count, cap: bay.cap }) : count}
              </span>
            </>
          )}
          {locked && (
            <span
              style={{
                fontSize: 10,
                lineHeight: '14px',
                fontWeight: 670,
                letterSpacing: '0.6px',
                color: 'var(--alert-caution-color)',
                border: '1px solid var(--alert-caution-color)',
                padding: '1px 6px',
                whiteSpace: 'nowrap',
              }}
            >
              {t('lockedBadge')}
            </span>
          )}
          <button
            type="button"
            title={t('lockTitle')}
            data-testid={`bay-lock-${bay.id}`}
            onClick={(e) => {
              e.stopPropagation();
              dispatch(stripsActions.bayLockToggled(bay.id));
            }}
            style={{
              width: 32,
              height: 32,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: locked ? 'var(--caution-enabled-background-color)' : 'transparent',
              border: `1px solid ${locked ? 'var(--caution-enabled-border-color)' : 'transparent'}`,
              cursor: 'pointer',
              color: locked ? 'var(--element-active-color)' : 'var(--element-inactive-color)',
              padding: 0,
            }}
          >
            <span style={{ width: 20, height: 20, display: 'block' }}>
              {locked ? (
                <obi-command-locked style={{ width: 20, height: 20, display: 'block' }} />
              ) : (
                <obi-command-available style={{ width: 20, height: 20, display: 'block' }} />
              )}
            </span>
          </button>
          <button
            type="button"
            title={t('menuTitle')}
            data-testid={`bay-menu-${bay.id}`}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              onBayContextMenu(bay.id, rect.right - 288, rect.bottom + 4);
            }}
            style={{
              width: 32,
              height: 32,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid transparent',
              cursor: 'pointer',
              color: 'var(--element-neutral-color)',
              padding: 0,
            }}
          >
            <span style={{ width: 20, height: 20, display: 'block' }}>
              <obi-more-vertical-google style={{ width: 20, height: 20, display: 'block' }} />
            </span>
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = dropAllowed(bay.id) ? 'move' : 'none';
            if (dragBay !== bay.id) setDragBay(bay.id);
            // Empty area below the cards: previews an append at the end.
            updateDropSlot(bay, strips, null);
          }}
          onDragLeave={() => {
            if (dragBay === bay.id) setDragBay(null);
            if (dropSlot?.bayId === bay.id) setDropSlot(null);
          }}
          onDrop={(e) => handleDrop(bay, e, null)}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            scrollbarGutter: 'stable',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: isOver
              ? ok
                ? 'var(--flat-hover-background-color)'
                : 'var(--alert-alarm-inactive-background-color)'
              : locked
                ? 'var(--container-section-color)'
                : 'var(--container-backdrop-color)',
            outline: isOver
              ? `2px dashed ${ok ? 'var(--border-focus-color)' : 'var(--alert-alarm-color)'}`
              : locked
                ? '2px dashed var(--alert-caution-color)'
                : 'none',
            outlineOffset: -3,
            transition: 'background 120ms ease',
          }}
        >
          {strips.map((strip, index) => {
            const slotGap = dragHeight + 8;
            const bumpTop =
              dropSlot?.bayId === bay.id && dropSlot.beforeStripId === strip.id ? slotGap : 0;
            const bumpBottom =
              dropSlot?.bayId === bay.id &&
              dropSlot.beforeStripId === null &&
              index === strips.length - 1
                ? slotGap
                : 0;
            return (
              <div
                key={strip.id}
                data-testid={`strip-slot-${strip.cs}`}
                style={{
                  // The "bump": neighbors slide apart to reveal the slot
                  // the dragged strip would drop into. Padding (not
                  // margin) so the gap stays part of this slot's hit
                  // area — hovering inside it keeps the same anchor
                  // instead of falling through to the bay and jittering.
                  paddingTop: bumpTop,
                  paddingBottom: bumpBottom,
                  transition: 'padding 120ms ease',
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect =
                    dropAllowed(bay.id) || tab.strips.find((s) => s.id === dragging)?.bay === bay.id
                      ? 'move'
                      : 'none';
                  if (dragBay !== bay.id) setDragBay(bay.id);
                  // Top half (and the open gap above) inserts before
                  // this strip, bottom half after.
                  const before = isBeforeCard(e);
                  updateDropSlot(bay, strips, before ? strip.id : (strips[index + 1]?.id ?? null));
                }}
                onDrop={(e) => {
                  e.stopPropagation();
                  const anchor = isBeforeCard(e) ? strip.id : (strips[index + 1]?.id ?? null);
                  handleDrop(bay, e, anchor);
                }}
              >
                <StripCard
                  strip={strip}
                  duplicateSquawks={duplicateSquawks}
                  compact={compact}
                  dragging={dragging === strip.id}
                  onDragStart={(e) => {
                    setDragging(strip.id);
                    setDragHeight(e.currentTarget.getBoundingClientRect().height);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setDragBay(null);
                    setDropSlot(null);
                  }}
                  onContextMenu={(x, y) => onStripContextMenu(strip.id, x, y)}
                  onSuggestAccept={() => {
                    if (strip.suggest) {
                      dispatch(
                        stripsActions.stripMoved({
                          stripId: strip.id,
                          bayId: strip.suggest.bay,
                          source: 'auto',
                        }),
                      );
                    }
                  }}
                  onFreeTextChange={(text) =>
                    dispatch(stripsActions.freeTextSet({ stripId: strip.id, text }))
                  }
                />
              </div>
            );
          })}
          {count === 0 && (
            <div
              style={{
                flex: 'none',
                border: '1px dashed var(--border-outline-color)',
                padding: '14px 8px',
                textAlign: 'center',
                fontSize: 12,
                lineHeight: '16px',
                color: 'var(--element-inactive-color)',
              }}
            >
              {locked ? t('emptyLocked') : t(`empty.${bay.kind}`)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'stretch', overflowX: 'auto' }}
    >
      {KINDS.map((kind) => {
        const bays = tab.bays.filter((b) => b.kind === kind.kind);
        return (
          <div
            key={kind.kind}
            data-testid={`column-${kind.kind}`}
            style={{
              flex: 1,
              minWidth: 268,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflowY: 'auto',
              borderRight: '1px solid var(--border-divider-color)',
            }}
          >
            {bays.map((bay, i) => renderBay(bay, i))}
          </div>
        );
      })}
    </div>
  );
}
