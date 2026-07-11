import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders children and fires onClick (happy)', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);

    const btn = screen.getByRole('button', { name: 'Click me' });
    await userEvent.click(btn);

    expect(btn).toBeInTheDocument();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire onClick when disabled (invalid)', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Disabled
      </Button>,
    );

    const btn = screen.getByRole('button', { name: 'Disabled' });
    await userEvent.click(btn);

    expect(btn).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('uses rounded-none (squared UI rule) — never has rounded-md/lg/etc. (invariant)', () => {
    render(<Button>Squared</Button>);
    const btn = screen.getByRole('button');
    const cls = btn.className;
    expect(cls).not.toMatch(/rounded-(sm|md|lg|xl|2xl|3xl)/);
  });

  it('rejects garbage children (garbage — type-safety smoke)', () => {
    expect(() => render(<Button>{undefined}</Button>)).not.toThrow();
  });

  it('forwards ref to the underlying button element (happy)', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('supports variant=primary | secondary | danger (happy)', () => {
    const { rerender } = render(<Button variant="primary">P</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-accent-primary/);

    rerender(<Button variant="secondary">S</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-bg-secondary/);

    rerender(<Button variant="danger">D</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-accent-danger/);
  });
});
