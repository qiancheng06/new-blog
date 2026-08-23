import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Persona 工作台",
    short_name: "Persona",
    description: "Persona 的工作台、AI、知识与日历。",
    start_url: "/calendar",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#eaf4ef",
    theme_color: "#8eb9a9",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icons/persona-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/persona-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/persona-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "日历",
        short_name: "日历",
        url: "/calendar",
        icons: [{ src: "/icons/persona-192.png", sizes: "192x192" }],
      },
      {
        name: "AI 中心",
        short_name: "AI",
        url: "/ai",
        icons: [{ src: "/icons/persona-192.png", sizes: "192x192" }],
      },
    ],
  }
}
