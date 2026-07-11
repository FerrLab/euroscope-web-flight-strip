import { forwardRef, type InputHTMLAttributes } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

const BASE =
  'block w-full px-3 py-2 text-sm rounded-none ' +
  'bg-bg-primary text-fg-primary border border-default ' +
  'placeholder:text-fg-tertiary ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'aria-[invalid=true]:border-accent-danger';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type = 'text', ...rest }, ref) => {
    return <input ref={ref} type={type} className={`${BASE} ${className}`.trim()} {...rest} />;
  },
);

Input.displayName = 'Input';
