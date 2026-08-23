import type { Metadata, Viewport } from "next"

export const pwaMetadata: Metadata = {
  applicationName: "Persona",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Persona",
  },
  icons: {
    icon: [
      { url: "/icons/persona-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/persona-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
}
export const pwaViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eaf4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#111815" },
  ],
}
