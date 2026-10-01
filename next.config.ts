import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许隔离的预览 / 构建使用独立输出目录，不打断正在运行的工作台。
  distDir: process.env.GUITAR_NEXT_DIST_DIR || ".next",
  // better-sqlite3 是原生模块，不能被 bundler 打包，交由 Node 直接 require
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // GP/PDF 文件可能较大
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
};

export default nextConfig;
