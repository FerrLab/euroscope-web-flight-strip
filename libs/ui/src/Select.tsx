import * as RadixSelect from '@radix-ui/react-select';
import { forwardRef } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  placeholder: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

const TRIGGER =
  'inline-flex items-center justify-between gap-2 px-3 py-2 min-w-[10rem] text-sm rounded-none ' +
  'bg-bg-primary text-fg-primary border border-default ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ' +
  'data-[disabled]:opacity-50';

const CONTENT =
  'overflow-hidden bg-bg-primary text-fg-primary border border-default rounded-none shadow-lg z-50';

const ITEM =
  'relative flex items-center px-3 py-2 text-sm cursor-pointer ' +
  'data-[highlighted]:bg-bg-secondary data-[highlighted]:outline-none ' +
  'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed';

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    { options, placeholder, value, defaultValue, onValueChange, disabled, className = '', ...aria },
    ref,
  ) => {
    // Spread only the props that are defined; Radix Root's typings reject
    // `undefined` literals under exactOptionalPropertyTypes.
    const rootProps: RadixSelect.SelectProps = {
      ...(value !== undefined && { value }),
      ...(defaultValue !== undefined && { defaultValue }),
      ...(onValueChange !== undefined && { onValueChange }),
      ...(disabled !== undefined && { disabled }),
    };
    return (
      <RadixSelect.Root {...rootProps}>
        <RadixSelect.Trigger
          ref={ref}
          aria-label={aria['aria-label']}
          className={`${TRIGGER} ${className}`.trim()}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>▾</RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content className={CONTENT} position="popper" sideOffset={4}>
            <RadixSelect.Viewport>
              {options.map((opt) => (
                <RadixSelect.Item key={opt.value} value={opt.value} className={ITEM}>
                  <RadixSelect.ItemText>{opt.label ?? opt.value}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    );
  },
);

Select.displayName = 'Select';
