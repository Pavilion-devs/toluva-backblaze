import type { Metadata } from "next";
import { headers } from "next/headers";
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
        "A controlled 12.419-second proof: authorized voice, three time-fit segments, and nine verified manifests.",
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
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
