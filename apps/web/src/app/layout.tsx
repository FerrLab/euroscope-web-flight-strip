import './globals.css';
import '@oicl/openbridge-webcomponents/dist/openbridge.css';
import type { ReactNode } from 'react';
import { Noto_Sans } from 'next/font/google';

export const notoSans = Noto_Sans({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'EuroStrip',
  description: 'Web flight strips for EuroScope',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
