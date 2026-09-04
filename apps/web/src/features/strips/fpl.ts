import type { FplData, Metar, Strip } from './types';

export interface FplDraft extends FplData {
  ident: string;
  actype: string;
  wake: string;
  adep: string;
  ades: string;
  sqkA: string;
  proc: string;
  rwy: string;
  cfl: string;
  gate: string;
  freeText: string;
}

/**
 * Demo-fixture ICAO field 15/18 data for the seeded callsigns (from
 * the Strip Companion design). Real values arrive with gateway
 * flight-plan sync in phase 2.
 */
const FPLSEED: Record<string, Partial<FplData>> = {
  TAP751: {
    eobt: '0545',
    tas: 'N0447',
    rfl: 'F360',
    route: 'INBOM UN873 STG UN976 LMG UT158 ERIGA',
    eet: '0215',
    altn: 'LFPG',
    other: 'PBN/A1B1C1D1O1S2 DOF/260712 REG/CSTNV OPR/TAP PER/C',
  },
  RYR2394: {
    eobt: '0555',
    tas: 'N0442',
    rfl: 'F370',
    route: 'NAKUV UN10 VASTO UM191 GANTO UP620 SAM DCT',
    eet: '0230',
    altn: 'EGGW',
    other: 'PBN/B1D1O1S1 DOF/260712 REG/EIDWF OPR/RYR',
  },
  CSDHS: {
    eobt: '0600',
    tas: 'N0105',
    rfl: 'VFR',
    route: 'DCT SESIMBRA DCT',
    eet: '0100',
    altn: 'LPCS',
    other: 'DOF/260712 RMK/LOCAL VFR SOUTH',
  },
  TAP1901: {
    eobt: '0605',
    tas: 'N0450',
    rfl: 'F380',
    route: 'ODEMI UN873 MOKOR UN865 DIDRU UZ650 NTM T163 SPESA',
    eet: '0245',
    altn: 'EDDK',
    other: 'PBN/A1B1C1D1O1S2 DOF/260712 REG/CSTJR OPR/TAP PER/C',
  },
  SWR739: {
    eobt: '0610',
    tas: 'N0448',
    rfl: 'F390',
    route: 'INBOM UN873 STG UN871 MOU UM729 GG DCT HOC',
    eet: '0220',
    altn: 'LSGG',
    other: 'PBN/A1B1C1D1O1S2 DOF/260712 REG/HBJCM OPR/SWR',
  },
  TAP081: {
    eobt: '0620',
    tas: 'N0480',
    rfl: 'F350',
    route: 'ODEMI UN857 CVS DCT MOTGA DCT 2740N DCT VUKIT UZ10 IPERA',
    eet: '0940',
    altn: 'SBKP',
    other: 'PBN/A1B1C1D1L1O1S2 DOF/260712 REG/CSTUB OPR/TAP PER/D RMK/ETOPS180',
  },
  THY1756: {
    eobt: '0615',
    tas: 'N0452',
    rfl: 'F370',
    route: 'NAKUV UN975 BLN UN851 SOSUR UL620 ETIDA',
    eet: '0410',
    altn: 'LTBA',
    other: 'PBN/A1B1C1D1O1S2 DOF/260712 REG/TCLSE OPR/THY',
  },
  VLG8460: {
    eobt: '0410',
    tas: 'N0445',
    rfl: 'F360',
    route: 'OKABI UN976 DIVAL UN870 ZMR DCT TROIA',
    eet: '0140',
    altn: 'LPFR',
    other: 'PBN/B1D1O1S1 DOF/260712 REG/ECNDA OPR/VLG',
  },
  EIN486: {
    eobt: '0330',
    tas: 'N0450',
    rfl: 'F380',
    route: 'BAGSO DCT LULOX DCT KURIS UN976 NAKUV',
    eet: '0230',
    altn: 'LPFR',
    other: 'PBN/A1B1C1D1O1S2 DOF/260712 REG/EIDVN OPR/EIN',
  },
  IBE3117: {
    eobt: '0640',
    tas: 'N0446',
    rfl: 'F330',
    route: 'ODEMI UN870 ZMR DCT PDT DCT TLD',
    eet: '0055',
    altn: 'LETO',
    other: 'PBN/A1B1C1D1O1S2 DOF/260712 REG/ECNFS OPR/IBE',
  },
  TAP1200: {
    eobt: '0540',
    tas: 'N0430',
    rfl: 'F240',
    route: 'TURON UP600 UREDI DCT INBOM',
    eet: '0045',
    altn: 'LPBJ',
    other: 'PBN/A1B1C1D1O1S2 DOF/260712 REG/CSTPQ OPR/TAP',
  },
  RYR55PM: {
    eobt: '0550',
    tas: 'N0442',
    rfl: 'F360',
    route: 'ODEGI UN976 ZMR UN10 VASTO UM191 GANTO UP620 SAM',
    eet: '0215',
    altn: 'EGGW',
    other: 'PBN/B1D1O1S1 DOF/260712 REG/EIEVM OPR/RYR',
  },
  WZZ1078: {
    eobt: '0600',
    tas: 'N0451',
    rfl: 'F380',
    route: 'ODEGI UM616 NASOS UN869 DITON UZ651 LUSOD T709 EMBIK',
    eet: '0330',
    altn: 'EPKK',
    other: 'PBN/A1B1C1D1O1S2 DOF/260712 REG/HALXJ OPR/WZZ',
  },
  EZY8695: {
    eobt: '0300',
    tas: 'N0447',
    rfl: 'F370',
    route: 'SFD UM605 XAMAB UN976 RONTO DCT TURON',
    eet: '0210',
    altn: 'LPPT',
    other: 'PBN/B1D1O1S1 DOF/260712 REG/GEZBY OPR/EZY',
  },
  TVF77QG: {
    eobt: '0345',
    tas: 'N0444',
    rfl: 'F360',
    route: 'ERIGA UT158 TBO UN10 KURIS DCT TURON',
    eet: '0145',
    altn: 'LPPT',
    other: 'PBN/B1D1O1S1 DOF/260712 REG/FHTVD OPR/TVF',
  },
  EXS452: {
    eobt: '0245',
    tas: 'N0448',
    rfl: 'F380',
    route: 'MONTY UN862 KURIS UN976 NAKUV DCT ALPOR',
    eet: '0240',
    altn: 'LPPT',
    other: 'PBN/B1D1O1S1 DOF/260712 REG/GJZHY OPR/EXS',
  },
};

/** Editable draft for the FPL modal: strip amendments > seed > defaults. */
export function fplDraftOf(s: Strip): FplDraft {
  const seed = s.fpl ?? FPLSEED[s.cs] ?? {};
  const vfr = s.dir === 'VFR';
  return {
    ident: s.cs,
    rules: seed.rules ?? (vfr ? 'V' : 'I'),
    ftype: seed.ftype ?? (vfr ? 'G' : 'S'),
    num: seed.num ?? '1',
    actype: s.type,
    wake: s.wake,
    equip: seed.equip ?? (vfr ? 'SDFGY/C' : 'SDE2E3FGHIRWY/LB1'),
    adep: s.adep,
    eobt: seed.eobt ?? '0530',
    tas: seed.tas ?? (vfr ? 'N0105' : 'N0450'),
    rfl: seed.rfl ?? (vfr ? 'VFR' : 'F350'),
    route: seed.route ?? 'DCT',
    ades: s.ades,
    eet: seed.eet ?? (vfr ? '0100' : '0200'),
    altn: seed.altn ?? '',
    altn2: seed.altn2 ?? '',
    other: seed.other ?? 'PBN/B2C2D2O2S1 DOF/260712 RMK/VATSIM',
    sqkA: s.sqkA,
    proc: s.proc,
    rwy: s.rwy,
    cfl: s.cfl,
    gate: s.gate,
    freeText: s.freeText,
  };
}

/**
 * Pre-departure clearance body. Aviation-English datalink phrasing —
 * an operational message, deliberately not localized
 * (docs/conventions/i18n.md, "What NOT to translate").
 */
export function dclTextFor(strip: Strip, metar: Metar, remark: string, utcTime: string): string {
  const initialClimb = (parseInt(strip.cfl, 10) || 0) * 100;
  const available = (value: string) => value !== '' && value !== '—';
  const groundLine = [
    strip.gate ? `STAND ${strip.gate}.` : '',
    available(metar.qnh) ? `QNH ${metar.qnh}.` : '',
    available(metar.atis) ? `ATIS ${metar.atis}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const lines = [
    `PDC ${strip.cs} — ${utcTime}Z`,
    `CLEARED TO ${strip.ades} VIA ${strip.proc} DEPARTURE, RUNWAY ${strip.rwy}.`,
    `INITIAL CLIMB ${initialClimb} FT. SQUAWK ${strip.sqkA}.`,
    ...(groundLine ? [groundLine] : []),
    ...(available(metar.clrNote) ? [`WHEN READY CONTACT ${metar.clrNote}.`] : []),
  ];
  if (remark.trim()) lines.push(`RMK ${remark.toUpperCase()}`);
  return lines.join('\n');
}

/**
 * The PDC as it must travel over EuroScope's chat: one line, ASCII
 * only — the client is not UTF-8 (em-dashes mojibake) and private
 * messages truncate at the first newline.
 */
export function dclWireText(text: string): string {
  return text
    .replaceAll('\n', ' ')
    .replaceAll('—', '-')
    .replaceAll('–', '-')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
