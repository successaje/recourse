import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: {
    default: 'Recourse — escrow and dispute resolution for agentic payments',
    template: '%s · Recourse',
  },
  description:
    'x402 pays before delivery. Recourse holds the payment in escrow, adjudicates disputes inside a Chainlink CRE enclave, and settles on Hedera.',
  openGraph: {
    title: 'Recourse',
    description: 'x402 pays before delivery. Recourse is the part that gets your money back.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // Runs before first paint. An effect would repaint a frame late,
          // which is the flash every theme toggle is judged by.
          //
          // A stored choice always wins. With none, the reader's OS setting
          // decides: the design is dark-first, but a first visit on a machine
          // set to light should not be answered with a dark page.
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('recourse-theme');var l=t==='light'||(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches);if(l)document.documentElement.dataset.theme='light';}catch(e){}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@500;600&display=swap"
        />
      </head>
      <body className="min-h-screen antialiased">
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
