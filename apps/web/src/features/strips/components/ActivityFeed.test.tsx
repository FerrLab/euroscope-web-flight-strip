import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import stripsEn from '@/messages/strips.en.json';
import type { ArchivedStrip } from '../types';
import { ActivityFeed } from './ActivityFeed';

function renderFeed(archived: ArchivedStrip[], onRestore = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={stripsEn}>
      <ActivityFeed
        icao="SBGR"
        feed={[]}
        archived={archived}
        liveOn
        onLiveToggle={() => {}}
        onRestore={onRestore}
        resolveBay={(id) => id}
      />
    </NextIntlClientProvider>,
  );
  return onRestore;
}

describe('ActivityFeed archived panel', () => {
  it('opens the archive and restores a strip (happy)', () => {
    const onRestore = renderFeed([{ cs: 'JLY1656', time: '20:45', by: 'auto' }]);
    fireEvent.click(screen.getByTestId('archived-toggle'));
    fireEvent.click(screen.getByTestId('archived-restore-JLY1656'));
    expect(onRestore).toHaveBeenCalledWith('JLY1656');
  });

  it('shows the archive count in the footer (happy)', () => {
    renderFeed([
      { cs: 'A', time: '20:00', by: 'user' },
      { cs: 'B', time: '20:01', by: 'auto' },
    ]);
    expect(screen.getByTestId('archived-toggle').textContent).toContain('2');
  });

  it('renders nothing to restore when the archive is empty (invalid)', () => {
    renderFeed([]);
    fireEvent.click(screen.getByTestId('archived-toggle'));
    expect(screen.queryByTestId('archived-list')).toBeNull();
  });
});
