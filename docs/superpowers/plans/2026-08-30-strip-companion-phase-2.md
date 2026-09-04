# Strip Companion — phase 2 (live EuroScope wiring)

Spec: [2026-08-30-strip-companion-design.md](../specs/2026-08-30-strip-companion-design.md)
Protocol: euroscope-longpolling-connector `PROTOCOL.md` (JSON Contract v1).

Goal: the board drives — and is driven by — the live EuroScope session
through the existing gateway transport. The phase-1 demo feed becomes
the offline fallback.

## Inbound (plugin → board)

`useStripsGatewayBridge` reuses `useGatewayPoll` (gateway slice ring)
and maps each new inbound envelope:

| Envelope                                               | Board effect                                                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flight_updated` / snapshot flight                     | `flightUpserted` — insert into the mapped bay, or patch fields; a changed EuroScope ground state on an existing strip becomes a _suggestion_, never a forced move |
| `flight_removed`                                       | archive silently + feed log                                                                                                                                       |
| `position_updated`                                     | `positionUpdated` — live transponder squawk                                                                                                                       |
| `controller_updated` / `controller_removed` / snapshot | `controllersUpdated` — live station list for the transfer modal                                                                                                   |

Mapping rules (`euroscope.ts`): direction from origin/destination vs
the tab ICAO (both = local/VFR, neither = ignored); ground state →
bay kind (NSTS·NOTC → Pending, CLEA → Cleared, STUP·PUSH → Pushback,
TAXI·TXIN → Taxi, DEPA → Runway, ARR/PARK per direction); CFL from
`clearedAltitude` (0 none, 1 ILS, 2 VIS, else FL); scratchpad → free
text; `clearanceFlag` → cleared; `handoffTargetController` → pending
handoff chip.

## Outbound (board → plugin)

RTK listener middleware (`outbound.ts` computes the envelope, the
bridge registers listeners while the page is mounted; sends only when
`pluginConnected`, and only after verifying the reducer accepted the
action):

| Board action                         | Command                                            |
| ------------------------------------ | -------------------------------------------------- |
| strip moved (user/suggestion accept) | `set_ground_state` for the target bay kind         |
| clearance issued                     | `set_ground_state CLEA`                            |
| PDC sent                             | `send_private_message` with the PDC text           |
| transfer offered / cancelled         | `transfer {controller}` / `assume`                 |
| free text edited                     | `set_scratchpad`                                   |
| FPL applied                          | `set_squawk` / `set_sid` / `set_star` when changed |

## Demo fallback

The phase-1 simulated feed starts only while the plugin is offline and
stops permanently the moment `pluginConnected` flips true.
