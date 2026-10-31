import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nifty 50 Option Chain | NSE India Live Dashboard",
  description: "Real-time Nifty 50 Option Chain table matching the official NSE India layout with OI, Change in OI, PCR, and Max Pain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}

