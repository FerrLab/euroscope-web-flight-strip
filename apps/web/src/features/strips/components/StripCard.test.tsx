import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import stripsEn from '@/messages/strips.en.json';
import { makeStrip } from '../seed';
import type { Strip } from '../types';
import { StripCard } from './StripCard';

function strip(overrides: Partial<Strip> = {}): Strip {
  return {
    ...makeStrip({
      id: 's1',
      cs: 'TAP751',
      airline: 'TAP Air Portugal',
      type: 'A320',
      wake: 'M',
      adep: 'LPPT',
      ades: 'LFPO',
      gate: '512',
      sqkA: '2461',
      proc: 'INBOM5S',
      procKind: 'SID',
      rwy: '21',
      cfl: '060',
      dir: 'DEP',
      bay: 'PENDING',
    }),
    ...overrides,
  };
}

const noop = () => {};

function renderCard(
  s: Strip,
  dups: string[] = [],
  handlers: Partial<React.ComponentProps<typeof StripCard>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={stripsEn}>
      <StripCard
        strip={s}
        duplicateSquawks={new Set(dups)}
        compact={false}
        dragging={false}
        onDragStart={noop}
        onDragEnd={noop}
        onContextMenu={noop}
        onSuggestAccept={noop}
        onFreeTextChange={noop}
        {...handlers}
      />
    </NextIntlClientProvider>,
  );
}

describe('StripCard', () => {
  it('renders the callsign, route and NO CLR chip for an uncleared departure (happy)', () => {
    renderCard(strip());
    expect(screen.getByText('TAP751')).toBeTruthy();
    expect(screen.getByText('LFPO')).toBeTruthy();
    expect(screen.getByText('NO CLR')).toBeTruthy();
  });

  it('shows the DUP chip when the set squawk is duplicated (invalid data)', () => {
    renderCard(strip({ sqkS: '2436', cleared: true }), ['2436']);
    expect(screen.getByText('DUP')).toBeTruthy();
  });

  it('never flags the VFR conspicuity code 7000 as duplicate (boundary)', () => {
    renderCard(strip({ dir: 'VFR', sqkA: '7000', sqkS: '7000' }), ['7000']);
    expect(screen.queryByText('DUP')).toBeNull();
  });

  it('shows RDY when cleared with a verified squawk in pending (happy)', () => {
    renderCard(strip({ cleared: true, sqkS: '2461' }));
    expect(screen.getByText('RDY')).toBeTruthy();
  });

  it('caps visible chips at two (boundary)', () => {
    // dup + pending handoff + PDC sent would be three chips.
    const { container } = renderCard(
      strip({
        sqkS: '2436',
        dcl: 'SENT',
        cleared: true,
        xfr: { to: 'LPPT_TWR', state: 'PENDING' },
      }),
      ['2436'],
    );
    expect(screen.getByText('DUP')).toBeTruthy();
    expect(screen.queryByText('PDC')).toBeNull();
    expect(container.querySelectorAll('[title]').length).toBeGreaterThan(0);
  });

  it('accepts the suggestion via its pill (happy)', () => {
    const onSuggestAccept = vi.fn();
    renderCard(strip({ suggest: { bay: 'TAXI' } }), [], { onSuggestAccept });
    fireEvent.click(screen.getByTestId('strip-suggest'));
    expect(onSuggestAccept).toHaveBeenCalledOnce();
  });

  it('edits free text inline and commits on blur (happy)', () => {
    const onFreeTextChange = vi.fn();
    renderCard(strip(), [], { onFreeTextChange });
    fireEvent.click(screen.getByTestId('strip-freetext'));
    const input = screen.getByDisplayValue('');
    fireEvent.change(input, { target: { value: 'hold short A3' } });
    fireEvent.blur(input);
    expect(onFreeTextChange).toHaveBeenCalledWith('hold short A3');
  });

  it('renders the placeholder squawk dots when nothing is observed yet (garbage-ish)', () => {
    renderCard(strip({ sqkS: '' }));
    expect(screen.getByText('····')).toBeTruthy();
  });
});
