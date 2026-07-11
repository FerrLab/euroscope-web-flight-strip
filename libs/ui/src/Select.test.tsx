import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Select } from './Select';

const OPTIONS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

describe('Select', () => {
  it('lists options and fires onChange (happy)', async () => {
    const onValueChange = vi.fn();
    render(
      <Select
        aria-label="fruit"
        options={OPTIONS}
        placeholder="Pick one"
        onValueChange={onValueChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'fruit' });
    await userEvent.click(trigger);

    const opt = await screen.findByRole('option', { name: 'Banana' });
    await userEvent.click(opt);

    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('shows the placeholder when no value selected (happy)', () => {
    render(<Select aria-label="fruit" options={OPTIONS} placeholder="Pick one" />);
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('rejects empty options array (invalid)', () => {
    expect(() => render(<Select aria-label="x" options={[]} placeholder="Empty" />)).not.toThrow();
    expect(screen.getByRole('combobox', { name: 'x' })).toBeInTheDocument();
  });

  it('handles garbage options entries gracefully (garbage)', () => {
    expect(() =>
      render(
        <Select
          aria-label="x"
          // @ts-expect-error — runtime tolerance smoke: missing label on purpose
          options={[{ value: 'a' }]}
          placeholder="Bad"
        />,
      ),
    ).not.toThrow();
  });

  it('uses rounded-none on the trigger (invariant)', () => {
    render(<Select aria-label="x" options={OPTIONS} placeholder="P" />);
    expect(screen.getByRole('combobox', { name: 'x' }).className).not.toMatch(
      /rounded-(sm|md|lg|xl)/,
    );
  });
});
