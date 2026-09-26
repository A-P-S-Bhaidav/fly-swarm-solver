import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '600'] });

export const metadata: Metadata = {
  title: 'FlySwarm — MaleCNS CAPTCHA Demo',
  description: 'Watch a swarm of real MaleCNS v1.0 fruit-fly connectomes (166,700 neurons) solve CAPTCHAs in real time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans bg-[#080c14] text-slate-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
