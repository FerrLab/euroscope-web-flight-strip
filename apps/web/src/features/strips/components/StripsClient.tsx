'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'react-redux';
import { useTranslations } from 'next-intl';
import { ObcTopBar } from '@oicl/openbridge-webcomponents-react/components/top-bar/top-bar';
import { ObcClock } from '@oicl/openbridge-webcomponents-react/components/clock/clock';
import { ObcStatusIndicator } from '@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator';
import { ObcTabRow } from '@oicl/openbridge-webcomponents-react/components/tab-row/tab-row';
import { StatusIndicatorStatus } from '@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js';
import type { AppStore } from '@/shared/store';
import { useAppDispatch, useAppSelector } from '@/shared/store/hooks';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AIRPORTS, stationsFor } from '../airports';
import { createDemoFeed, type DemoFeed } from '../demoFeed';
import { extractLayout, loadLayout, saveLayout } from '../persistence';
import { stripsActions } from '../slice';
import { useStripsGatewayBridge } from '../useStripsGatewayBridge';
import './obi-icons';
import { ActivityFeed } from './ActivityFeed';
import { AddAirportModal } from './AddAirportModal';
import { AwosPanel } from './AwosPanel';
import { BayContextMenu } from './BayContextMenu';
import { bayDisplayTitle } from './bayTitle';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { DclModal } from './DclModal';
import { FplModal } from './FplModal';
import { StripBoard } from './StripBoard';
import { StripContextMenu } from './StripContextMenu';
import { ToastStack } from './ToastStack';
import { TransferModal } from './TransferModal';
import type { BayKind } from '../types';

const KEYFRAMES = `
@keyframes fscSlideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
@keyframes fscShake { 10%, 90% { transform: translateX(-2px); } 25%, 75% { transform: translateX(3px); } 50% { transform: translateX(-3px); } }
@keyframes fscPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes fscToastIn { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }
@keyframes fscFadeIn { from { opacity: 0; } to { opacity: 1; } }
`;

type ModalState =
  | { type: 'fpl'; stripId: string }
  | { type: 'dcl'; stripId: string }
  | { type: 'confirm'; stripId: string }
  | { type: 'xfr'; stripId: string }
  | { type: 'addtab' }
  | null;

interface MenuPos {
  x: number;
  y: number;
}

const THEMES = ['bright', 'day', 'dusk', 'night'] as const;

function PaletteIcon({ theme }: { theme: (typeof THEMES)[number] }) {
  const style: React.CSSProperties = { width: 24, height: 24, display: 'block' };
  if (theme === 'bright') return <obi-palette-day-bright style={style} />;
  if (theme === 'day') return <obi-palette-day style={style} />;
  if (theme === 'dusk') return <obi-palette-dusk style={style} />;
  return <obi-palette-night style={style} />;
}

export function StripsClient() {
  const t = useTranslations('strips');
  const dispatch = useAppDispatch();
  const store = useStore() as AppStore;
  const { theme, setTheme } = useTheme();

  const tabsOrder = useAppSelector((s) => s.strips.tabsOrder);
  const tabs = useAppSelector((s) => s.strips.tabs);
  const activeTab = useAppSelector((s) => s.strips.activeTab);
  const feedOn = useAppSelector((s) => s.strips.feedOn);
  const liveControllers = useAppSelector((s) => s.strips.controllers);
  const tab = tabs[activeTab];
  const { pluginConnected } = useStripsGatewayBridge();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [compact] = useState(false);
  const [stripCtx, setStripCtx] = useState<(MenuPos & { stripId: string }) | null>(null);
  const [bayCtx, setBayCtx] = useState<(MenuPos & { bayId: string }) | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [renamingBay, setRenamingBay] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date().toISOString());

  const demoFeed = useRef<DemoFeed | null>(null);
  const simTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Restore the persisted board layout once, before anything else runs.
  useEffect(() => {
    const saved = loadLayout();
    if (saved) dispatch(stripsActions.layoutRestored(saved));
  }, [dispatch]);

  // Persist the layout whenever it changes (tabs, bays, locks).
  const layoutJson = useAppSelector((s) => JSON.stringify(extractLayout(s.strips)));
  useEffect(() => {
    saveLayout(store.getState().strips);
  }, [layoutJson, store]);

  // The demo feed is the offline fallback: it starts on mount and dies
  // for good the moment the real plugin connects (bridge above).
  useEffect(() => {
    demoFeed.current = createDemoFeed(store);
    demoFeed.current.start();
    return () => demoFeed.current?.stop();
  }, [store]);

  useEffect(() => {
    if (pluginConnected) demoFeed.current?.stop();
  }, [pluginConnected]);

  useEffect(() => {
    const timers = simTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date().toISOString()), 1000);
    return () => clearInterval(interval);
  }, []);

  const closeOverlays = useCallback(() => {
    setStripCtx(null);
    setBayCtx(null);
    setPaletteOpen(false);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeOverlays();
        setModal(null);
        setRenamingBay(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeOverlays]);

  if (!tab) return null;

  const findStrip = (stripId: string) => {
    for (const icao of tabsOrder) {
      const hit = tabs[icao].strips.find((s) => s.id === stripId);
      if (hit) return hit;
    }
    return undefined;
  };

  const modalStrip = modal && 'stripId' in modal ? findStrip(modal.stripId) : undefined;
  const ctxStrip = stripCtx ? findStrip(stripCtx.stripId) : undefined;
  const ctxBay = bayCtx ? tab.bays.find((b) => b.id === bayCtx.bayId) : undefined;

  function sendDcl(stripId: string, remark: string) {
    // Sending the PDC is the whole story — the strip is fully cleared
    // on send, no acknowledgement round-trip.
    dispatch(stripsActions.dclSent({ stripId, remark }));
  }

  function offerTransfer(stripId: string, stationCs: string) {
    dispatch(stripsActions.transferOffered({ stripId, to: stationCs }));
    if (pluginConnected) return; // live: acceptance comes from flight updates
    simTimers.current.push(
      setTimeout(() => {
        const strip = store.getState().strips.tabs[activeTab]?.strips.find((s) => s.id === stripId);
        if (strip?.xfr?.to !== stationCs || strip.xfr.state !== 'PENDING') return;
        dispatch(stripsActions.transferAccepted(stripId));
        simTimers.current.push(
          setTimeout(() => {
            const again = store
              .getState()
              .strips.tabs[activeTab]?.strips.find((s) => s.id === stripId);
            if (again?.xfr?.state === 'ACCEPTED') {
              dispatch(
                stripsActions.eventLogged({
                  icao: activeTab,
                  kind: 'info',
                  key: 'archivedAfterHandoff',
                  params: { cs: again.cs },
                  src: 'auto',
                }),
              );
              dispatch(stripsActions.stripArchived({ stripId, silent: true }));
            }
          }, 3000),
        );
      }, 5000),
    );
  }

  function onLiveToggle(on: boolean) {
    dispatch(stripsActions.feedToggled(on));
    if (on) demoFeed.current?.resume();
  }

  return (
    <div
      role="presentation"
      onClick={() => {
        if (stripCtx || bayCtx || paletteOpen) closeOverlays();
      }}
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--container-backdrop-color)',
        color: 'var(--element-active-color)',
        fontFeatureSettings: "'ss04' 1, 'liga' 0",
        minWidth: 1280,
      }}
    >
      {/* Board-local keyframes (design: fsc* animations). */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      <ObcTopBar
        appTitle={t('appTitle')}
        pageName={t('pageName', { icao: activeTab, name: AIRPORTS[activeTab]?.name ?? '' })}
        showClock
        showDimmingButton
        menuButtonActivated={sidebarOpen}
        dimmingButtonActivated={paletteOpen}
        onMenuButtonClicked={() => setSidebarOpen((open) => !open)}
        onDimmingButtonClicked={() => setPaletteOpen((open) => !open)}
        style={{ flex: 'none', position: 'relative', zIndex: 30 }}
      >
        <ObcClock slot="clock" date={clock} showSeconds showTimezone timeZoneOffsetHours={0} />
        <div
          slot="alerts"
          style={{ display: 'flex', alignItems: 'center', gap: 16, paddingRight: 12 }}
        >
          <ObcStatusIndicator
            status={
              pluginConnected ? StatusIndicatorStatus.running : StatusIndicatorStatus.inactive
            }
          >
            {t('topbar.euroscope')}
          </ObcStatusIndicator>
          {pluginConnected ? (
            <span
              style={{ fontSize: 12, lineHeight: '16px', color: 'var(--element-neutral-color)' }}
            >
              {AIRPORTS[activeTab]?.pos ?? ''}
            </span>
          ) : (
            <span
              data-testid="plugin-offline"
              style={{
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 670,
                letterSpacing: '0.4px',
                color: 'var(--alert-caution-color)',
                border: '1px solid var(--alert-caution-color)',
                padding: '2px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              {t('topbar.offline')}
            </span>
          )}
        </div>
      </ObcTopBar>

      {paletteOpen && (
        <div
          data-testid="palette-menu"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: 52,
            right: 64,
            zIndex: 60,
            background: 'var(--container-global-color)',
            border: '1px solid var(--border-outline-color)',
            boxShadow: 'var(--shadow-floating)',
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            width: 208,
            animation: 'fscFadeIn 120ms ease',
          }}
        >
          <div
            style={{
              fontSize: 12,
              lineHeight: '16px',
              color: 'var(--element-neutral-color)',
              padding: '8px 12px 4px',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}
          >
            {t('palette.title')}
          </div>
          {THEMES.map((themeId) => {
            const active = theme === themeId;
            return (
              <button
                key={themeId}
                type="button"
                onClick={() => {
                  void setTheme(themeId);
                  setPaletteOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  background: active ? 'var(--selected-enabled-background-color)' : 'transparent',
                  border: `1px solid ${active ? 'var(--selected-enabled-border-color)' : 'transparent'}`,
                  color: 'var(--element-active-color)',
                  cursor: 'pointer',
                  fontSize: 16,
                  lineHeight: '24px',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    display: 'block',
                    color: 'var(--element-neutral-color)',
                    flex: 'none',
                  }}
                >
                  <PaletteIcon theme={themeId} />
                </span>
                <span style={{ flex: 1 }}>{t(`palette.${themeId}`)}</span>
                <span style={{ fontSize: 12, color: 'var(--instrument-enhanced-primary-color)' }}>
                  {active ? t('palette.active') : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div
        style={{
          flex: 'none',
          background: 'var(--container-global-color)',
          borderBottom: '1px solid var(--border-divider-color)',
          display: 'flex',
          alignItems: 'flex-end',
          padding: '0 8px',
          position: 'relative',
          zIndex: 20,
        }}
      >
        <ObcTabRow
          style={{ flex: 1 }}
          tabs={tabsOrder.map((icao) => ({
            id: icao,
            title: icao,
            hasBadge: tabs[icao].unseen > 0,
            badgeCount: tabs[icao].unseen,
            badgeShowNumber: true,
          }))}
          selectedTabId={activeTab}
          hasClose
          hasAddNewTab
          hug
          onTabSelected={(e) => dispatch(stripsActions.tabSelected(e.detail.id))}
          onTabClosed={(e) => dispatch(stripsActions.tabClosed(e.detail.id))}
          onAddNewTab={() => setModal({ type: 'addtab' })}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'stretch' }}>
        {sidebarOpen && (
          <div
            data-testid="awos-sidebar"
            style={{
              width: 296,
              flex: 'none',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              background: 'var(--container-section-color)',
              borderRight: '1px solid var(--border-divider-color)',
            }}
          >
            <AwosPanel metar={tab.metar} icao={activeTab} />
            <ActivityFeed
              icao={activeTab}
              feed={tab.feed}
              archived={tab.archived}
              liveOn={feedOn}
              onLiveToggle={onLiveToggle}
              onRestore={(cs) => dispatch(stripsActions.stripUnarchived({ icao: activeTab, cs }))}
              resolveBay={(bayId) => {
                const bay = tab.bays.find((b) => b.id === bayId);
                return bay
                  ? bayDisplayTitle(bay, tab, (kind: BayKind) => t(`bays.kinds.${kind}`))
                  : bayId;
              }}
            />
          </div>
        )}

        <StripBoard
          tab={tab}
          compact={compact}
          onStripContextMenu={(stripId, x, y) => {
            setBayCtx(null);
            setPaletteOpen(false);
            setStripCtx({ stripId, x, y });
          }}
          onBayContextMenu={(bayId, x, y) => {
            setStripCtx(null);
            setPaletteOpen(false);
            setBayCtx({ bayId, x, y });
          }}
          renamingBay={renamingBay}
          onRenamingBayChange={setRenamingBay}
        />
      </div>

      {ctxStrip && stripCtx && (
        <StripContextMenu
          strip={ctxStrip}
          tab={tab}
          x={stripCtx.x}
          y={stripCtx.y}
          onClose={() => setStripCtx(null)}
          onOpenFpl={() => {
            setStripCtx(null);
            setModal({ type: 'fpl', stripId: ctxStrip.id });
          }}
          onOpenDcl={() => {
            setStripCtx(null);
            setModal({ type: 'dcl', stripId: ctxStrip.id });
          }}
          onOpenXfr={() => {
            setStripCtx(null);
            setModal({ type: 'xfr', stripId: ctxStrip.id });
          }}
          onOpenConfirm={() => {
            setStripCtx(null);
            setModal({ type: 'confirm', stripId: ctxStrip.id });
          }}
        />
      )}

      {ctxBay && bayCtx && (
        <BayContextMenu
          bay={ctxBay}
          tab={tab}
          x={bayCtx.x}
          y={bayCtx.y}
          onClose={() => setBayCtx(null)}
          onRename={() => {
            setRenamingBay(ctxBay.id);
            setBayCtx(null);
          }}
        />
      )}

      {modal?.type === 'fpl' && modalStrip && (
        <FplModal strip={modalStrip} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'dcl' && modalStrip && (
        <DclModal
          strip={modalStrip}
          metar={tab.metar}
          onSend={(remark) => sendDcl(modalStrip.id, remark)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'confirm' && modalStrip && (
        <ConfirmDeleteModal strip={modalStrip} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'xfr' && modalStrip && (
        <TransferModal
          strip={modalStrip}
          stations={liveControllers.length > 0 ? liveControllers : stationsFor(activeTab)}
          onTransfer={(stationCs) => {
            offerTransfer(modalStrip.id, stationCs);
            setModal(null);
          }}
          onCancelPending={() => dispatch(stripsActions.transferCancelled(modalStrip.id))}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'addtab' && <AddAirportModal onClose={() => setModal(null)} />}

      <ToastStack />
    </div>
  );
}
