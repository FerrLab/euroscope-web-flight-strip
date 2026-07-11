type Size = 'small' | 'medium' | 'large';

export interface SpinnerProps {
  label: string;
  size?: Size;
  className?: string;
}

const SIZE: Record<Size, string> = {
  small: 'h-4 w-4 border-2',
  medium: 'h-8 w-8 border-2',
  large: 'h-12 w-12 border-4',
};

export function Spinner({ label, size = 'medium', className = '' }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`inline-flex items-center justify-center ${SIZE[size]} ${className}`.trim()}
    >
      <span
        className={`block ${SIZE[size]} border-fg-tertiary border-t-accent-primary rounded-full animate-spin`}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
