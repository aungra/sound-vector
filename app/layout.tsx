import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MUSIC MEMORY FITTING ROOM",
  description: "音楽の記憶を試着する参加型Tシャツ展示アプリ"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://use.typekit.net" />
        <link rel="stylesheet" href="https://use.typekit.net/dct1nqo.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
