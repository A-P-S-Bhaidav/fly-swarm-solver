import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#0B0C0E',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'FlySwarm — MaleCNS v1.0 Connectome Ensemble Solver',
    template: '%s | FlySwarm',
  },
  description:
    'Real-time multi-agent Drosophila melanogaster whole-brain connectome simulation (166,700 neurons, 25.58M synapses) solving distorted visual CAPTCHAs via confidence-weighted swarm consensus.',
  keywords: [
    'FlySwarm',
    'MaleCNS v1.0',
    'Drosophila melanogaster',
    'Connectome',
    'Swarm Intelligence',
    'Computational Neuroscience',
    'Reservoir Computing',
    'WebGL',
    'Three.js',
  ],
  authors: [{ name: 'Anant Pratap Singh Bhaidav' }],
  creator: 'Anant Pratap Singh Bhaidav',
  openGraph: {
    title: 'FlySwarm — MaleCNS v1.0 Connectome Ensemble Solver',
    description:
      'Watch an ensemble of simulated fruit-fly brains (166,700 neurons, 25.58M synapses) solve multi-modal visual CAPTCHAs in real time.',
    type: 'website',
    locale: 'en_US',
    siteName: 'FlySwarm Connectome Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FlySwarm — MaleCNS v1.0 Connectome Ensemble Solver',
    description:
      'Multi-agent Drosophila melanogaster whole-brain connectome simulation solving visual CAPTCHAs.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${mono.variable} font-sans bg-[#0B0C0E] text-[#ECEEF0] antialiased selection:bg-[#1B4332] selection:text-[#ECEEF0]`}
      >
        {children}
      </body>
    </html>
  );
}
