import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from 'shadow-dom-testing-library';
import { ObcDropdownButton } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import { useDropdownAriaLabel } from './useDropdownAriaLabel';

function Harness({ label }: { label: string }) {
  const ref = useDropdownAriaLabel(label);
  return (
    <ObcDropdownButton
      ref={ref}
      aria-label={label}
      value="a"
      options={[
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ]}
    />
  );
}

describe('useDropdownAriaLabel', () => {
  it('bridges the label into the shadow-DOM select (happy)', async () => {
    render(<Harness label="Widget picker" />);

    expect(
      await screen.findByShadowRole('combobox', { name: 'Widget picker' }),
    ).toBeInTheDocument();
  });
});
