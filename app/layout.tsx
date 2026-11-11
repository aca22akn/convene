import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Atkinson_Hyperlegible_Next, Newsreader } from "next/font/google";
import "./globals.css";

// The app speaks in Atkinson (built for legibility in poor viewing conditions); people speak in Newsreader.
const appFont = Atkinson_Hyperlegible_Next({
  variable: "--font-app",
  subsets: ["latin"],
  display: "swap",
});

const peopleFont = Newsreader({
  variable: "--font-people",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Convene",
  description: "Convene tells every guest at a live community event who to meet, and why. Scan, write one line, get up to 2 intros.",
};

export const viewport: Viewport = {
  themeColor: "#0f1117",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();

  return (
    <html lang="en" className={`${appFont.variable} ${peopleFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-ink-950 text-fg">
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
