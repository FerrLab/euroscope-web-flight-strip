import { RWYINFO, type RunwayInfo } from './airports';
import type { Metar } from './types';

export interface FlightCategory {
  cat: 'VFR' | 'MVFR' | 'IFR' | 'LIFR';
  color: string;
  note: 'visual' | 'marginal' | 'instrument' | 'lowInstrument';
}

/** US-style flight categories from visibility (m) and ceiling (ft). */
export function catOf(m: Metar): FlightCategory {
  if (m.visM < 1600 || m.ceilFt < 500) {
    return { cat: 'LIFR', color: 'var(--base-purple-500)', note: 'lowInstrument' };
  }
  if (m.visM < 5000 || m.ceilFt < 1000) {
    return { cat: 'IFR', color: 'var(--alert-alarm-color)', note: 'instrument' };
  }
  if (m.visM <= 8000 || m.ceilFt <= 3000) {
    return {
      cat: 'MVFR',
      color: 'var(--instrument-enhanced-secondary-dif-color)',
      note: 'marginal',
    };
  }
  return { cat: 'VFR', color: 'var(--alert-success-color)', note: 'visual' };
}

export interface Wind {
  dir: number;
  spd: number;
  gust: number | null;
}

export function windOf(m: Metar): Wind {
  const mm = /(\d{3})°\/(\d{2,3})/.exec(m.wind || '');
  const g = /G\s?(\d+)/.exec(m.windNote || '');
  return { dir: mm ? +mm[1] : 0, spd: mm ? +mm[2] : 0, gust: g ? +g[1] : null };
}

export interface RoseTick {
  rot: number;
  y2: number;
  color: string;
}

export interface Rose {
  rwyId: string;
  hdgTxt: string;
  rwyRot: number;
  windRot: number;
  /** Label anchor for the runway id at the far (opposite) end. */
  lx: string;
  ly: string;
  ticks: RoseTick[];
  hwLabel: 'HEADWIND' | 'TAILWIND';
  hwVal: string;
  hwGust: string;
  hwColor: string;
  xwVal: string;
  xwSide: 'L' | 'R';
  xwGust: string;
  xwColor: string;
}

/**
 * Wind-rose geometry + head/crosswind decomposition for the active
 * runway. Crosswind coloring uses the gust value when present
 * (caution ≥ 12 kt, alarm ≥ 20 kt).
 */
export function roseOf(m: Metar, icao: string): Rose {
  const rw: RunwayInfo =
    RWYINFO[icao] ??
    ({
      id: m.rwys[0] ?? '—',
      hdg: ((parseInt(m.rwys[0] ?? '', 10) || 0) * 10) % 360,
      opp: '',
    } satisfies RunwayInfo);
  const w = windOf(m);
  const rad = ((w.dir - rw.hdg) * Math.PI) / 180;
  const hw = w.spd * Math.cos(rad);
  const xw = w.spd * Math.sin(rad);
  const ghw = w.gust !== null ? w.gust * Math.cos(rad) : null;
  const gxw = w.gust !== null ? w.gust * Math.sin(rad) : null;
  const xwAbs = Math.round(Math.abs(xw));
  const xwMax = gxw !== null ? Math.round(Math.abs(gxw)) : xwAbs;
  const labelRad = (((rw.hdg + 180) % 360) * Math.PI) / 180;
  return {
    rwyId: rw.id,
    hdgTxt: `${String(rw.hdg).padStart(3, '0')}°`,
    rwyRot: rw.hdg,
    windRot: w.dir,
    lx: (36 * Math.sin(labelRad)).toFixed(1),
    ly: (-36 * Math.cos(labelRad)).toFixed(1),
    ticks: Array.from({ length: 12 }, (_, i) => ({
      rot: i * 30,
      y2: (i * 30) % 90 === 0 ? -51 : -54,
      color:
        (i * 30) % 90 === 0
          ? 'var(--instrument-tick-mark-primary-color)'
          : 'var(--instrument-tick-mark-secondary-color)',
    })),
    hwLabel: hw >= -0.5 ? 'HEADWIND' : 'TAILWIND',
    hwVal: String(Math.round(Math.abs(hw))),
    hwGust: ghw !== null ? `G ${Math.round(Math.abs(ghw))}` : '',
    hwColor: hw >= -0.5 ? 'var(--element-active-color)' : 'var(--alert-caution-color)',
    xwVal: String(xwAbs),
    xwSide: xw >= 0 ? 'R' : 'L',
    xwGust: gxw !== null ? `G ${Math.round(Math.abs(gxw))}` : '',
    xwColor:
      xwMax >= 20
        ? 'var(--alert-alarm-color)'
        : xwMax >= 12
          ? 'var(--alert-caution-color)'
          : 'var(--element-active-color)',
  };
}
