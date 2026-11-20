import { build } from "esbuild";
import {cp,mkdir} from 'node:fs/promises';

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

await mkdir('../shared',{recursive:true});
await build({entryPoints:['editor-src/pdf-viewer.js'],bundle:true,format:'esm',platform:'browser',target:['es2022'],outfile:'../shared/pdf-viewer.mjs',legalComments:'none',minify:true});
await cp('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','../shared/pdf.worker.min.mjs');
for(const [source,target] of [['cmaps','pdf-cmaps'],['standard_fonts','pdf-fonts'],['wasm','pdf-wasm']])await cp('node_modules/pdfjs-dist/'+source,'../shared/'+target,{recursive:true});
await cp('node_modules/pdfjs-dist/LICENSE','../shared/PDFJS-LICENSE.txt');
