'use client';

import type { ReactNode } from 'react';

export interface DashboardRowProps {
  label: string;
  children: ReactNode;
  /** Draws the hairline that separates a row from the one below it. */
  divided?: boolean;
}

/** One label/value line inside a dashboard card. */
export function DashboardRow({ label, children, divided }: DashboardRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        height: 48,
        padding: divided ? '0 8px' : '0 16px 0 8px',
        borderBottom: divided ? '1px solid var(--border-divider-color)' : undefined,
      }}
    >
      <span
        style={{
          fontSize: 12,
          lineHeight: '16px',
          fontWeight: 670,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          color: 'var(--element-neutral-color)',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/** The right-hand value of a `DashboardRow`, in the tabular reading style. */
export function DashboardValue({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      style={{
        fontSize: 16,
        lineHeight: '24px',
        fontWeight: 570,
        fontFeatureSettings: "'tnum' 1",
        color: 'var(--element-active-color)',
      }}
    >
      {children}
    </span>
  );
}
