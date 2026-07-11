import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('renders and accepts user typing (happy)', async () => {
    render(<Input aria-label="email" />);
    const input = screen.getByLabelText('email') as HTMLInputElement;
    await userEvent.type(input, 'hi@local');
    expect(input.value).toBe('hi@local');
  });

  it('disabled prevents typing (invalid)', async () => {
    render(<Input aria-label="email" disabled />);
    const input = screen.getByLabelText('email') as HTMLInputElement;
    await userEvent.type(input, 'should-be-rejected');
    expect(input.value).toBe('');
  });

  it('rounded-none (squared UI rule)', () => {
    render(<Input aria-label="x" />);
    expect(screen.getByLabelText('x').className).not.toMatch(/rounded-(sm|md|lg|xl)/);
  });

  it('handles undefined value as garbage (garbage)', () => {
    expect(() => render(<Input aria-label="x" value={undefined} />)).not.toThrow();
  });

  it('forwards ref (happy)', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input aria-label="x" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('shows error styling when aria-invalid (happy)', () => {
    render(<Input aria-label="x" aria-invalid />);
    const input = screen.getByLabelText('x');
    expect(input.className).toMatch(/border-accent-danger/);
  });
});
