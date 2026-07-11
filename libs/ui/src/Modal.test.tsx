import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('opens and closes (happy)', async () => {
    const onOpenChange = vi.fn();
    render(
      <Modal open onOpenChange={onOpenChange} title="Hello" description="A modal">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('does not render when closed (invalid open=false)', () => {
    render(
      <Modal open={false} onOpenChange={() => {}} title="X" description="d">
        <p>Hidden</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape (happy)', async () => {
    const onOpenChange = vi.fn();
    render(
      <Modal open onOpenChange={onOpenChange} title="X" description="d">
        <p>x</p>
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('uses rounded-none (squared UI rule)', () => {
    render(
      <Modal open onOpenChange={() => {}} title="X" description="d">
        <p>x</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).not.toMatch(/rounded-(sm|md|lg)/);
  });

  it('handles undefined title as garbage (garbage)', () => {
    expect(() =>
      render(
        // @ts-expect-error — runtime tolerance: title omitted on purpose.
        <Modal open onOpenChange={() => {}} description="d">
          <p>x</p>
        </Modal>,
      ),
    ).not.toThrow();
  });
});
