export const metadata = {
  title: process.env.NEXT_PUBLIC_EVENT_TITLE || "Свадебные фото",
  description: "Поделитесь своими фото с молодожёнами",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#b88a5e",
};

import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
