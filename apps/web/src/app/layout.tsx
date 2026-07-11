import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'EuroStrip',
  description: 'Web flight strips for EuroScope',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
