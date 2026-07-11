import { forwardRef, type HTMLAttributes } from 'react';

export type CardProps = HTMLAttributes<HTMLElement>;

const BASE = 'bg-bg-primary text-fg-primary border border-default rounded-none p-4 shadow-sm';

export const Card = forwardRef<HTMLElement, CardProps>(
  ({ className = '', children, ...rest }, ref) => {
    return (
      <section ref={ref} role="region" className={`${BASE} ${className}`.trim()} {...rest}>
        {children}
      </section>
    );
  },
);

Card.displayName = 'Card';
