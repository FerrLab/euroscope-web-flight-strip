import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}

const OVERLAY = 'fixed inset-0 bg-black/60 z-40 data-[state=open]:animate-in';
const CONTENT =
  'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 ' +
  'bg-bg-primary text-fg-primary border border-default rounded-none ' +
  'p-6 w-full max-w-lg shadow-lg';
const TITLE = 'text-xl font-semibold mb-2';
const DESC = 'text-sm text-fg-secondary mb-4';

export function Modal({ open, onOpenChange, title, description, children }: ModalProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={OVERLAY} />
        <RadixDialog.Content className={CONTENT}>
          <RadixDialog.Title className={TITLE}>{title}</RadixDialog.Title>
          <RadixDialog.Description className={DESC}>{description}</RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
