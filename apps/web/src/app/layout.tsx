import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Diagramz — AI-powered diagrams, instantly shareable",
  description:
    "Create diagrams via API or AI, get an instant shareable link. No signup required.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
