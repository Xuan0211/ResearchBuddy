import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResearchBuddy",
  description: "Research collaboration for teams and their AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-white text-gray-900 font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
