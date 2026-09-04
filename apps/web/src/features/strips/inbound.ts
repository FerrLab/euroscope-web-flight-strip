import type { UnknownAction } from '@reduxjs/toolkit';
import {
  sortStations,
  stationFromController,
  stripPatchFromFlight,
  type ControllerObject,
  type FlightObject,
  type InboundEnvelope,
} from './euroscope';
import { stripsActions } from './slice';
import type { LiveStation } from './types';

export interface InboundUpdates {
  actions: UnknownAction[];
  /** Next controller roster (the caller threads it between envelopes). */
  controllers: LiveStation[];
}

function flightOf(envelope: InboundEnvelope): FlightObject | null {
  const payload = envelope.payload as Partial<FlightObject> | undefined;
  const callsign = (payload?.callsign ?? envelope.callsign) as string | undefined;
  if (!payload || !callsign) return null;
  return { ...payload, callsign } as FlightObject;
}

const ICAO_RE = /^[A-Z]{4}$/;

function upsertsFor(flight: FlightObject, openTabs: string[]): UnknownAction[] {
  const actions: UnknownAction[] = [];
  for (const icao of openTabs) {
    const patch = stripPatchFromFlight(flight, icao);
    if (patch) actions.push(stripsActions.flightUpserted({ icao, patch }));
  }
  return actions;
}

/** Airports a flight mentions — feeds the "Open airport" suggestions. */
function airportsOf(flight: FlightObject): string[] {
  return [flight.origin, flight.destination].filter(
    (icao): icao is string => typeof icao === 'string' && ICAO_RE.test(icao),
  );
}

/** SBGR_TWR → SBGR; observers and odd prefixes yield nothing. */
function airportOfStation(cs: string): string[] {
  const prefix = cs.split('_')[0] ?? '';
  return ICAO_RE.test(prefix) ? [prefix] : [];
}

function withAirportsSeen(updates: InboundUpdates, airports: string[]): InboundUpdates {
  if (airports.length === 0) return updates;
  return { ...updates, actions: [...updates.actions, stripsActions.airportsSeen(airports)] };
}

/**
 * Board updates for one inbound protocol envelope. Pure: the caller
 * threads the controller roster and dispatches the returned actions.
 */
export function inboundUpdatesFor(
  envelope: InboundEnvelope,
  openTabs: string[],
  controllers: LiveStation[],
): InboundUpdates {
  if (envelope.ok === false) return { actions: [], controllers };
  switch (envelope.action) {
    case 'flight_updated':
    case 'get_flight': {
      const flight = flightOf(envelope);
      if (!flight) return { actions: [], controllers };
      return withAirportsSeen(
        { actions: upsertsFor(flight, openTabs), controllers },
        airportsOf(flight),
      );
    }
    case 'flight_removed': {
      const cs = envelope.callsign;
      return { actions: cs ? [stripsActions.flightRemoved(cs)] : [], controllers };
    }
    case 'position_updated': {
      const cs = envelope.callsign;
      const squawk = envelope.payload?.squawk;
      if (!cs || typeof squawk !== 'string') return { actions: [], controllers };
      return { actions: [stripsActions.positionUpdated({ cs, squawk })], controllers };
    }
    case 'controller_updated': {
      const ctrl = envelope.payload as Partial<ControllerObject> | undefined;
      const cs = (ctrl?.callsign ?? envelope.callsign) as string | undefined;
      if (!cs || ctrl?.isController === false) return { actions: [], controllers };
      const station = stationFromController({ ...ctrl, callsign: cs });
      const next = sortStations([...controllers.filter((c) => c.cs !== cs), station]);
      return withAirportsSeen(
        { actions: [stripsActions.controllersUpdated(next)], controllers: next },
        airportOfStation(cs),
      );
    }
    case 'controller_removed': {
      const cs = envelope.callsign;
      if (!cs) return { actions: [], controllers };
      const next = controllers.filter((c) => c.cs !== cs);
      return { actions: [stripsActions.controllersUpdated(next)], controllers: next };
    }
    // The scan responses share the snapshot's payload shape
    // (`flights` / `controllers` arrays), so one handler covers all.
    case 'list_flights':
    case 'list_controllers':
    case 'session_snapshot': {
      const actions: UnknownAction[] = [];
      const airports: string[] = [];
      const flights = envelope.payload?.flights;
      if (Array.isArray(flights)) {
        for (const raw of flights) {
          const flight = raw as Partial<FlightObject>;
          if (typeof flight?.callsign === 'string') {
            actions.push(...upsertsFor(flight as FlightObject, openTabs));
            airports.push(...airportsOf(flight as FlightObject));
          }
        }
      }
      let next = controllers;
      const ctrls = envelope.payload?.controllers;
      if (Array.isArray(ctrls)) {
        const valid = ctrls
          .filter(
            (c): c is ControllerObject => typeof (c as ControllerObject)?.callsign === 'string',
          )
          .filter((c) => c.isController !== false);
        next = sortStations(valid.map(stationFromController));
        actions.push(stripsActions.controllersUpdated(next));
        airports.push(...valid.flatMap((c) => airportOfStation(c.callsign)));
      }
      return withAirportsSeen({ actions, controllers: next }, airports);
    }
    default:
      return { actions: [], controllers };
  }
}
