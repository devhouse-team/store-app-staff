import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Dev: the app calls relative /api, Vite forwards it to staging, so the browser sees one origin
// (session cookie is host-only, staging CORS only allows https://admin.tolyq-store.kz).
// Origin/Referer are dropped so the request looks like a same-site call; the login guard
// (crudauth is_cross_site) only checks Sec-Fetch-Site, which is "same-origin" for /api anyway.
const API_TARGET = process.env.VITE_PROXY_TARGET ?? "https://api.tolyq-store.kz";

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        secure: true,
        configure: (proxy) =>
          proxy.on("proxyReq", (req) => {
            req.removeHeader("origin");
            req.removeHeader("referer");
          }),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Tolyq — персонал",
        short_name: "Tolyq Staff",
        description: "Панель персонала магазина «Аскар»",
        lang: "ru",
        start_url: "/",
        display: "standalone",
        theme_color: "#176B50",
        background_color: "#FAFAF6",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, navigateFallbackDenylist: [/^\/api\//, /^\/privacy/] },
    }),
  ],
});
