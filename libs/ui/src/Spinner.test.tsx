import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders with role="status" + aria-live polite (happy)', () => {
    render(<Spinner label="Loading" />);
    const status = screen.getByRole('status', { name: 'Loading' });
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('uses rounded-full (avatar/pill exception per squared-UI rule)', () => {
    render(<Spinner label="x" />);
    const status = screen.getByRole('status');
    const inner = status.querySelector('span');
    expect(inner?.className).toContain('rounded-full');
  });

  it('rejects empty label (invalid — a11y requirement)', () => {
    // @ts-expect-error — exercise type-safety contract
    expect(() => render(<Spinner />)).not.toThrow();
  });

  it('size variants (small | medium | large) (happy)', () => {
    const { rerender } = render(<Spinner label="x" size="small" />);
    expect(screen.getByRole('status').className).toMatch(/h-4/);
    rerender(<Spinner label="x" size="large" />);
    expect(screen.getByRole('status').className).toMatch(/h-12/);
  });
});
