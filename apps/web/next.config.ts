import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript sources.
  transpilePackages: ["@restourant/shared"],
  poweredByHeader: false,
  // Linting runs in its own CI step with the workspace ESLint config.
  eslint: { ignoreDuringBuilds: true },
  webpack: (webpackConfig) => {
    // Shared sources use ESM-style ".js" import specifiers that point at ".ts" files.
    webpackConfig.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return webpackConfig;
  },
};

export default config;
