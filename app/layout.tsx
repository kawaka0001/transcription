import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Humanity1 - Real-time 3D Word Cloud Transcription",
  description: "Real-time speech-to-text with 3D word cloud visualization",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
