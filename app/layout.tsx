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

const softwareVersion = "0.2.0";
const deploymentCommit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local";

export const metadata: Metadata = {
  title: "RPG Capital — Pagamentos simples. Crédito justo.",
  description: "Infraestrutura de pagamentos zero taxa para lojistas brasileiros.",
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
