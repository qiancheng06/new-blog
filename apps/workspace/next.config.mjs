/** @type {import('next').NextConfig} */
const allowedDevOrigins = (process.env.PERSONA_DEV_ALLOWED_ORIGINS || "127.0.0.1,localhost")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
const personaDevProxyTarget = process.env.PERSONA_DEV_PROXY_TARGET?.replace(/\/$/, "")

const nextConfig = {
  allowedDevOrigins,
  devIndicators: false,
  distDir: ".next",
  reactStrictMode: true,
  typescript: {
    tsconfigPath: "tsconfig.json",
  },
  async rewrites() {
    return personaDevProxyTarget
      ? [{ source: "/persona-api/:path*", destination: `${personaDevProxyTarget}/:path*` }]
      : []
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ]
  },
}

export default nextConfig
