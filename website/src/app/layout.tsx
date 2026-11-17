import type { Metadata, Viewport } from 'next';
import { Press_Start_2P, VT323 } from 'next/font/google';
import { site } from '@/content/site';
import './globals.css';

// The game's two pixel fonts (both SIL Open Font License), self-hosted by next/font
const pixel = Press_Start_2P({ weight: '400', subsets: ['latin'], variable: '--font-pixel', display: 'swap' });
const body = VT323({ weight: '400', subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.intro,
  openGraph: {
    title: site.name,
    description: site.tagline,
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#05070d',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning: browser extensions (Grammarly, Dark Reader, password
    // managers…) add attributes to <html>/<body> before React loads, which would
    // otherwise log a hydration mismatch. It only ignores attributes on these two tags.
    <html lang="en" className={`${pixel.variable} ${body.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
