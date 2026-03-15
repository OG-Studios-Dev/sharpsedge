import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import DesktopShell from "@/components/DesktopShell";

export const metadata: Metadata = {
  title: "Goosalytics - Sports Betting Edge",
  description: "Find player props and team trends that have been consistently hitting.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Goosalytics",
  },
  icons: {
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0f",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-dark-bg text-white antialiased">
        <main className="max-w-lg lg:max-w-5xl mx-auto px-0 lg:px-6 pb-20 lg:pb-8 min-h-screen">
          <DesktopShell>
            {children}
          </DesktopShell>
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
