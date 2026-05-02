export const metadata = {
  title: "RedotsClub BINGO",
  description: "RedotsClub Bingo — Live Multiplayer",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0A0A0F",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#0A0A0F", overscrollBehavior: "none" }}>
        {children}
      </body>
    </html>
  );
}
