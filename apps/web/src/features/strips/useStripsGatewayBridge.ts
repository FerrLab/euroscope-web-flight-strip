'use client';

import { useEffect, useRef } from 'react';
import { addListener, isAnyOf, type UnknownAction } from '@reduxjs/toolkit';
import { gatewayApi } from '@/features/gateway/api';
import { useGatewayPoll } from '@/features/gateway/useGatewayPoll';
import { useAppDispatch, useAppSelector } from '@/shared/store/hooks';
import type { AppDispatch, AppState } from '@/shared/store';
import { parseInboundEnvelope } from './euroscope';
import { inboundUpdatesFor } from './inbound';
import { outboundEnvelopesFor } from './outbound';
import { stripsActions } from './slice';
import type { LiveStation } from './types';

const USER_ACTIONS = isAnyOf(
  stripsActions.stripMoved,
  stripsActions.clearanceIssued,
  stripsActions.dclSent,
  stripsActions.transferOffered,
  stripsActions.transferCancelled,
  stripsActions.freeTextSet,
  stripsActions.fplApplied,
  stripsActions.stripUnarchived,
);

/**
 * The live EuroScope seam. Inbound: consumes the gateway console ring
 * (long-poll) and maps protocol events onto the board. Outbound:
 * mirrors user-driven board actions as gateway commands — only while
 * the plugin is connected, and only when the reducer accepted the
 * action (a guard-rejected move emits nothing).
 */
export function useStripsGatewayBridge(): { pluginConnected: boolean } {
  const dispatch = useAppDispatch();
  const messages = useAppSelector((s) => s.gateway.messages);
  const tabsOrder = useAppSelector((s) => s.strips.tabsOrder);
  const pluginConnected = useAppSelector((s) => s.gateway.pluginConnected);

  useGatewayPoll();

  // Inbound: process only messages we have not seen yet. A reset
  // batch replaces the ring, so a shrink restarts from zero.
  const processedCount = useRef(0);
  const controllers = useRef<LiveStation[]>([]);

  useEffect(() => {
    if (messages.length < processedCount.current) processedCount.current = 0;
    for (let i = processedCount.current; i < messages.length; i++) {
      const message = messages[i];
      if (message.direction !== 'in') continue;
      const envelope = parseInboundEnvelope(message.envelope);
      if (!envelope) continue;
      const updates = inboundUpdatesFor(envelope, tabsOrder, controllers.current);
      controllers.current = updates.controllers;
      for (const action of updates.actions) dispatch(action);
    }
    processedCount.current = messages.length;
  }, [messages, tabsOrder, dispatch]);

  // Session scan: don't wait for incremental events — ask the plugin
  // for everything it can see, on connect and again whenever a new
  // airport tab opens (flights are mapped only onto open tabs).
  useEffect(() => {
    if (!pluginConnected) return;
    dispatch(gatewayApi.endpoints.sendCommand.initiate({ action: 'list_flights' }));
    dispatch(gatewayApi.endpoints.sendCommand.initiate({ action: 'list_controllers' }));
  }, [pluginConnected, tabsOrder, dispatch]);

  // Outbound: one dynamic listener for the lifetime of the page.
  useEffect(() => {
    const unsubscribe = dispatch(
      addListener({
        matcher: USER_ACTIONS,
        effect: (action, api) => {
          const after = api.getState() as AppState;
          if (!after.gateway.pluginConnected) return;
          const before = api.getOriginalState() as AppState;
          const envelopes = outboundEnvelopesFor(
            action as UnknownAction,
            before.strips,
            after.strips,
          );
          for (const envelope of envelopes) {
            (api.dispatch as AppDispatch)(gatewayApi.endpoints.sendCommand.initiate(envelope));
          }
        },
      }),
    ) as unknown as () => void;
    return unsubscribe;
  }, [dispatch]);

  return { pluginConnected };
}
