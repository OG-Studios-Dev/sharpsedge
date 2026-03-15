import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import AppShell from "@/components/AppShell";
import { AppChromeProvider } from "@/components/AppChromeProvider";
import SlideMenu from "@/components/SlideMenu";
import AddPickModal from "@/components/AddPickModal";

export const metadata: Metadata = {
  title: "Goosalytics - Sports Betting Edge",
  description: "Pickin' Sports Smarter",
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
  themeColor: "#0d1118",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#0d1118" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="bg-dark-bg text-white antialiased">
        <AppChromeProvider>
          <AppShell>{children}</AppShell>
          <BottomNav />
          <SlideMenu />
          <AddPickModal />
        </AppChromeProvider>
      </body>
    </html>
  );
}
