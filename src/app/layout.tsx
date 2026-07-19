import type { Metadata } from "next";
import {
  DM_Sans,
  IBM_Plex_Mono,
  Inter,
  Manrope,
  Outfit,
  Plus_Jakarta_Sans,
  Source_Sans_3,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";
import "@/components/ui/ui.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { MessageCenter } from "@/components/ui/messaging/MessageCenter";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { WebVitalsReporter } from "@/components/observability/WebVitalsReporter";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TC-ERP Multimedia",
  description:
    "Plataforma operativa y financiera para trazabilidad por serie, bodega, taller y despacho.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={[
        inter.variable,
        manrope.variable,
        spaceGrotesk.variable,
        ibmPlexMono.variable,
        sourceSans.variable,
        dmSans.variable,
        jakarta.variable,
        outfit.variable,
        "h-full antialiased",
      ].join(" ")}
    >
      <body suppressHydrationWarning className="flex min-h-full flex-col">
        <ThemeProvider>
          <QueryProvider>
            <WebVitalsReporter />
            {children}
            <ThemeToggle />
            <MessageCenter />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
