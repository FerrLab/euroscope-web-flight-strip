import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastProvider, Toast } from './Toast';

describe('Toast', () => {
  it('renders title + description when open (happy)', () => {
    render(
      <ToastProvider>
        <Toast open onOpenChange={() => {}} title="Saved" description="Your work is safe" />
      </ToastProvider>,
    );
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Your work is safe')).toBeInTheDocument();
  });

  it('does not render when open=false (invalid)', () => {
    render(
      <ToastProvider>
        <Toast open={false} onOpenChange={() => {}} title="X" description="d" />
      </ToastProvider>,
    );
    expect(screen.queryByText('X')).not.toBeInTheDocument();
  });

  it('applies rounded-none (squared UI rule)', () => {
    render(
      <ToastProvider>
        <Toast open onOpenChange={() => {}} title="X" description="d" />
      </ToastProvider>,
    );
    const t = screen.getByText('X').closest('li');
    expect(t?.className).not.toMatch(/rounded-(sm|md|lg)/);
  });

  it('handles undefined description as garbage (garbage)', () => {
    expect(() =>
      render(
        <ToastProvider>
          <Toast open onOpenChange={() => {}} title="X" />
        </ToastProvider>,
      ),
    ).not.toThrow();
  });
});
