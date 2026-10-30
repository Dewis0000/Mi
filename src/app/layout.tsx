import type { Metadata } from "next";
import { Geist_Mono, Manrope, Unbounded } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { StageLights } from "@/components/stage-lights";
import { Navbar } from "@/components/navbar";
import { SiteFooter } from "@/components/site-footer";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

const unbounded = Unbounded({
  variable: "--font-display",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Выпендрёж — своя игра для своих",
    template: "%s · Выпендрёж",
  },
  description:
    "Выпендрёж — своя игра, в которой можно собрать свой пакет вопросов, выпендриться перед друзьями и попасть в Зал Позора. Без занудства.",
  openGraph: {
    title: "Выпендрёж — своя игра для своих",
    description:
      "Собери свой пакет вопросов, зови друзей и выясни, кто тут самый умный, а кто просто громче всех выпендривается.",
    locale: "ru_RU",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${manrope.variable} ${unbounded.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <StageLights />
          <Navbar />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
