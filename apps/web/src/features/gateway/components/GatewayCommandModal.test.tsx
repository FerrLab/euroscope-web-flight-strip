import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { GatewayCommandModal } from './GatewayCommandModal';

const messages = {
  common: { close: 'Close' },
  gateway: {
    dashboard: {
      command: {
        title: 'Gateway command',
        hint: "Paste this line into EuroScope's command line. It is shown only once.",
        copy: 'Copy command',
        copied: 'Copied',
      },
    },
  },
};

const LINE = '.lpc gateway config aHR0cDovL2xvY2FsaG9zdDp0b2tlbg';

function wrap(onClose = vi.fn(), commandLine = LINE) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GatewayCommandModal commandLine={commandLine} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

function mockClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GatewayCommandModal', () => {
  it('shows the one-shot hint and the full command line (happy)', () => {
    wrap();

    expect(
      screen.getByText("Paste this line into EuroScope's command line. It is shown only once."),
    ).toBeInTheDocument();
    expect(screen.getByTestId('gateway-command-line')).toHaveTextContent(LINE);
  });

  it('copies the line and confirms it (happy)', async () => {
    const writeText = vi.fn(async () => {});
    mockClipboard(writeText);
    wrap();

    await userEvent.click(await screen.findByShadowRole('button', { name: 'Copy command' }));

    expect(writeText).toHaveBeenCalledWith(LINE);
    expect(await screen.findByShadowText('Copied')).toBeInTheDocument();
  });

  it('closes from both the title-bar X and the Close button (happy)', async () => {
    const onClose = wrap();

    await userEvent.click(await screen.findByShadowRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId('gateway-command-close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps the modal open when the backdrop is clicked (invalid path)', async () => {
    const onClose = wrap();

    await userEvent.click(screen.getByTestId('gateway-command-modal'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('still confirms the copy when the clipboard is denied (garbage)', async () => {
    mockClipboard(async () => {
      throw new Error('NotAllowedError');
    });
    wrap();

    await userEvent.click(await screen.findByShadowRole('button', { name: 'Copy command' }));

    expect(await screen.findByShadowText('Copied')).toBeInTheDocument();
  });
});
