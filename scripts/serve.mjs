import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
// `.md`, `.ts` and `.mjs` are served as plain text so the academy's chapter and source links open
// in the browser instead of downloading.
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.ts': 'text/plain; charset=utf-8', '.mjs': 'text/plain; charset=utf-8', '.map': 'application/json' };
const port = Number(process.env.PORT || 5173);
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep) || pathname.split('/').some(p => p.startsWith('.'))) {
      response.writeHead(403).end(); return;
    }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Edena: http://localhost:${port}`));
