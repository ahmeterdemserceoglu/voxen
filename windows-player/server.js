const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { randomUUID } = require('crypto');
const { once } = require('events');

const PORT = Number(process.env.VOXEN_PLAYER_PORT || 48731);
const ROOT = path.resolve(process.env.VOXEN_WEB_ROOT || path.join(__dirname, 'dist'));
const DATA_ROOT = process.env.VOXEN_DATA_ROOT || path.join(process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'), 'Voxen');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';
const CLIENT_VERSION = '1.20240401.01.00';
const streamCache = new Map();
const streamRequests = new Map();
const downloadJobs = new Map();
let innertubePromise;
let poMinterPromise;
let poMinterCreatedAt = 0;

function json(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function safePart(value, fallback = 'guest') {
  const normalized = String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return normalized || fallback;
}

function ownerDirectory(owner) { return path.join(DATA_ROOT, 'downloads', safePart(owner)); }
function indexFile(owner) { return path.join(ownerDirectory(owner), 'index.json'); }
function readDownloads(owner) {
  try {
    const items = JSON.parse(fs.readFileSync(indexFile(owner), 'utf8'));
    const directory = path.resolve(ownerDirectory(owner)) + path.sep;
    return Array.isArray(items) ? items.filter(item => {
      try { return item?.track?.id && path.resolve(item.filePath).startsWith(directory) && fs.statSync(item.filePath).size > 0; }
      catch { return false; }
    }) : [];
  } catch { return []; }
}
function writeDownloads(owner, items) {
  fs.mkdirSync(ownerDirectory(owner), { recursive: true });
  const temporary = `${indexFile(owner)}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(items, null, 2));
  fs.renameSync(temporary, indexFile(owner));
}

function pendingFile(owner) { return path.join(ownerDirectory(owner), 'pending.json'); }
function readPending(owner) {
  try { const items = JSON.parse(fs.readFileSync(pendingFile(owner), 'utf8')); return Array.isArray(items) ? items.filter(item => item?.track?.id) : []; }
  catch { return []; }
}
function rememberPending(owner, track, state, error) {
  fs.mkdirSync(ownerDirectory(owner), { recursive: true });
  const items = readPending(owner).filter(item => item.track.id !== track.id);
  if (state !== 'done') items.push({ track, state, error });
  const temporary = `${pendingFile(owner)}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(items));
  fs.renameSync(temporary, pendingFile(owner));
}
function downloadStatus(owner) {
  const items = new Map(readPending(owner).map(item => [item.track.id, { ...item, trackId: item.track.id, state: item.state === 'downloading' ? 'cancelled' : item.state, progress: 0 }]));
  for (const job of downloadJobs.values()) if (job.owner === owner) items.set(job.track.id, { track: job.track, trackId: job.track.id, state: job.state, progress: job.progress, error: job.error });
  return [...items.values()];
}
function publicDownload(item, owner) {
  const { filePath: _filePath, ...safe } = item;
  return { ...safe, localUri: `/api/download/file?owner=${encodeURIComponent(owner)}&id=${encodeURIComponent(item.track.id)}` };
}

async function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = import('youtubei.js').then(({ Innertube, Platform, UniversalCache }) => {
      Platform.shim.eval = async (data) => new Function(data.output)();
      return Innertube.create({
        lang: 'tr', location: 'TR', generate_session_locally: true,
        retrieve_player: true, cache: new UniversalCache(false),
      });
    }).catch((error) => {
      innertubePromise = undefined;
      throw error;
    });
  }
  return innertubePromise;
}

async function createPoMinter() {
  const [{ BotGuardClient }, { buildURL, parseLooseJSON, getHeaders, USER_AGENT: botUserAgent }, { WebPoMinter }, { JSDOM }] = await Promise.all([
    import('bgutils-js/botguard'), import('bgutils-js/utils'), import('bgutils-js/webpo'), import('jsdom'),
  ]);
  const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', {
    url: 'https://www.youtube.com', referrer: 'https://www.youtube.com/', userAgent: botUserAgent,
  });
  dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  const pageResponse = await fetch('https://www.youtube.com', { headers: { Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.7', 'User-Agent': botUserAgent }, signal: AbortSignal.timeout(20_000) });
  const pageHtml = await pageResponse.text();
  const configText = pageHtml.match(/ytcfg\.set\(({.+?})\);/s)?.[1];
  if (!configText) throw new Error('YouTube BotGuard yapılandırması bulunamadı');
  dom.window.yt = { config_: JSON.parse(configText) };
  Object.assign(globalThis, { yt: dom.window.yt, window: dom.window, document: dom.window.document, location: dom.window.location, origin: dom.window.origin });
  if (!('navigator' in globalThis)) Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator });
  const attestation = pageHtml.match(/window\.ytAtN\(\s*({[\s\S]*?})\s*\)/)?.[1];
  if (!attestation) throw new Error('YouTube BotGuard sınaması bulunamadı');
  const challenge = parseLooseJSON(attestation)?.R?.bgChallenge;
  if (!challenge) throw new Error('YouTube BotGuard yanıtı geçersiz');
  const interpreterPath = challenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
  if (!interpreterPath) throw new Error('BotGuard yorumlayıcısı bulunamadı');
  const interpreter = await (await fetch(`https:${interpreterPath}`, { signal: AbortSignal.timeout(20_000) })).text();
  new Function(interpreter)();
  const client = await BotGuardClient.create({ program: challenge.program, globalName: challenge.globalName, globalObject: globalThis });
  const webPoSignalOutput = [];
  const snapshot = await client.snapshot({ webPoSignalOutput });
  const requestKey = 'O43z0dpjhgX20SCx4KAo';
  const integrityResponse = await fetch(buildURL('GenerateIT', true), { method: 'POST', headers: getHeaders(), body: JSON.stringify([requestKey, snapshot]), signal: AbortSignal.timeout(20_000) });
  const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = await integrityResponse.json();
  if (!integrityToken) throw new Error('YouTube bütünlük tokenı üretilemedi');
  poMinterCreatedAt = Date.now();
  return WebPoMinter.create({ integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken }, webPoSignalOutput);
}

async function getPoMinter() {
  if (!poMinterPromise || (poMinterCreatedAt > 0 && Date.now() - poMinterCreatedAt > 10 * 60 * 60_000)) {
    poMinterPromise = createPoMinter().catch((error) => { poMinterPromise = undefined; throw error; });
  }
  return poMinterPromise;
}

function streamStillValid(entry) {
  if (!entry?.url || Date.now() - entry.savedAt > 60 * 60_000) return false;
  try {
    const expires = Number(new URL(entry.url).searchParams.get('expire')) * 1000;
    return !expires || expires > Date.now() + 5 * 60_000;
  } catch {
    return false;
  }
}

async function resolveAudio(videoId, forceRefresh = false) {
  if (!forceRefresh && streamStillValid(streamCache.get(videoId))) return streamCache.get(videoId);
  if (streamRequests.has(videoId)) return streamRequests.get(videoId);
  const request = resolveAudioUncached(videoId, forceRefresh);
  streamRequests.set(videoId, request);
  try { return await request; } finally { if (streamRequests.get(videoId) === request) streamRequests.delete(videoId); }
}

async function resolveAudioUncached(videoId, forceRefresh = false) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Geçersiz YouTube video kimliği');
  const cached = streamCache.get(videoId);
  if (!forceRefresh && streamStillValid(cached)) return cached;

  const youtube = await getInnertube();
  let format;
  let client;
  let lastError;
  try {
    const minter = await getPoMinter();
    const poToken = await minter.mintAsWebsafeString(videoId);
    const info = await youtube.getBasicInfo(videoId, { client: 'YTMUSIC' });
    format = info.chooseFormat({ type: 'audio', quality: 'best', format: 'any' });
    const deciphered = await format.decipher(youtube.session.player);
    if (deciphered) { format.url = `${deciphered}&pot=${encodeURIComponent(poToken)}`; client = 'YTMUSIC_PO'; }
  } catch (error) {
    lastError = error;
    console.warn('[Voxen] PO token çözümü başarısız, uyumluluk istemcileri deneniyor:', error?.message || error);
  }
  for (const candidate of format?.url ? [] : ['ANDROID_VR', 'IOS']) {
    try {
      format = await youtube.getStreamingData(videoId, {
        client: candidate,
        type: 'audio',
        quality: 'best',
        format: 'any',
      });
      if (format?.url) { client = candidate; break; }
    } catch (error) { lastError = error; }
  }
  if (!format?.url) throw lastError || new Error('Oynatılabilir ses akışı bulunamadı');
  const result = {
    url: format.url,
    mime: String(format.mime_type || 'audio/webm').split(';')[0],
    bitrate: format.bitrate || format.average_bitrate,
    loudnessDb: format.loudness_db,
    client,
    savedAt: Date.now(),
  };
  streamCache.set(videoId, result);
  return result;
}

async function proxyInnerTube(req, res, url) {
  const endpoint = url.pathname.slice('/api/youtubei/v1/'.length);
  if (!/^[a-zA-Z0-9_-]+$/.test(endpoint)) return json(res, 400, { error: 'Geçersiz InnerTube uç noktası' });
  const target = new URL(`https://music.youtube.com/youtubei/v1/${endpoint}`);
  url.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
  const upstream = await fetch(target, {
    method: req.method,
    body,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      Referer: 'https://music.youtube.com/',
      Origin: 'https://music.youtube.com',
      'X-YouTube-Client-Name': '67',
      'X-YouTube-Client-Version': CLIENT_VERSION,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const data = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(data);
}

async function proxyAudio(req, res, targetUrl, mime, videoId) {
  let target;
  try { target = new URL(targetUrl); } catch { return json(res, 400, { error: 'Geçersiz akış adresi' }); }
  if (!target.hostname.endsWith('.googlevideo.com')) return json(res, 403, { error: 'Bu akış alanına izin verilmiyor' });
  const headers = { 'User-Agent': USER_AGENT, Accept: req.headers.accept || '*/*' };
  const contentLength = Number(target.searchParams.get('clen'));
  const requested = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  const start = requested ? Number(requested[1] || 0) : 0;
  const end = requested ? Math.min(Number(requested[2] || contentLength - 1), contentLength - 1) : contentLength - 1;
  if (contentLength > 0 && end >= start && end - start + 1 > 65_536) {
    res.writeHead(requested ? 206 : 200, {
      'Content-Type': mime || 'audio/webm',
      'Content-Length': end - start + 1,
      ...(requested ? { 'Content-Range': `bytes ${start}-${end}/${contentLength}` } : {}),
      'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=300', 'Access-Control-Allow-Origin': '*',
    });
    let activeTarget = target;
    for (let cursor = start; cursor <= end && !res.destroyed; cursor += 65_536) {
      const chunkEnd = Math.min(cursor + 65_535, end);
      let buffer; let lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const chunk = await fetch(activeTarget, { headers: { ...headers, Range: `bytes=${cursor}-${chunkEnd}` }, signal: AbortSignal.timeout(30_000) });
          if (chunk.status !== 206) throw new Error(`Ses parçası yanıtı: ${chunk.status}`);
          buffer = Buffer.from(await chunk.arrayBuffer()); break;
        } catch (error) {
          lastError = error;
          if (videoId) { const refreshed = await resolveAudio(videoId, true); activeTarget = new URL(refreshed.url); }
        }
      }
      if (!buffer) throw lastError || new Error('Ses parçası alınamadı');
      if (!res.write(buffer)) await once(res, 'drain');
    }
    return res.end();
  }
  if (req.headers.range) headers.Range = req.headers.range;
  const upstream = await fetch(target, { method: req.method, headers, signal: AbortSignal.timeout(30_000) });
  const output = {
    'Content-Type': upstream.headers.get('content-type') || mime || 'audio/webm',
    'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
    'Cache-Control': 'private, max-age=300',
    'Access-Control-Allow-Origin': '*',
  };
  for (const name of ['content-length', 'content-range']) {
    const value = upstream.headers.get(name);
    if (value) output[name] = value;
  }
  res.writeHead(upstream.status, output);
  if (!upstream.body || req.method === 'HEAD') return res.end();
  Readable.fromWeb(upstream.body).pipe(res);
}

async function downloadTrack(req, res, dependencies = {}) {
  const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}');
  const track = payload.track; const owner = safePart(payload.owner);
  if (!track?.id || !track?.title) return json(res, 400, { error: 'Geçersiz parça' });
  const existing = readDownloads(owner).find(item => item.track.id === track.id);
  if (existing) return json(res, 200, { item: publicDownload(existing, owner), cached: true });
  const key = `${owner}:${track.id}`;
  if (downloadJobs.get(key)?.state === 'downloading') return json(res, 409, { error: 'Bu parça zaten indiriliyor' });
  const controller = new AbortController();
  const job = { owner, track, controller, state: 'downloading', progress: 0 };
  downloadJobs.set(key, job);
  rememberPending(owner, track, 'downloading');
  let temporary;
  const disconnected = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', disconnected);
  try {
  const stream = await (dependencies.resolveAudio || resolveAudio)(track.videoId || track.id);
  controller.signal.throwIfAborted();
  const extension = /mp4|m4a/i.test(stream.mime) ? 'm4a' : 'webm';
  const directory = ownerDirectory(owner); fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, `${safePart(track.id, 'track')}.${extension}`);
  temporary = `${filePath}.${randomUUID()}.part`;
  const localStream = new URL(`http://127.0.0.1:${server.address()?.port || PORT}/api/audio`);
  localStream.searchParams.set('id', track.videoId || track.id); localStream.searchParams.set('url', stream.url); localStream.searchParams.set('mime', stream.mime);
  const upstream = await (dependencies.fetch || fetch)(localStream, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10 * 60_000)]) });
  if (!upstream.ok || !upstream.body) throw new Error(`Ses indirme yanıtı: ${upstream.status}`);
  if (/text\/|json|html/i.test(upstream.headers.get('content-type') || '')) throw new Error('Geçersiz ses dosyası');
  const total = Number(upstream.headers.get('content-length')) || 0;
  let received = 0;
  const progress = new Transform({ transform(chunk, _encoding, callback) {
    received += chunk.length;
    job.progress = total > 0 ? Math.min(99, Math.floor(received * 100 / total)) : 5;
    callback(null, chunk);
  } });
  await pipeline(Readable.fromWeb(upstream.body), progress, fs.createWriteStream(temporary), { signal: controller.signal });
  controller.signal.throwIfAborted();
  if (!received || (total > 0 && total !== received)) throw new Error('Ses dosyası eksik indirildi');
  fs.renameSync(temporary, filePath);
  const item = { track, filePath, localUri: '', downloadedAt: Date.now(), sizeBytes: fs.statSync(filePath).size };
  writeDownloads(owner, [...readDownloads(owner).filter(entry => entry.track.id !== track.id), item]);
  job.state = 'done'; job.progress = 100;
  rememberPending(owner, track, 'done');
  return json(res, 200, { item: publicDownload(item, owner), cached: false });
  } catch (error) {
    job.state = controller.signal.aborted ? 'cancelled' : 'error';
    job.error = controller.signal.aborted ? undefined : error.message;
    if (!job.discard) rememberPending(owner, track, job.state, job.error);
    if (temporary) { try { fs.unlinkSync(temporary); } catch {} }
    throw error;
  } finally {
    res.removeListener('close', disconnected);
    if (downloadJobs.size > 200) for (const [id, old] of downloadJobs) { if (old.state !== 'downloading') downloadJobs.delete(id); if (downloadJobs.size <= 100) break; }
  }
}

function serveDownloaded(req, res, owner, id) {
  const item = readDownloads(owner).find(entry => entry.track.id === id);
  if (!item) return json(res, 404, { error: 'İndirilen parça bulunamadı' });
  const size = fs.statSync(item.filePath).size; const range = req.headers.range;
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    const start = match?.[1] ? Number(match[1]) : match?.[2] ? Math.max(0, size - Number(match[2])) : 0;
    const end = match?.[1] && match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!match || (!match[1] && !match[2]) || start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { 'Content-Type': path.extname(item.filePath) === '.m4a' ? 'audio/mp4' : 'audio/webm', 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(item.filePath, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': path.extname(item.filePath) === '.m4a' ? 'audio/mp4' : 'audio/webm', 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(item.filePath).pipe(res);
}

function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  let filePath = path.resolve(ROOT, requested);
  if (!filePath.startsWith(`${ROOT}${path.sep}`) && filePath !== path.join(ROOT, 'index.html')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(ROOT, 'index.html');
  if (!fs.existsSync(filePath)) return json(res, 503, { error: 'Voxen web çıktısı bulunamadı' });
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range, Accept',
        'Access-Control-Max-Age': '86400',
      });
      return res.end();
    }
    if (url.pathname.startsWith('/api/youtubei/v1/')) return await proxyInnerTube(req, res, url);
    if (url.pathname === '/api/stream/resolve') {
      const stream = await resolveAudio(url.searchParams.get('id') || '');
      const params = new URLSearchParams({ url: stream.url, mime: stream.mime });
      params.set('id', url.searchParams.get('id') || '');
      return json(res, 200, { uri: `/api/audio?${params}`, bitrate: stream.bitrate, loudnessDb: stream.loudnessDb, client: stream.client });
    }
    if (url.pathname === '/api/audio') return await proxyAudio(req, res, url.searchParams.get('url') || '', url.searchParams.get('mime') || '', url.searchParams.get('id') || '');
    if (url.pathname === '/api/downloads') {
      const owner = safePart(url.searchParams.get('owner')); return json(res, 200, { items: readDownloads(owner).map(item => publicDownload(item, owner)) });
    }
    if (url.pathname === '/api/download/status') return json(res, 200, { items: downloadStatus(safePart(url.searchParams.get('owner'))) });
    if (url.pathname === '/api/download/job' && req.method === 'DELETE') {
      const owner = safePart(url.searchParams.get('owner')); const id = url.searchParams.get('id') || '';
      downloadJobs.get(`${owner}:${id}`)?.controller.abort();
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/download/partials' && req.method === 'DELETE') {
      const owner = safePart(url.searchParams.get('owner'));
      for (const [key, job] of downloadJobs) if (job.owner === owner) { job.discard = true; job.controller.abort(); downloadJobs.delete(key); }
      for (const item of readPending(owner)) rememberPending(owner, item.track, 'done');
      const directory = ownerDirectory(owner);
      for (const name of fs.existsSync(directory) ? fs.readdirSync(directory) : []) if (name.endsWith('.part')) { try { fs.unlinkSync(path.join(directory, name)); } catch {} }
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/download' && req.method === 'POST') return await downloadTrack(req, res);
    if (url.pathname === '/api/download' && req.method === 'DELETE') {
      const owner = safePart(url.searchParams.get('owner')); const id = url.searchParams.get('id') || ''; const items = readDownloads(owner); const target = items.find(item => item.track.id === id);
      const job = downloadJobs.get(`${owner}:${id}`);
      if (job) { job.discard = true; job.controller.abort(); }
      downloadJobs.delete(`${owner}:${id}`);
      rememberPending(owner, { id }, 'done');
      if (target) { try { fs.unlinkSync(target.filePath); } catch {} writeDownloads(owner, items.filter(item => item.track.id !== id)); }
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/download/file') return serveDownloaded(req, res, safePart(url.searchParams.get('owner')), url.searchParams.get('id') || '');
    return serveStatic(req, res, url);
  } catch (error) {
    console.error('[Voxen]', error);
    if (res.headersSent) return res.destroy(error);
    return json(res, 502, { error: error?.message || 'İstek tamamlanamadı' });
  }
});

function startServer() {
  if (server.listening) return Promise.resolve(server.address());
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      server.removeListener('error', reject);
      console.log(`[Voxen] http://127.0.0.1:${server.address().port}`);
      resolve(server.address());
    });
  });
}

if (require.main === module) startServer();

function warmAudioResolver() { return Promise.allSettled([getInnertube(), getPoMinter()]); }
module.exports = { server, startServer, warmAudioResolver, downloadTrack, readDownloads, downloadStatus };
