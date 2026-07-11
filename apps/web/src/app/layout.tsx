import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Azimuth',
  description: 'Your companion from A to Z',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
