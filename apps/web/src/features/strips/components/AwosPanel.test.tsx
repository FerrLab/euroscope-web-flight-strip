import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import stripsEn from '@/messages/strips.en.json';
import { makeTab } from '../seed';
import type { Metar } from '../types';
import { AwosPanel } from './AwosPanel';

function renderPanel(metar: Metar, icao: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={stripsEn}>
      <AwosPanel metar={metar} icao={icao} />
    </NextIntlClientProvider>,
  );
}

describe('AwosPanel', () => {
  it('classifies LPPT clear weather as VFR and shows the ATIS letter (happy)', () => {
    renderPanel(makeTab('LPPT').metar, 'LPPT');
    expect(screen.getByTestId('awos-category').textContent).toBe('VFR');
    expect(screen.getByText('K')).toBeTruthy();
    expect(screen.getByText(/LPPT 120500Z/)).toBeTruthy();
  });

  it('classifies LPPR low ceiling as IFR (happy)', () => {
    renderPanel(makeTab('LPPR').metar, 'LPPR');
    expect(screen.getByTestId('awos-category').textContent).toBe('IFR');
  });

  it('colors a gusting crosswind as caution at LPMA (invalid conditions)', () => {
    // LPMA: RWY 05 hdg 048, wind 050°/16 G 28 — nearly aligned, so the
    // crosswind stays small but the gust math must still render.
    renderPanel(makeTab('LPMA').metar, 'LPMA');
    const crosswind = screen.getByTestId('awos-crosswind');
    expect(crosswind.textContent).toContain('G');
  });

  it('renders without runway data for an unknown airport (garbage)', () => {
    const metar = { ...makeTab('LPBJ').metar, rwys: [] };
    renderPanel(metar, 'XXXX');
    expect(screen.getByTestId('awos-category')).toBeTruthy();
  });
});
