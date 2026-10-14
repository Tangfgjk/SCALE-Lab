import { build } from "esbuild";

await build({
  entryPoints: ["editor-src/rich-editor.js"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  outfile: "editor.bundle.js",
  legalComments: "none",
  minify: false,
  sourcemap: false
});
