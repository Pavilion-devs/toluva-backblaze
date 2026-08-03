import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docs pages under `app/docs/**` are authored in MDX. The MDX transform
  // itself is registered in `vite.config.ts`; this only tells the router which
  // extensions count as a page.
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
};

export default nextConfig;
