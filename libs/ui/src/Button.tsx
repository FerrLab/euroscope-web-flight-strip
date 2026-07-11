import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent-primary text-bg-primary hover:opacity-90',
  secondary: 'bg-bg-secondary text-fg-primary border border-default hover:bg-bg-tertiary',
  danger: 'bg-accent-danger text-bg-primary hover:opacity-90',
};

const BASE =
  'inline-flex items-center justify-center px-4 py-2 text-sm font-medium ' +
  'rounded-none transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className = '', type = 'button', ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={`${BASE} ${VARIANT_CLASSES[variant]} ${className}`.trim()}
        {...rest}
      />
    );
  },
);

Button.displayName = 'Button';
