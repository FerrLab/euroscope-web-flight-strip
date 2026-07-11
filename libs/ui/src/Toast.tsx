import * as RadixToast from '@radix-ui/react-toast';
import type { ReactNode } from 'react';

export interface ToastProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'danger';
  duration?: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <RadixToast.Provider swipeDirection="right">
      {children}
      <RadixToast.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 w-96 max-w-[100vw] z-50" />
    </RadixToast.Provider>
  );
}

const VARIANT_CLASSES: Record<NonNullable<ToastProps['variant']>, string> = {
  info: 'border-default',
  success: 'border-accent-success',
  warning: 'border-accent-warning',
  danger: 'border-accent-danger',
};

export function Toast({
  open,
  onOpenChange,
  title,
  description,
  variant = 'info',
  duration = 5000,
}: ToastProps) {
  return (
    <RadixToast.Root
      open={open}
      onOpenChange={onOpenChange}
      duration={duration}
      className={`bg-bg-primary text-fg-primary border-l-4 ${VARIANT_CLASSES[variant]} rounded-none p-4 shadow-lg`}
    >
      <RadixToast.Title className="font-semibold">{title}</RadixToast.Title>
      {description && (
        <RadixToast.Description className="text-sm text-fg-secondary mt-1">
          {description}
        </RadixToast.Description>
      )}
    </RadixToast.Root>
  );
}
