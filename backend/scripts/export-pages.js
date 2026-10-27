"use strict";
// Export only the anonymous public API. Never read database tables or admin APIs.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'backend/storage/pages-preview');
const origin = process.env.EXPORT_ORIGIN || 'http://127.0.0.1:3004';
const routes = {};
const media = new Map();
async function request(route) {
  const response = await fetch(origin + route);
  if (response.status !== 404 && !response.ok) throw new Error(`${route}: ${response.status}`);
  const json = await response.json();
  delete json.requestId;
  if(response.ok && /^\/api\/v1\/(news|activities)\?/.test(route)) {
    const all=[...json.data];
    for(let page=2;page<=(json.meta?.pages||1);page++) {
      const next=await fetch(origin+route+'&page='+page);
      if(!next.ok)throw Error('Incomplete export page '+page);
      all.push(...(await next.json()).data);
    }
    if(all.length!==json.meta.total)throw Error('Incomplete collection export');
    json.data=all;
  }
  routes[route] = {status: response.status, body: json};
  return json.data;
}
async function transform(value) {
  if (typeof value === 'string') {
    if (value.startsWith('/api/v1/assets/')) {
      if (!/^\/api\/v1\/assets\/[a-f0-9-]+\/file$/.test(value)) throw new Error('Unexpected asset URL');
      if (!media.has(value)) {
        const response = await fetch(origin + value);
        if (!response.ok) throw new Error(`Public asset unavailable: ${response.status}`);
        const type = response.headers.get('content-type').split(';')[0];
        const extension = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','image/avif':'avif'}[type];
        if (!extension) throw new Error(`Unexpected media type ${type}`);
        const relative = `media/${value.split('/')[4]}.${extension}`;
        await fs.writeFile(path.join(output, relative), Buffer.from(await response.arrayBuffer()));
        media.set(value, relative);
      }
      return media.get(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    const result = [];
    for (const child of value) result.push(await transform(child));
    return result;
  }
  if (value && typeof value === 'object') {
    const result = {};
    // Sequential traversal also avoids duplicate downloads of the same public image.
    for (const [key, child] of Object.entries(value)) result[key] = await transform(child);
    return result;
  }
  return value;
}
async function rewriteTree(directory) {
  for (const entry of await fs.readdir(directory, {withFileTypes:true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await rewriteTree(file);
    else if (/\.(html|js|css)$/.test(file)) {
      let source = await fs.readFile(file, 'utf8');
      source = source.replace(/(["'])\/shared\//g, '$1shared/');
      if (entry.name === 'first-visit.js') source = source.replace('location.pathname === "/" || location.pathname === "/index.html"', '/\\/(?:index\\.html)?$/.test(location.pathname)');
      if (entry.name === 'rich-renderer.js') source = source.replace('image.src = asset.url;', 'image.src = asset.url;\n      else if(asset?.url) { const u=new URL(asset.url,location.href); const base=new URL("./",location.href); if(u.origin===base.origin && u.pathname.startsWith(base.pathname+"media/") && /^[a-f0-9-]{36}\\.(png|jpg|webp|gif|svg|avif)$/.test(u.pathname.split("/").pop())) image.src=u.href; }');
      if (entry.name.endsWith('.html')) source = source.replace('<head>', '<head>\n  <script src="snapshot-runtime.js"></script>');
      await fs.writeFile(file, source);
    }
  }
}
async function main() {
  // Guard before recursive cleanup: output is a fixed generated directory under ignored storage.
  if (path.relative(path.join(root,'backend/storage'), output) !== 'pages-preview') throw new Error('Unsafe output');
  await fs.rm(output, {recursive:true,force:true});
  await fs.cp(path.join(root,'frontend/public'), output, {recursive:true});
  await fs.cp(path.join(root,'frontend/shared'), path.join(output,'shared'), {recursive:true});
  await fs.mkdir(path.join(output,'media'), {recursive:true});
  for (const locale of ['zh','en']) {
    for (const type of ['settings','research-directions','publications','projects','news','activities','members']) {
      const data = await request(`/api/v1/${type}?locale=${locale}`);
      if (['news','activities','members'].includes(type)) {
        for (const item of data || []) {
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) throw new Error('Invalid slug');
          await request(`/api/v1/${type === 'activities' ? 'news' : type}/${item.slug}?locale=${locale}`);
        }
      }
    }
  }
  const exported = await transform(routes);
  await fs.writeFile(path.join(output,'snapshot-data.json'),JSON.stringify(exported));
  await fs.copyFile(path.join(__dirname,'pages-runtime.js'),path.join(output,'snapshot-runtime.js'));
  await rewriteTree(output);
  await fs.writeFile(path.join(output,'.nojekyll'),'');
  const manifest = {exportedAt:new Date().toISOString(),scope:'anonymous published content only',routes:Object.keys(routes),mediaCount:media.size,sha256:crypto.createHash('sha256').update(JSON.stringify(exported)).digest('hex')};
  await fs.writeFile(path.join(output,'snapshot-manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({output,routes:manifest.routes.length,media:media.size,sha256:manifest.sha256}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
