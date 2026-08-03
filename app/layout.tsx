import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist_Mono, Inter, Nunito } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Headings across both the marketing page and the workspace.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

// Reserved for hashes, job IDs, and timecodes.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: baseUrl,
    title: "Toluva — Governed video localization",
    description:
      "Localize the message without losing control of the voice. Authorized, time-fit, and verifiable editions.",
    icons: {
      icon: "/og.png",
      shortcut: "/og.png",
    },
    openGraph: {
      title: "Toluva — Governed video localization",
      description:
        "Upload one approved source video and get a time-aligned, consent-aware German edition with every stage recorded.",
      images: [
        {
          url: socialImage,
          width: 1672,
          height: 941,
          alt: "Toluva — Localize the message. Keep control of the voice.",
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Toluva — Governed video localization",
      description:
        "Authorized synthetic voice, measurable timing QA, and verifiable media lineage.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${nunito.variable} ${geistMono.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
