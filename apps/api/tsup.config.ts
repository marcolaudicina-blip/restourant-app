import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  // Workspace packages ship TypeScript sources, so they are bundled into the build.
  noExternal: [/^@restourant\//],
});
