// Local dev API server that mounts every Vercel function in /api as an Express
// route. Supports Vercel's [param].js dynamic segments. This is for
// development only; in production Vercel invokes the functions directly.
import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, sep } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load .env into process.env (no deps)
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '512kb' }));

const apiRoot = join(root, 'api');
const functionCache = new Map();

// Build a route table once: { segments: [...], file: '...', paramNames: [...] }
function buildRoutes() {
  const routes = [];
  function walk(dir, segments) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('_') || entry === '_lib') continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full, [...segments, entry]);
      } else if (entry.endsWith('.js')) {
        const name = entry.slice(0, -3);
        const paramNames = [];
        const patternSegments = [...segments];
        if (name.startsWith('[') && name.endsWith(']')) {
          paramNames.push(name.slice(1, -1));
          patternSegments.push('*'); // wildcard for any value
        } else {
          patternSegments.push(name);
        }
        routes.push({ segments: patternSegments, file: full, paramNames });
      }
    }
  }
  walk(apiRoot, []);
  return routes;
}

const ROUTES = buildRoutes();

function findHandler(urlPath) {
  const p = urlPath.split('?')[0];
  const segments = p.split('/').filter(Boolean); // ['api', 'participants', 'abc']
  if (segments[0] !== 'api') return null;
  const tail = segments.slice(1);
  // 1) Exact / dynamic match
  for (const route of ROUTES) {
    if (route.segments.length !== tail.length) continue;
    let matches = true;
    const params = {};
    for (let i = 0; i < route.segments.length; i++) {
      if (route.segments[i] === '*') {
        if (route.paramNames[i]) params[route.paramNames[i]] = tail[i];
      } else if (route.segments[i] !== tail[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return { file: route.file, params };
  }
  // 2) Prefix fallback: if a static api/<name>.js file exists, route any
  //    /api/<name>/<sub> request to that file (the function parses req.url).
  if (tail.length >= 2) {
    for (const route of ROUTES) {
      if (route.segments.length === 1 && route.segments[0] === tail[0]) {
        return { file: route.file, params: {} };
      }
    }
  }
  return null;
}

async function loadHandler(file) {
  if (functionCache.has(file)) return functionCache.get(file);
  const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
  const fn = mod.default || mod.handler;
  functionCache.set(file, fn);
  return fn;
}

app.all(/.*/, async (req, res) => {
  const found = findHandler(req.path);
  if (!found) {
    res.status(404).json({ error: 'No encontrado' });
    return;
  }
  req.query = { ...(req.query || {}), ...found.params };
  const fn = await loadHandler(found.file);
  try {
    await fn(req, res);
  } catch (e) {
    console.error('[api]', req.method, req.path, e);
    if (!res.headersSent) {
      res.status(e.status || 500).json({ error: e.message || 'Error interno' });
    }
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`[dev-api] listening on http://localhost:${port}`);
});
