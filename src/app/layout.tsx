import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Six Degrees",
  description: "Discover the connections between NFTs and collectors.",
  metadataBase: new URL('https://www.six-degrees.art/'),
  openGraph: {
    title: "Six Degrees - NFT Connection Discovery",
    description: "Explore and discover the connections between NFTs and collectors. Uncover shared interests and collection patterns.",
    url: 'https://www.six-degrees.art/',
    siteName: 'Six Degrees',
    images: [
      {
        url: '/og-image.png', // You'll need to create this image
        width: 1200,
        height: 630,
        alt: 'Six Degrees - Discover NFT Connections',
      }
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Six Degrees - NFT Connection Discovery',
    description: 'Explore and discover the connections between NFTs and collectors.',
    images: ['/og-image.png'], // Same OG image for Twitter
    creator: '@jay_wooow', // Replace with your Twitter handle
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
