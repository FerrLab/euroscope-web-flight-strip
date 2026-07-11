import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { LOCALES, isLocale, type Locale } from '@eurostrip/i18n';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { ReduxProvider } from '@/shared/store/ReduxProvider';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';
import { setThemePrePaint } from '@/shared/theme/set-theme-pre-paint';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const messages = await getMessages();
  const themeCookie = (await cookies()).get('eurostrip_theme')?.value ?? 'day';

  return (
    <html lang={locale} data-theme={themeCookie} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: setThemePrePaint() }} />
      </head>
      <body className="bg-bg-primary text-fg-primary font-sans">
        <NextIntlClientProvider locale={locale as Locale} messages={messages}>
          <ThemeProvider initialTheme={themeCookie}>
            <ReduxProvider>{children}</ReduxProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
