import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { INVENTORY_APP_VERSION } from "@/lib/inventory/version";
import LegalFooter from "@/components/LegalFooter";
import PublicAnalytics from "@/components/analytics/PublicAnalytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const softwareVersion = INVENTORY_APP_VERSION.replace(/^v/, "");
const deploymentCommit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.rpgcapital.com.br"),
  title: "RPG Capital & Crédito — Crédito justo para o pequeno varejo",
  description:
    "A RPG Capital & Crédito é uma empresa de crédito para o pequeno varejo brasileiro. Com a Rafa, assistente no WhatsApp, transforma a operação real da loja em crédito com juros justos.",
  applicationName: "RPG Capital & Crédito",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/icon-96.png",
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <PublicAnalytics />
        <LegalFooter />
        <div
          data-build-version
          aria-label={`Versão do BALCÃO ${softwareVersion}, build ${deploymentCommit}`}
          className="pointer-events-none fixed right-2 top-2 z-[100] rounded-md border border-slate-200 bg-white/90 px-2 py-1 font-mono text-[10px] font-semibold text-slate-500 shadow-sm backdrop-blur"
        >
          BALCÃO · v{softwareVersion} · {deploymentCommit}
        </div>
      </body>
    </html>
  );
}
