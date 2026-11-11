import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ask Pravek — AI Voice Twin',
  description: 'Meet Pravek’s AI twin. Ask about his journey, projects, strengths, and ambitions by voice or text.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
