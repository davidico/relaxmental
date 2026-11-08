import type { NextConfig } from "next";

/**
 * Exportación estática: `next build` genera la carpeta `out/` con HTML, CSS y JS.
 * Cloudflare Pages la sirve tal cual (no hace falta servidor: los datos van del
 * navegador a Supabase directamente).
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
