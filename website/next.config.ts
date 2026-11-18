import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: `next build` writes plain HTML/CSS/JS to out/, which any
  // static host can serve — no Node server needed
  output: 'export',
};

export default nextConfig;
