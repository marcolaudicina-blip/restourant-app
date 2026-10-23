import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript sources. @restourant/api runs embedded when API_URL is unset.
  transpilePackages: ["@restourant/shared", "@restourant/db", "@restourant/api"],
  poweredByHeader: false,
  // Linting runs in its own CI step with the workspace ESLint config.
  eslint: { ignoreDuringBuilds: true },
  // Booking pages can be embedded in the restaurants' websites; the staff app never can.
  async headers() {
    return [
      {
        source: "/((?!prenota/).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/prenota/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
  webpack: (webpackConfig) => {
    // Shared sources use ESM-style ".js" import specifiers that point at ".ts" files.
    webpackConfig.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return webpackConfig;
  },
};

export default config;
