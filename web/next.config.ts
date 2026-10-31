import type { NextConfig } from "next";

const common = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  // A pasta da app é a raiz, mesmo que haja outro package-lock.json mais acima no disco
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      {
        // Páginas da app (tudo menos os PDF)
        source: "/((?!api/faturas/|f/).*)",
        headers: [...common, { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" }],
      },
      {
        // O visualizador de PDF do browser precisa de object-src; só pode abrir dentro da própria app
        source: "/(api/faturas/.*|f/.*)",
        headers: [...common, { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
    ];
  },
};

export default nextConfig;
