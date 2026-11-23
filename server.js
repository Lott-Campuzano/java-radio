#!/usr/bin/env node
/* ============================================================
   JAVA RADIO · servidor
   ------------------------------------------------------------
   - Cero dependencias: solo Node 18+.
   - Sirve la web y hace de puente con Google Drive.
   - El navegador NUNCA ve el ID ni la URL real del archivo:
     recibe un token opaco firmado, atado a su sesión, que caduca.
   - El audio se sirve con Range (se puede buscar dentro del tema)
     pero sin enlaces directos, sin listado de Drive y sin descarga
     cómoda. Es disuasión, no DRM: cualquiera puede grabar lo que
     suena por los altavoces. Ver README.
   ============================================================ */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

loadEnv();

const PORT = Number(process.env.PORT || 4321);
const HOST = process.env.HOST || '127.0.0.1';
const SECRET = String(process.env.SESSION_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');
const SECRET_IS_EPHEMERAL = !String(process.env.SESSION_SECRET || '').trim();
const SECURE_COOKIES = process.env.SECURE_COOKIES === '1';
const SESSION_TTL = 24 * 60 * 60 * 1000;
const STREAM_TTL = 6 * 60 * 60 * 1000;
const CATALOG_TTL = 5 * 60 * 1000;
const MUSIC_DIR = path.resolve(process.env.MUSIC_DIR || path.join(ROOT, 'musica'));
const DEFAULT_ALBUM = process.env.RADIO_ALBUM || 'Selección de Java Radio';
// Artista por defecto cuando el nombre del archivo no trae «Artista - Título».
// Es el autor del proyecto y de la música: https://github.com/Lott-Campuzano
const DEFAULT_ARTIST = 'Lott Campuzano';

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.oga', '.opus', '.webm', '.aiff', '.aif']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.webm': 'audio/webm',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.txt': 'text/plain; charset=utf-8'
};

const DRIVE_FOLDER_RAW = String(process.env.DRIVE_FOLDER_ID || '').trim();
const DRIVE_FOLDER_ID = extractFolderId(DRIVE_FOLDER_RAW);
const GOOGLE_API_KEY = String(process.env.GOOGLE_API_KEY || '').trim();
const SOURCE_PREF = String(process.env.SOURCE || 'auto').toLowerCase();

/* ---------- .env mínimo, sin dependencias -------------------- */
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function extractFolderId(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  const byPath = input.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (byPath) return byPath[1];
  const byId = input.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (byId) return byId[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input)) return input;
  return input;
}

/* ---------- Cuenta de servicio de Google --------------------- */
function readServiceAccount() {
  const inline = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  const file = String(process.env.GOOGLE_SERVICE_ACCOUNT_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  try {
    if (inline.startsWith('{')) return JSON.parse(inline);
    if (file) return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  } catch (error) {
    console.warn('[drive] No pude leer la cuenta de servicio:', error.message);
  }
  return null;
}

const SERVICE_ACCOUNT = readServiceAccount();
const DRIVE_READY = Boolean(DRIVE_FOLDER_ID && (GOOGLE_API_KEY || SERVICE_ACCOUNT));
const PUBLIC_DRIVE = Boolean(DRIVE_FOLDER_ID && !DRIVE_READY);
const MODE = SOURCE_PREF === 'local'
  ? 'local'
  : SOURCE_PREF === 'drive'
    ? 'drive'
    : (DRIVE_FOLDER_ID ? 'drive' : 'local');

let googleToken = { value: '', expires: 0 };

async function googleAccessToken() {
  if (!SERVICE_ACCOUNT) return '';
  const now = Math.floor(Date.now() / 1000);
  if (googleToken.value && googleToken.expires - 90 > now) return googleToken.value;

  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const claims = b64({
    iss: SERVICE_ACCOUNT.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(SERVICE_ACCOUNT.private_key).toString('base64url');
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Google rechazó la cuenta de servicio: ${data.error_description || data.error || res.status}`);
  }
  googleToken = { value: data.access_token, expires: now + Number(data.expires_in || 3600) };
  return googleToken.value;
}

function driveUrl(pathname, params) {
  const url = new URL('https://www.googleapis.com/drive/v3' + pathname);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  return url;
}

async function driveFetch(pathname, params, init = {}) {
  const url = driveUrl(pathname, params);
  const headers = { ...(init.headers || {}) };
  if (SERVICE_ACCOUNT) headers.authorization = `Bearer ${await googleAccessToken()}`;
  else url.searchParams.set('key', GOOGLE_API_KEY);
  return fetch(url, { ...init, headers });
}

async function driveJson(pathname, params) {
  const res = await driveFetch(pathname, params, { signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.error?.message || `HTTP ${res.status}`;
    const hint = res.status === 403 || res.status === 404
      ? 'Comprueba que la carpeta esté compartida como «Cualquiera con el enlace» (o con el email de la cuenta de servicio) y que la API key tenga activa Google Drive API.'
      : '';
    const error = new Error(`Google Drive: ${detail}`);
    error.hint = hint;
    error.status = res.status;
    throw error;
  }
  return data;
}

/* ---------- Drive público (sin API key) ---------------------- */
function publicDriveUrl(fileId) {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
}

async function fetchDriveMedia(entry, headers = {}, signal) {
  if (entry.public) {
    return fetch(publicDriveUrl(entry.driveId), { headers, redirect: 'follow', signal });
  }
  return driveFetch(`/files/${encodeURIComponent(entry.driveId)}`, {
    alt: 'media',
    supportsAllDrives: 'true'
  }, { headers, redirect: 'follow', signal });
}

function decodeHtmlEntities(text) {
  return String(text || '').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (match, code) => {
    const key = code.toLowerCase();
    if (key === 'amp') return '&';
    if (key === 'lt') return '<';
    if (key === 'gt') return '>';
    if (key === 'quot') return '"';
    if (key === 'apos') return "'";
    if (key === 'nbsp') return ' ';
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10));
    return match;
  });
}

function parsePublicFolderHtml(html, folderId, album) {
  const entries = [];
  const blocks = String(html || '').split('<div class="flip-entry"').slice(1);
  for (const block of blocks) {
    const idMatch = block.match(/id="entry-([^"]+)"/);
    const titleMatch = block.match(/flip-entry-title">([\s\S]*?)<\/div>/);
    const typeMatch = block.match(/drive-thirdparty\.googleusercontent\.com\/\d+\/type\/([^"]+)"/);
    if (!idMatch || !titleMatch) continue;
    const type = (typeMatch?.[1] || '').toLowerCase();
    const isFolder = type === 'folder' || type === 'application/vnd.google-apps.folder';
    const name = decodeHtmlEntities(titleMatch[1].replace(/<[^>]*>/g, '')).trim();
    if (!name) continue;
    entries.push({
      id: idMatch[1],
      name,
      mimeType: isFolder ? 'application/vnd.google-apps.folder' : (type || ''),
      parents: [folderId],
      album,
      public: true
    });
  }
  return entries;
}

async function listPublicDriveFolder(folderId) {
  const files = [];
  const walk = async (id, depth, album) => {
    if (depth > 4) return;
    const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}#list`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; JavaRadio/1.0)' },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) {
      const error = new Error(`No pude abrir la carpeta pública de Drive (HTTP ${res.status}).`);
      error.hint = 'Comparte la carpeta como «Cualquiera con el enlace» o configura GOOGLE_API_KEY / cuenta de servicio.';
      throw error;
    }
    const html = await res.text();
    const entries = parsePublicFolderHtml(html, id, album || DEFAULT_ALBUM);
    for (const entry of entries) {
      if (entry.mimeType === 'application/vnd.google-apps.folder') {
        await walk(entry.id, depth + 1, depth === 0 ? entry.name : album);
      } else {
        files.push(entry);
      }
    }
  };
  await walk(folderId, 0, '');
  return files;
}

/* ---------- Sesiones ----------------------------------------- */
const sessions = new Map(); // sid -> expira

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const eq = part.indexOf('=');
    if (eq < 0) return;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  });
  return out;
}

function sessionFor(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  let sid = cookies.rl_sid;
  const valid = sid && /^[a-f0-9]{32,64}$/.test(sid) && sessions.has(sid);
  if (!valid) {
    sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, 0);
    const cookie = [
      `rl_sid=${sid}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${Math.floor(SESSION_TTL / 1000)}`,
      SECURE_COOKIES ? 'Secure' : ''
    ].filter(Boolean).join('; ');
    res.setHeader('Set-Cookie', cookie);
  }
  sessions.set(sid, Date.now() + SESSION_TTL);
  return sid;
}

function sessionAlive(sid) {
  if (!sid) return false;
  const expires = sessions.get(sid);
  if (!expires || expires < Date.now()) {
    sessions.delete(sid);
    return false;
  }
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [sid, expires] of sessions) if (expires < now) sessions.delete(sid);
}, 10 * 60 * 1000).unref();

/* ---------- Tokens opacos y firmas --------------------------- */
const entries = new Map();      // token -> { type, driveId|filePath, mime, title }
const tokenByKey = new Map();   // clave estable -> token

function tokenFor(key) {
  let token = tokenByKey.get(key);
  if (!token) {
    token = crypto.randomBytes(12).toString('hex');
    tokenByKey.set(key, token);
  }
  return token;
}

function signedPath(kind, token, sid) {
  const exp = Date.now() + STREAM_TTL;
  const sig = crypto.createHmac('sha256', SECRET)
    .update(`${kind}:${token}:${exp}:${sid}`)
    .digest('base64url');
  return `/api/${kind}/${token}?e=${exp}&s=${sig}`;
}

function verifySignature(kind, token, exp, sig, sid) {
  if (!exp || !sig) return false;
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = crypto.createHmac('sha256', SECRET)
    .update(`${kind}:${token}:${exp}:${sid}`)
    .digest('base64url');
  const a = Buffer.from(String(sig));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sameOriginRequest(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }
  return true;
}

/* ---------- Límite de peticiones ----------------------------- */
const buckets = new Map();

function rateLimited(req, bucket, limit, windowMs = 60_000) {
  const ip = req.socket.remoteAddress || 'unknown';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || entry.reset < now) {
    entry = { count: 0, reset: now + windowMs };
    buckets.set(key, entry);
  }
  entry.count += 1;
  return entry.count > limit;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) if (entry.reset < now) buckets.delete(key);
}, 5 * 60 * 1000).unref();

/* ---------- Catálogo ----------------------------------------- */
const catalog = {
  mode: MODE,
  updatedAt: 0,
  tracks: [],
  error: null,
  hint: '',
  warnings: []
};
let building = null;

function mimeFor(name, fallback) {
  const ext = path.extname(String(name || '')).toLowerCase();
  return MIME[ext] || fallback || 'application/octet-stream';
}

function isAudio(name, mime) {
  if (String(mime || '').startsWith('audio/')) return true;
  return AUDIO_EXT.has(path.extname(String(name || '')).toLowerCase());
}

function isImage(name, mime) {
  if (String(mime || '').startsWith('image/')) return true;
  return IMAGE_EXT.has(path.extname(String(name || '')).toLowerCase());
}

/* ---------- Género, estilo y emoción ------------------------- */
const GENRE_LABELS = {
  electronica: 'Electrónica',
  dance: 'Dance',
  house: 'House',
  techno: 'Techno',
  synthpop: 'Synth-pop',
  pop: 'Pop',
  urbano: 'Urbano',
  trap: 'Trap',
  reggaeton: 'Reggaetón',
  jersey: 'Jersey club',
  hiphop: 'Hip-hop',
  rnb: 'R&B',
  rock: 'Rock',
  metal: 'Metal',
  punk: 'Punk',
  indie: 'Indie',
  instrumental: 'Instrumental',
  folk: 'Folk',
  acustico: 'Acústico',
  balada: 'Balada',
  jazz: 'Jazz',
  soul: 'Soul',
  blues: 'Blues',
  funk: 'Funk',
  lofi: 'Lo-fi',
  ambient: 'Ambient',
  clasica: 'Clásica',
  latino: 'Latino',
  flamenco: 'Flamenco',
  country: 'Country',
  gospel: 'Gospel',
  soundtrack: 'Banda sonora',
  experimental: 'Experimental'
};

const GENRE_ENERGY = {
  electronica: 86, dance: 90, house: 82, techno: 90, synthpop: 72, pop: 68,
  urbano: 78, trap: 74, reggaeton: 82, jersey: 92, hiphop: 70, rnb: 50,
  rock: 82, metal: 96, punk: 90, indie: 56, instrumental: 42, folk: 30,
  acustico: 28, balada: 24, jazz: 38, soul: 46, blues: 40, funk: 74,
  lofi: 20, ambient: 10, clasica: 26, latino: 72, flamenco: 54, country: 44,
  gospel: 48, soundtrack: 36, experimental: 34
};

const GENRE_MOOD = {
  electronica: 'energetic', dance: 'energetic', house: 'energetic', techno: 'energetic',
  synthpop: 'balanced', pop: 'balanced', urbano: 'energetic', trap: 'energetic',
  reggaeton: 'energetic', jersey: 'energetic', hiphop: 'balanced', rnb: 'emotional',
  rock: 'energetic', metal: 'energetic', punk: 'energetic', indie: 'emotional',
  instrumental: 'calm', folk: 'emotional', acustico: 'calm', balada: 'emotional',
  jazz: 'calm', soul: 'emotional', blues: 'emotional', funk: 'energetic',
  lofi: 'calm', ambient: 'calm', clasica: 'calm', latino: 'energetic',
  flamenco: 'emotional', country: 'emotional', gospel: 'emotional',
  soundtrack: 'emotional', experimental: 'balanced'
};

const GENRE_STYLE = {
  electronica: 'Club electrónico', dance: 'Club', house: 'Club', techno: 'Club',
  synthpop: 'Synth-pop', pop: 'Pop', urbano: 'Urbano', trap: 'Urbano',
  reggaeton: 'Urbano', jersey: 'Urbano', hiphop: 'Urbano', rnb: 'Soul urbano',
  rock: 'Banda', metal: 'Banda', punk: 'Banda', indie: 'Indie',
  instrumental: 'Instrumental', folk: 'Canción de autor', acustico: 'Acústico',
  balada: 'Balada', jazz: 'Jazz', soul: 'Soul', blues: 'Blues', funk: 'Funk',
  lofi: 'Ambiente', ambient: 'Ambiente', clasica: 'Clásica', latino: 'Latino',
  flamenco: 'Flamenco', country: 'Country', gospel: 'Gospel',
  soundtrack: 'Banda sonora', experimental: 'Experimental'
};

const MOOD_LABELS = {
  calm: 'Tranquila',
  energetic: 'Enérgica',
  emotional: 'Emocional',
  balanced: 'Equilibrada'
};

const GENRE_KEYWORDS = {
  jersey: ['jersey club', 'jersey'],
  reggaeton: ['reggaeton', 'dembow', 'perreo', 'perreito'],
  trap: ['trap', 'trapeton', 'trap latino'],
  hiphop: ['hip hop', 'hip-hop', 'hiphop', 'rap', 'freestyle'],
  rnb: ['rnb', 'r b', 'rhythm and blues', 'neo soul'],
  urbano: ['urbano', 'urbana', 'urban', 'street'],
  techno: ['techno', 'acid'],
  house: ['house', 'deep house', 'tech house'],
  synthpop: ['synthpop', 'synth pop', 'new wave', 'synthwave'],
  electronica: ['electronica', 'electronic', 'edm', 'electro', 'synth', 'sintes', 'sintetizador', 'bailable'],
  dance: ['dance', 'club', 'discoteca'],
  metal: ['metal', 'heavy metal', 'hardcore', 'metalcore'],
  punk: ['punk', 'emo', 'screamo'],
  rock: ['rock', 'rock and roll', 'rocknroll', 'grunge', 'garage', 'alternativo', 'alternative'],
  indie: ['indie', 'independiente'],
  instrumental: ['instrumental', 'instrumentales', 'sin voz', 'beat', 'beats'],
  folk: ['folk', 'folklore', 'americana', 'cantautor', 'cantautora'],
  acustico: ['acustico', 'acoustic', 'unplugged', 'guitarra', 'guitarras'],
  balada: ['balada', 'ballad', 'romantica', 'romantico'],
  jazz: ['jazz', 'swing', 'bossa', 'bossa nova'],
  soul: ['soul', 'motown'],
  blues: ['blues'],
  funk: ['funk', 'disco'],
  lofi: ['lofi', 'lo fi', 'chill', 'chillhop'],
  ambient: ['ambient', 'ambiente', 'drone'],
  clasica: ['clasica', 'classical', 'piano', 'orquesta', 'sinfonia'],
  flamenco: ['flamenco', 'rumba', 'sevillanas'],
  latino: ['latino', 'latina', 'salsa', 'cumbia', 'bachata', 'merengue'],
  country: ['country'],
  gospel: ['gospel', 'coro'],
  soundtrack: ['soundtrack', 'banda sonora', 'ost'],
  experimental: ['experimental', 'avant garde', 'noise'],
  pop: ['pop']
};

const GENRE_PRIORITY = [
  'jersey', 'reggaeton', 'trap', 'hiphop', 'rnb', 'urbano', 'techno', 'house',
  'synthpop', 'electronica', 'dance', 'metal', 'punk', 'rock', 'indie',
  'instrumental', 'folk', 'acustico', 'balada', 'jazz', 'soul', 'blues',
  'funk', 'lofi', 'ambient', 'clasica', 'flamenco', 'latino', 'country',
  'gospel', 'soundtrack', 'experimental', 'pop'
];

const ID3_GENRES = [
  'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop',
  'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae',
  'Rock', 'Techno', 'Industrial', 'Alternative', 'Ska', 'Death Metal', 'Pranks',
  'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk',
  'Fusion', 'Trance', 'Classical', 'Instrumental', 'Acid', 'House', 'Game',
  'Sound Clip', 'Gospel', 'Noise', 'AlternRock', 'Bass', 'Soul', 'Punk', 'Space',
  'Meditative', 'Instrumental Pop', 'Instrumental Rock', 'Ethnic', 'Gothic',
  'Darkwave', 'Techno-Industrial', 'Electronic', 'Pop-Folk', 'Eurodance', 'Dream',
  'Southern Rock', 'Comedy', 'Cult', 'Gangsta', 'Top 40', 'Christian Rap',
  'Pop/Funk', 'Jungle', 'Native American', 'Cabaret', 'New Wave', 'Psychadelic',
  'Rave', 'Showtunes', 'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz',
  'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock', 'Folk', 'Folk-Rock',
  'National Folk', 'Swing', 'Fast Fusion', 'Bebob', 'Latin', 'Revival', 'Celtic',
  'Bluegrass', 'Avantgarde', 'Gothic Rock', 'Progressive Rock', 'Psychedelic Rock',
  'Symphonic Rock', 'Slow Rock', 'Big Band', 'Chorus', 'Easy Listening',
  'Acoustic', 'Humour', 'Speech', 'Chanson', 'Opera', 'Chamber Music', 'Sonata',
  'Symphony', 'Booty Bass', 'Primus', 'Porn Groove', 'Satire', 'Slow Jam',
  'Club', 'Tango', 'Samba', 'Folklore', 'Ballad', 'Power Ballad', 'Rhythmic Soul',
  'Freestyle', 'Duet', 'Punk Rock', 'Drum Solo', 'A Cappella', 'Euro-House',
  'Dance Hall', 'Goa', 'Drum & Bass', 'Club-House', 'Hardcore', 'Terror', 'Indie',
  'BritPop', 'Negerpunk', 'Polsk Punk', 'Beat', 'Christian Gangsta Rap',
  'Heavy Metal', 'Black Metal', 'Crossover', 'Contemporary Christian',
  'Christian Rock', 'Merengue', 'Salsa', 'Thrash Metal', 'Anime', 'JPop',
  'Synthpop', 'Abstract', 'Art Rock', 'Baroque', 'Bhangra', 'Big Beat',
  'Breakbeat', 'Chillout', 'Downtempo', 'Dub', 'EBM', 'Eclectic', 'Electro',
  'Electroclash', 'Emo', 'Experimental', 'Garage', 'Global', 'IDM', 'Illbient',
  'Industro-Goth', 'Jam Band', 'Krautrock', 'Leftfield', 'Lounge', 'Math Rock',
  'New Romantic', 'Nu-Breakz', 'Post-Punk', 'Post-Rock', 'Psytrance', 'Shoegaze',
  'Space Rock', 'Trop Rock', 'World Music', 'Neoclassical', 'Audiobook',
  'Audio Theatre', 'Neue Deutsche Welle', 'Podcast', 'Indie Rock', 'G-Funk',
  'Dubstep', 'Garage Rock', 'Psybient'
];

function normalizeForMatch(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasKeyword(haystack, keyword) {
  const needle = normalizeForMatch(keyword);
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function genreFromText(text) {
  const haystack = normalizeForMatch(text);
  if (!haystack) return '';
  for (const key of GENRE_PRIORITY) {
    const words = GENRE_KEYWORDS[key] || [];
    if (words.some((word) => hasKeyword(haystack, word))) return key;
  }
  return '';
}

function cleanGenreTag(raw) {
  let value = String(raw || '').replace(/\0/g, ' ').replace(/\s+/g, ' ').trim();
  if (!value) return { key: '', label: '' };
  const numeric = value.match(/^\(?(\d{1,3})\)?$/);
  if (numeric && ID3_GENRES[Number(numeric[1])]) value = ID3_GENRES[Number(numeric[1])];
  const stripped = value.replace(/\(\d{1,3}\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (stripped && !/^\d+$/.test(stripped)) value = stripped;
  const parts = value.split(/[\/;,|]+/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const key = genreFromText(part);
    if (key) return { key, label: GENRE_LABELS[key] };
  }
  const key = genreFromText(value);
  if (key) return { key, label: GENRE_LABELS[key] };
  return { key: '', label: value };
}

function moodFromText(text) {
  const haystack = normalizeForMatch(text);
  if (!haystack) return '';
  if (/(triste|melancol|nostal|llor|dolor|adios|soledad|invierno|rain|lluvia)/.test(haystack)) return 'emotional';
  if (/(romant|amor|corazon|beso|ternura|intim|sensual|slow)/.test(haystack)) return 'emotional';
  if (/(feliz|alegr|fiesta|party|bail|dance|energ|power|sun|verano|club|hyper)/.test(haystack)) return 'energetic';
  if (/(calma|calm|tranquil|suave|relax|sleep|dormir|ambient|chill|lofi|piano)/.test(haystack)) return 'calm';
  return '';
}

function synchsafe(buffer, offset) {
  return ((buffer[offset] & 0x7f) << 21)
    | ((buffer[offset + 1] & 0x7f) << 14)
    | ((buffer[offset + 2] & 0x7f) << 7)
    | (buffer[offset + 3] & 0x7f);
}

function decodeId3Text(data) {
  if (!data || !data.length) return '';
  const encoding = data[0];
  let body = data.subarray(1);
  if (encoding === 0) return body.toString('latin1').replace(/\0.*$/, '').replace(/^\uFEFF/, '').trim();
  if (encoding === 3) return body.toString('utf8').replace(/\0.*$/, '').replace(/^\uFEFF/, '').trim();
  if (encoding === 1) {
    if (body[0] === 0xff && body[1] === 0xfe) {
      return body.subarray(2).toString('utf16le').replace(/\0.*$/, '').replace(/^\uFEFF/, '').trim();
    }
    if (body[0] === 0xfe && body[1] === 0xff) {
      let copy = Buffer.from(body.subarray(2));
      if (copy.length % 2) copy = copy.subarray(0, copy.length - 1);
      copy.swap16();
      return copy.toString('utf16le').replace(/\0.*$/, '').replace(/^\uFEFF/, '').trim();
    }
    return body.toString('utf16le').replace(/\0.*$/, '').replace(/^\uFEFF/, '').trim();
  }
  if (encoding === 2) {
    let copy = Buffer.from(body);
    if (copy.length % 2) copy = copy.subarray(0, copy.length - 1);
    copy.swap16();
    return copy.toString('utf16le').replace(/\0.*$/, '').replace(/^\uFEFF/, '').trim();
  }
  return body.toString('utf8').replace(/\0.*$/, '').replace(/^\uFEFF/, '').trim();
}

function normalizeTagKeys(raw) {
  if (!raw) return null;
  const pick = (...keys) => {
    for (const key of keys) {
      if (raw[key] !== undefined && raw[key] !== null && String(raw[key]).trim()) {
        return String(raw[key]).trim();
      }
    }
    return '';
  };
  const genre = pick('GENRE', 'TCON', 'TCO', 'genre');
  const title = pick('TITLE', 'TIT2', 'TT2', 'INAM');
  const artist = pick('ARTIST', 'TPE1', 'TP1', 'IART');
  const album = pick('ALBUM', 'TALB', 'TAL', 'IPRD');
  const mood = pick('MOOD', 'TMOO', 'CONTENTGROUP', 'ICMT');
  const bpmRaw = pick('BPM', 'TBPM', 'TEMPO');
  const bpmNumber = Number(String(bpmRaw).replace(/[^0-9.]/g, ''));
  if (!genre && !title && !artist && !album && !mood && !bpmRaw) return null;
  return {
    genre,
    title,
    artist,
    album,
    mood,
    bpm: Number.isFinite(bpmNumber) && bpmNumber > 0 ? Math.round(bpmNumber) : 0
  };
}

function parseId3v2(buffer) {
  if (!buffer || buffer.length < 10) return null;
  if (buffer.toString('latin1', 0, 3) !== 'ID3') return null;
  const version = buffer[3];
  if (version < 2 || version > 4) return null;
  const flags = buffer[5];
  const size = synchsafe(buffer, 6);
  let offset = 10;
  if (flags & 0x40 && offset + 4 <= buffer.length) {
    if (version === 3) {
      const extSize = buffer.readUInt32BE(offset);
      offset += 4 + extSize;
    } else if (version === 4) {
      offset += synchsafe(buffer, offset);
    }
  }
  const end = Math.min(buffer.length, 10 + size);
  const raw = {};
  while (offset + (version === 2 ? 6 : 10) <= end) {
    let id;
    let frameSize;
    let headerSize;
    if (version === 2) {
      id = buffer.toString('latin1', offset, offset + 3);
      frameSize = (buffer[offset + 3] << 16) | (buffer[offset + 4] << 8) | buffer[offset + 5];
      headerSize = 6;
    } else {
      id = buffer.toString('latin1', offset, offset + 4);
      frameSize = version === 4 ? synchsafe(buffer, offset + 4) : buffer.readUInt32BE(offset + 4);
      headerSize = 10;
    }
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    const dataStart = offset + headerSize;
    const dataEnd = dataStart + frameSize;
    if (frameSize <= 0 || dataEnd > end) break;
    if (!raw[id]) raw[id] = decodeId3Text(buffer.subarray(dataStart, dataEnd));
    offset = dataEnd;
  }
  return normalizeTagKeys(raw);
}

function parseFlacTags(buffer) {
  if (!buffer || buffer.length < 8 || buffer.toString('latin1', 0, 4) !== 'fLaC') return null;
  const raw = {};
  let offset = 4;
  while (offset + 4 <= buffer.length) {
    const header = buffer[offset];
    const last = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const length = (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3];
    offset += 4;
    if (offset + length > buffer.length) break;
    if (type === 4) {
      let pointer = offset;
      if (pointer + 4 > buffer.length) break;
      const vendorLength = buffer.readUInt32LE(pointer);
      pointer += 4 + vendorLength;
      if (pointer + 4 > buffer.length) break;
      const count = buffer.readUInt32LE(pointer);
      pointer += 4;
      for (let i = 0; i < count && pointer + 4 <= buffer.length; i += 1) {
        const entryLength = buffer.readUInt32LE(pointer);
        pointer += 4;
        if (pointer + entryLength > buffer.length) break;
        const entry = buffer.toString('utf8', pointer, pointer + entryLength);
        pointer += entryLength;
        const equals = entry.indexOf('=');
        if (equals > 0) {
          const key = entry.slice(0, equals).trim().toUpperCase();
          const value = entry.slice(equals + 1).trim();
          if (key && value && !raw[key]) raw[key] = value;
        }
      }
    }
    if (last) break;
    offset += length;
  }
  return normalizeTagKeys(raw);
}

function parseWavTags(buffer) {
  if (!buffer || buffer.length < 12 || buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WAVE') return null;
  const raw = {};
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('latin1', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) break;
    if (id === 'LIST' && buffer.toString('latin1', dataStart, dataStart + 4) === 'INFO') {
      let pointer = dataStart + 4;
      while (pointer + 8 <= dataEnd) {
        const subId = buffer.toString('latin1', pointer, pointer + 4);
        const subSize = buffer.readUInt32LE(pointer + 4);
        const subStart = pointer + 8;
        const subEnd = subStart + subSize;
        if (subEnd > dataEnd) break;
        if (['INAM', 'IART', 'IGNR', 'IPRD', 'ICMT'].includes(subId)) {
          raw[subId] = buffer.toString('utf8', subStart, subEnd).replace(/\0.*$/, '').trim();
        }
        pointer = subEnd + (subSize % 2);
      }
    } else if (id === 'id3 ' || id === 'ID3 ') {
      const tags = parseId3v2(buffer.subarray(dataStart, dataEnd));
      if (tags) return tags;
    }
    offset = dataEnd + (size % 2);
  }
  return normalizeTagKeys(raw);
}

function parseAudioTags(buffer) {
  if (!buffer || buffer.length < 10) return null;
  const head = buffer.toString('latin1', 0, 4);
  if (head === 'ID3') return parseId3v2(buffer);
  if (head === 'fLaC') return parseFlacTags(buffer);
  if (head === 'RIFF') return parseWavTags(buffer);
  return null;
}

/**
 * Perfil estable para archivos sin etiquetas. No pretende adivinar el género
 * real: reparte la biblioteca en arquetipos variados para que la radio pueda
 * recomendar por hora. Se puede sobrescribir con ID3/Vorbis o «[genero]».
 */
const ESTIMATED_GENRES = [
  'electronica', 'pop', 'urbano', 'trap', 'rock', 'indie', 'folk', 'balada',
  'hiphop', 'rnb', 'lofi', 'ambient', 'jazz', 'clasica', 'latino', 'funk',
  'synthpop', 'instrumental', 'reggaeton', 'metal', 'acustico', 'country'
];

function stableHash(text) {
  let hash = 2166136261;
  const value = String(text || '').toLowerCase();
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function resolveGenre({ explicit, tags, album, name }) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (tags?.genre) candidates.push(tags.genre);
  if (album && album !== DEFAULT_ALBUM) candidates.push(album);
  if (name) candidates.push(name.replace(/\.[a-z0-9]{2,5}$/i, ''));
  for (const candidate of candidates) {
    const info = cleanGenreTag(candidate);
    if (info.key) return info;
  }
  const raw = explicit || tags?.genre || '';
  if (raw) {
    const info = cleanGenreTag(raw);
    if (info.label) return info;
  }
  return { key: '', label: '' };
}

function classifyTrack({ name, album, tags }) {
  const parsed = parseTrackName(name);
  const genreInfo = resolveGenre({ explicit: parsed.explicitGenre, tags, album, name });
  let genre = genreInfo.key;
  let estimated = false;

  // Sin etiquetas ni palabras clave: asignamos un arquetipo estable por archivo.
  if (!genre) {
    genre = ESTIMATED_GENRES[stableHash(name) % ESTIMATED_GENRES.length];
    estimated = true;
  }

  let energy = GENRE_ENERGY[genre] || 50;
  let mood = moodFromText(tags?.mood || '');
  if (!mood && genre) mood = GENRE_MOOD[genre] || 'balanced';
  if (!mood) mood = moodFromText(`${name} ${parsed.title}`);
  if (tags?.bpm) energy = Math.max(8, Math.min(98, Math.round((tags.bpm - 55) * 0.62 + 18)));

  const text = normalizeForMatch(`${name} ${parsed.title} ${album} ${tags?.title || ''}`);
  if (/(calma|calm|tranquil|suave|slow|sleep|dormir|lluvia|piano|lofi|lo fi|ambient|acoustic|acustic)/.test(text)) energy -= 12;
  if (/(remix|club|party|fiesta|dance|energ|fast|rapid|hyper|power|bass|drop)/.test(text)) energy += 12;
  energy = Math.max(5, Math.min(98, energy));

  if (!mood) mood = energy >= 68 ? 'energetic' : energy <= 34 ? 'calm' : 'balanced';
  if (/(amor|corazon|triste|melancol|llorar|recuerdo|carta|adios|despues de ti|soledad|romant|sentim|emoci)/.test(text) && energy < 78) {
    mood = 'emotional';
  }

  const style = GENRE_STYLE[genre] || 'Sin clasificar';
  return {
    genre,
    genreLabel: GENRE_LABELS[genre] || genreInfo.label || 'Sin género',
    style,
    styleLabel: style,
    mood,
    moodLabel: MOOD_LABELS[mood] || MOOD_LABELS.balanced,
    energy,
    bpm: tags?.bpm || 0,
    classification: estimated ? 'estimated' : (tags?.genre ? 'tag' : 'filename')
  };
}

/**
 * Convierte «01 - Artista - Título [rock].mp3» en { artist, title, explicitGenre }.
 * El sufijo [género] es opcional y sirve para clasificar sin depender de ID3.
 */
function parseTrackName(rawName) {
  let base = String(rawName || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Etiqueta manual al final: «Tema [electronica]». Se quita del título.
  let explicitGenre = '';
  const tag = base.match(/\s*\[([^\]]{1,40})\]\s*$/);
  if (tag) {
    explicitGenre = tag[1].trim();
    base = base.slice(0, tag.index).trim();
  }

  base = base.replace(/^(\d{1,3})\s*[.)\-–—]\s*/, '').trim();
  let artist = '';
  let title = base;
  const parts = base.split(/\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    if (/^\d{1,3}$/.test(parts[0])) parts.shift();
    if (parts.length >= 2) {
      artist = parts[0];
      title = parts.slice(1).join(' - ');
    }
  }
  if (!title) title = base || 'Sin título';
  return { title, artist: artist || DEFAULT_ARTIST, explicitGenre };
}

function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

/**
 * Añade una pista al catálogo. `tags` viene de ID3/Vorbis/WAV y es opcional.
 * La clasificación (género, estilo, emoción, energía) se calcula aquí para
 * que el cliente solo tenga que ordenar y recomendar.
 */
function addTrack(list, { key, entry, coverEntry, name, album, tags }) {
  const parsed = parseTrackName(name);
  const classification = classifyTrack({ name, album, tags });
  const token = tokenFor(key);
  entries.set(token, { ...entry, type: 'audio' });

  let coverToken = null;
  if (coverEntry) {
    coverToken = tokenFor(coverEntry.key);
    entries.set(coverToken, { ...coverEntry.entry, type: 'image' });
  }

  list.push({
    token,
    coverToken,
    title: tags?.title || parsed.title,
    artist: tags?.artist || parsed.artist,
    album: tags?.album || album || DEFAULT_ALBUM,
    ...classification
  });
}

function sortCatalog(list) {
  list.sort((a, b) => {
    const album = naturalCompare(a.album, b.album);
    if (album !== 0) return album;
    return naturalCompare(`${a.artist} ${a.title}`, `${b.artist} ${b.title}`);
  });
  return list;
}

/** Ejecuta `mapper` con un máximo de promesas simultáneas. */
async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Solo leemos etiquetas si el nombre o la carpeta no nos dieron ya el género.
 * Así evitamos descargar 256 KB por cada pista de una carpeta grande.
 */
function needsTagLookup(name, album) {
  const parsed = parseTrackName(name);
  if (parsed.explicitGenre && cleanGenreTag(parsed.explicitGenre).key) return false;
  if (genreFromText(name)) return false;
  if (album && album !== DEFAULT_ALBUM && genreFromText(album)) return false;
  return true;
}

/** Lee los primeros 256 KB de un archivo local y extrae ID3/Vorbis/RIFF. */
async function readLocalTags(filePath) {
  let handle = null;
  try {
    handle = await fsp.open(filePath, 'r');
    const stat = await handle.stat();
    const length = Math.min(stat.size, 256 * 1024);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return parseAudioTags(buffer);
  } catch {
    return null;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

const driveTagCache = new Map();

/** Lee solo el encabezado del audio en Drive; cachea por ID para no repetir. */
async function readDriveTags(file) {
  if (driveTagCache.has(file.id)) return driveTagCache.get(file.id);
  let upstream = null;
  try {
    upstream = await fetchDriveMedia(
      { driveId: file.id, public: Boolean(file.public) },
      { range: 'bytes=0-131071' },
      AbortSignal.timeout(6000)
    );
    if (!upstream.ok && upstream.status !== 206) {
      if (upstream.body) await upstream.body.cancel().catch(() => {});
      driveTagCache.set(file.id, null);
      return null;
    }
    // Si Drive ignoró el Range y devolvió el archivo completo, no lo leemos.
    const length = Number(upstream.headers.get('content-length') || 0);
    if (upstream.status === 200 && length > 1024 * 1024) {
      if (upstream.body) await upstream.body.cancel().catch(() => {});
      driveTagCache.set(file.id, null);
      return null;
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const tags = parseAudioTags(buffer);
    driveTagCache.set(file.id, tags);
    return tags;
  } catch {
    driveTagCache.set(file.id, null);
    return null;
  }
}

async function listDriveFolder(folderId) {
  const files = [];
  const walk = async (id, depth, album) => {
    if (depth > 4) return;
    let pageToken = '';
    do {
      const data = await driveJson('/files', {
        q: `'${id}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)',
        pageSize: 1000,
        orderBy: 'folder,name_natural',
        pageToken,
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true'
      });
      for (const file of data.files || []) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          await walk(file.id, depth + 1, depth === 0 ? file.name : album);
        } else {
          files.push({ ...file, album: album || DEFAULT_ALBUM });
        }
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
  };
  await walk(folderId, 0, '');
  return files;
}

/**
 * Convierte la lista de archivos de Drive en pistas.
 * Las etiquetas se piden en paralelo (máximo 6) solo cuando hacen falta.
 */
async function catalogFromDrive(files) {
  const imagesByParent = new Map();
  for (const file of files) {
    if (!isImage(file.name, file.mimeType)) continue;
    const parent = (file.parents && file.parents[0]) || 'root';
    if (!imagesByParent.has(parent)) imagesByParent.set(parent, []);
    imagesByParent.get(parent).push(file);
  }

  const audioFiles = files.filter((file) => isAudio(file.name, file.mimeType));
  const prepared = await mapLimit(audioFiles, 10, async (file) => {
    const tags = needsTagLookup(file.name, file.album) ? await readDriveTags(file) : null;
    return { file, tags };
  });

  const list = [];
  for (const { file, tags } of prepared) {
    const parent = (file.parents && file.parents[0]) || 'root';
    const images = imagesByParent.get(parent) || [];
    const base = path.basename(file.name, path.extname(file.name)).toLowerCase();
    const cover = images.find((img) => path.basename(img.name, path.extname(img.name)).toLowerCase() === base)
      || images.find((img) => /^(cover|portada|front|folder|album)$/i.test(path.basename(img.name, path.extname(img.name))))
      || null;

    addTrack(list, {
      key: `drive:audio:${file.id}`,
      entry: {
        driveId: file.id,
        public: Boolean(file.public),
        mime: mimeFor(file.name, file.mimeType),
        name: file.name
      },
      coverEntry: cover ? {
        key: `drive:image:${cover.id}`,
        entry: {
          driveId: cover.id,
          public: Boolean(cover.public),
          mime: mimeFor(cover.name, cover.mimeType),
          name: cover.name
        }
      } : null,
      name: file.name,
      album: file.album,
      tags
    });
  }
  return sortCatalog(list);
}

async function catalogFromLocal() {
  const list = [];
  let exists = true;
  try {
    const stat = await fsp.stat(MUSIC_DIR);
    if (!stat.isDirectory()) exists = false;
  } catch {
    exists = false;
  }
  if (!exists) {
    const error = new Error(`No existe la carpeta de música local: ${MUSIC_DIR}`);
    error.hint = 'Crea la carpeta musica/ y suelta ahí tus MP3, o configura Google Drive en .env.';
    throw error;
  }

  const walk = async (dir, depth, album) => {
    if (depth > 3) return;
    const items = await fsp.readdir(dir, { withFileTypes: true });
    const audio = [];
    const images = [];
    for (const item of items) {
      if (item.name.startsWith('.')) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(full, depth + 1, depth === 0 ? item.name : album);
      } else if (isAudio(item.name)) {
        audio.push({ name: item.name, full });
      } else if (isImage(item.name)) {
        images.push({ name: item.name, full });
      }
    }
    const prepared = await mapLimit(audio, 8, async (file) => {
      const tags = needsTagLookup(file.name, album || DEFAULT_ALBUM) ? await readLocalTags(file.full) : null;
      return { file, tags };
    });

    for (const { file, tags } of prepared) {
      const base = path.basename(file.name, path.extname(file.name)).toLowerCase();
      const cover = images.find((img) => path.basename(img.name, path.extname(img.name)).toLowerCase() === base)
        || images.find((img) => /^(cover|portada|front|folder|album)$/i.test(path.basename(img.name, path.extname(img.name))))
        || null;
      addTrack(list, {
        key: `local:audio:${file.full}`,
        entry: { filePath: file.full, mime: mimeFor(file.name), name: file.name },
        coverEntry: cover ? {
          key: `local:image:${cover.full}`,
          entry: { filePath: cover.full, mime: mimeFor(cover.name), name: cover.name }
        } : null,
        name: file.name,
        album: album || DEFAULT_ALBUM,
        tags
      });
    }
  };

  await walk(MUSIC_DIR, 0, '');
  return sortCatalog(list);
}

async function buildCatalog() {
  const started = Date.now();
  let tracks = [];
  if (MODE === 'drive') {
    if (!DRIVE_FOLDER_ID) {
      const error = new Error('Google Drive no está configurado.');
      error.hint = 'Rellena DRIVE_FOLDER_ID en .env. Si la carpeta es privada, añade GOOGLE_API_KEY o una cuenta de servicio.';
      throw error;
    }
    // Con credenciales usamos la API oficial; sin ellas, el listado público.
    const files = DRIVE_READY
      ? await listDriveFolder(DRIVE_FOLDER_ID)
      : await listPublicDriveFolder(DRIVE_FOLDER_ID);
    tracks = await catalogFromDrive(files);
  } else {
    tracks = await catalogFromLocal();
  }
  catalog.mode = MODE;
  catalog.tracks = tracks;
  catalog.updatedAt = Date.now();
  catalog.error = null;
  catalog.hint = '';
  catalog.warnings = [];
  if (!tracks.length) {
    catalog.warnings.push(MODE === 'drive'
      ? 'La carpeta de Drive no tiene audios reconocibles.'
      : 'La carpeta musica/ está vacía. Ejecuta «npm run demo-audio» o suelta tus archivos.');
  }
  console.log(`[radio] catálogo ${MODE}: ${tracks.length} pistas en ${Date.now() - started} ms`);
  return catalog;
}

async function ensureCatalog(force = false) {
  if (!force && catalog.updatedAt && Date.now() - catalog.updatedAt < CATALOG_TTL) return catalog;
  if (building) return building;
  if (force) driveTagCache.clear();
  building = buildCatalog()
    .catch((error) => {
      catalog.error = error.message;
      catalog.hint = error.hint || '';
      catalog.updatedAt = Date.now();
      console.warn('[radio] error de catálogo:', error.message);
      throw error;
    })
    .finally(() => { building = null; });
  return building;
}

/* ---------- Audio -------------------------------------------- */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match) return null;
  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);
  if (start === null && end === null) return null;
  if (start === null) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (end === null) {
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return { invalid: true };
  return { start, end: Math.min(end, size - 1) };
}

function baseAudioHeaders(entry) {
  return {
    'Content-Type': entry.mime || 'audio/mpeg',
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, no-store, max-age=0',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
}

async function streamLocal(req, res, entry, range) {
  const stat = await fsp.stat(entry.filePath);
  const size = stat.size;
  const headers = baseAudioHeaders(entry);

  if (req.method === 'HEAD') {
    res.writeHead(200, { ...headers, 'Content-Length': String(size) });
    return res.end();
  }

  const parsed = range ? parseRange(range, size) : null;
  if (parsed && parsed.invalid) {
    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
    return res.end();
  }
  if (parsed) {
    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${parsed.start}-${parsed.end}/${size}`,
      'Content-Length': String(parsed.end - parsed.start + 1)
    });
    const stream = fs.createReadStream(entry.filePath, { start: parsed.start, end: parsed.end });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    res.on('close', () => stream.destroy());
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': String(size) });
  const stream = fs.createReadStream(entry.filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
  res.on('close', () => stream.destroy());
}

async function streamDrive(req, res, entry, range) {
  // Drive público a veces corta la conexión o devuelve un 5xx pasajero.
  // Un reintento evita saltar la pista por un fallo de un segundo.
  let upstream = null;
  let lastError = null;
  for (let attempt = 0; attempt < 2 && !upstream; attempt += 1) {
    const controller = new AbortController();
    const guard = setTimeout(() => controller.abort(), 30_000);
    try {
      const candidate = await fetchDriveMedia(entry, range ? { range } : {}, controller.signal);
      if (!candidate.ok && candidate.status >= 500 && attempt === 0) {
        if (candidate.body) await candidate.body.cancel().catch(() => {});
        lastError = new Error(`Drive HTTP ${candidate.status}`);
      } else {
        upstream = candidate;
      }
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(guard);
    }
    if (!upstream && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  if (!upstream) throw lastError || new Error('Drive no respondió.');

  if (upstream.status === 416) {
    res.writeHead(416, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Range': upstream.headers.get('content-range') || `bytes */${entry.size || 0}`,
      'Cache-Control': 'no-store'
    });
    return res.end();
  }

  if (!upstream.ok) {
    const status = upstream.status === 404 ? 404 : 502;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: false, error: 'Drive no entregó el audio.', status: upstream.status }));
  }

  const upstreamType = upstream.headers.get('content-type') || '';
  if (upstreamType.includes('text/html') || upstreamType.includes('application/json')) {
    // Google devuelve una página de aviso en archivos enormes o sin permiso.
    if (upstream.body) await upstream.body.cancel().catch(() => {});
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({
      ok: false,
      error: 'Drive devolvió una página en vez del audio. Revisa los permisos del archivo o su tamaño (más de 100 MB).'
    }));
  }

  const headers = baseAudioHeaders(entry);
  headers['Content-Type'] = entry.mime || upstreamType || 'audio/mpeg';
  for (const name of ['content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  if (!headers['accept-ranges']) headers['accept-ranges'] = 'bytes';

  res.writeHead(upstream.status === 206 ? 206 : 200, headers);
  if (req.method === 'HEAD' || !upstream.body) {
    if (upstream.body) await upstream.body.cancel().catch(() => {});
    return res.end();
  }
  const stream = Readable.fromWeb(upstream.body);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
  res.on('close', () => stream.destroy());
}

async function handleMedia(req, res, url, kind) {
  const token = url.pathname.split('/').pop();
  const sid = parseCookies(req.headers.cookie).rl_sid;

  if (!sessionAlive(sid)) return sendJson(res, 403, { ok: false, error: 'Sesión no válida. Recarga la página.' });
  if (!sameOriginRequest(req)) return sendJson(res, 403, { ok: false, error: 'Origen no permitido.' });
  if (!verifySignature(kind, token, url.searchParams.get('e'), url.searchParams.get('s'), sid)) {
    return sendJson(res, 403, { ok: false, error: 'Enlace caducado. Recarga la radio.' });
  }
  if (rateLimited(req, `media:${kind}`, 240)) {
    return sendJson(res, 429, { ok: false, error: 'Demasiadas peticiones. Espera un momento.' });
  }

  const entry = entries.get(token);
  if (!entry || entry.type !== (kind === 'stream' ? 'audio' : 'image')) {
    return sendJson(res, 404, { ok: false, error: 'Pista no encontrada.' });
  }

  try {
    if (entry.filePath) {
      if (kind === 'stream') return await streamLocal(req, res, entry, req.headers.range);
      const stat = await fsp.stat(entry.filePath);
      res.writeHead(200, {
        'Content-Type': entry.mime || 'image/jpeg',
        'Content-Length': String(stat.size),
        'Cache-Control': 'private, max-age=1800',
        'X-Content-Type-Options': 'nosniff'
      });
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(entry.filePath);
      stream.on('error', () => res.destroy());
      return stream.pipe(res);
    }
    if (kind === 'stream') return await streamDrive(req, res, entry, req.headers.range);

    // Portada: primero la miniatura ligera de Drive (mucho menos peso);
    // si no está disponible, el archivo original.
    let upstream = null;
    try {
      const thumb = await fetch(
        `https://drive.google.com/thumbnail?id=${encodeURIComponent(entry.driveId)}&sz=w800`,
        { redirect: 'follow', signal: AbortSignal.timeout(15_000) }
      );
      const type = thumb.headers.get('content-type') || '';
      if (thumb.ok && type.startsWith('image/')) upstream = thumb;
      else if (thumb.body) await thumb.body.cancel().catch(() => {});
    } catch { /* seguimos con el original */ }

    if (!upstream) {
      upstream = await fetchDriveMedia(entry, {}, AbortSignal.timeout(30_000));
    }

    if (!upstream.ok) {
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      return res.end();
    }
    const coverHeaders = {
      'Content-Type': upstream.headers.get('content-type') || entry.mime || 'image/jpeg',
      'Cache-Control': 'private, max-age=1800',
      'X-Content-Type-Options': 'nosniff'
    };
    const coverLength = upstream.headers.get('content-length');
    if (coverLength) coverHeaders['Content-Length'] = coverLength;
    res.writeHead(200, coverHeaders);
    if (req.method === 'HEAD' || !upstream.body) {
      if (upstream.body) await upstream.body.cancel().catch(() => {});
      return res.end();
    }
    const stream = Readable.fromWeb(upstream.body);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    res.on('close', () => stream.destroy());
  } catch (error) {
    console.warn('[radio] media:', error.message);
    if (!res.headersSent) sendJson(res, 502, { ok: false, error: 'No se pudo abrir la pista.' });
    else res.destroy();
  }
}

/* ---------- Respuestas --------------------------------------- */
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data:",
    "media-src 'self' blob:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'"
  ].join('; '));
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function tracksPayload(sid) {
  return {
    ok: true,
    mode: catalog.mode,
    updatedAt: catalog.updatedAt,
    warnings: catalog.warnings,
    tracks: catalog.tracks.map((track) => ({
      id: track.token,
      title: track.title,
      artist: track.artist,
      album: track.album,
      genre: track.genre || '',
      genreLabel: track.genreLabel || 'Sin género',
      style: track.style || 'Sin clasificar',
      styleLabel: track.styleLabel || 'Sin clasificar',
      mood: track.mood || 'balanced',
      moodLabel: track.moodLabel || 'Equilibrada',
      energy: Number.isFinite(track.energy) ? track.energy : 50,
      bpm: track.bpm || 0,
      classification: track.classification || 'estimated',
      cover: track.coverToken ? signedPath('cover', track.coverToken, sid) : null,
      stream: signedPath('stream', track.token, sid)
    }))
  };
}

/* ---------- Voz de respaldo (TTS gratuito) -------------------
   El navegador intenta primero speechSynthesis (local y gratis).
   Si el sistema no tiene voces o el motor está bloqueado, el
   cliente pide esta ruta y el servidor sintetiza con el endpoint
   público de Google Translate TTS: no necesita API key ni pago.
   Es un servicio no oficial; si un día falla, la radio sigue
   funcionando y los comentarios quedan escritos.

   Para cambiar de proveedor solo hay que tocar fetchTtsChunk().
   ------------------------------------------------------------ */
const TTS_MAX_CHARS = 300;
const TTS_CACHE_LIMIT = 80;
const TTS_CACHE = new Map();

/** Corta el texto en trozos <= 180 caracteres (límite del endpoint). */
function splitTtsText(text, max = 180) {
  const clean = String(text || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];

  const chunks = [];
  let rest = clean;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.55) cut = max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}

/** Pide un trozo a Google Translate TTS y devuelve el MP3. */
async function fetchTtsChunk(text, lang) {
  const endpoints = [
    `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${lang}&q=${encodeURIComponent(text)}`,
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text)}`
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const upstream = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
          'Referer': 'https://translate.google.com/'
        },
        signal: AbortSignal.timeout(12_000)
      });
      const type = upstream.headers.get('content-type') || '';
      if (!upstream.ok || !type.startsWith('audio/')) {
        if (upstream.body) await upstream.body.cancel().catch(() => {});
        lastError = new Error(`TTS ${upstream.status}`);
        continue;
      }
      return Buffer.from(await upstream.arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('TTS no disponible');
}

/** Une los trozos en un solo MP3 (los frames se pueden concatenar). */
async function synthesizeSpeech(text, lang) {
  const chunks = splitTtsText(text);
  if (!chunks.length) return Buffer.alloc(0);
  const buffers = [];
  for (const chunk of chunks) {
    buffers.push(await fetchTtsChunk(chunk, lang));
  }
  return Buffer.concat(buffers);
}

async function handleTts(req, res, url) {
  if (!sameOriginRequest(req)) {
    return sendJson(res, 403, { ok: false, error: 'Origen no permitido.' });
  }
  if (rateLimited(req, 'tts', 80)) {
    return sendJson(res, 429, { ok: false, error: 'Demasiadas peticiones de voz.' });
  }

  const text = String(url.searchParams.get('text') || '').slice(0, TTS_MAX_CHARS).trim();
  if (!text) return sendJson(res, 400, { ok: false, error: 'Falta el texto.' });
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
  const key = `${lang}:${text}`;

  let audio = TTS_CACHE.get(key);
  if (!audio) {
    try {
      audio = await synthesizeSpeech(text, lang);
    } catch (error) {
      console.warn('[radio] tts:', error.message);
      return sendJson(res, 502, { ok: false, error: 'La voz de respaldo no está disponible.' });
    }
    if (!audio.length) return sendJson(res, 502, { ok: false, error: 'La voz de respaldo devolvió audio vacío.' });
    // Caché simple: las frases se repiten mucho entre canciones.
    if (TTS_CACHE.size >= TTS_CACHE_LIMIT) {
      TTS_CACHE.delete(TTS_CACHE.keys().next().value);
    }
    TTS_CACHE.set(key, audio);
  }

  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(audio.length),
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff'
  });
  if (req.method === 'HEAD') return res.end();
  return res.end(audio);
}

/* ---------- Estáticos ---------------------------------------- */
async function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return sendJson(res, 400, { ok: false, error: 'Ruta inválida.' });
  }
  if (decoded.includes('\0')) return sendJson(res, 400, { ok: false, error: 'Ruta inválida.' });
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    return sendJson(res, 403, { ok: false, error: 'Prohibido.' });
  }

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return sendJson(res, 404, { ok: false, error: 'No encontrado.' });
  }
  if (!stat.isFile()) return sendJson(res, 404, { ok: false, error: 'No encontrado.' });

  const ext = path.extname(filePath).toLowerCase();
  const cacheable = !['.html', '.css', '.js'].includes(ext);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': String(stat.size),
    'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': cacheable ? 'public, max-age=3600' : 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/* ---------- Router ------------------------------------------- */
const server = http.createServer(async (req, res) => {
  securityHeaders(res);

  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendJson(res, 400, { ok: false, error: 'Petición inválida.' });
  }

  const pathname = url.pathname;

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { Allow: 'GET, HEAD' });
      return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { ok: false, error: 'Método no permitido.' });
    }

    if (pathname === '/api/tracks') {
      const sid = sessionFor(req, res);
      if (rateLimited(req, 'tracks', 40)) return sendJson(res, 429, { ok: false, error: 'Espera un momento.' });
      try {
        await ensureCatalog(url.searchParams.get('refresh') === '1');
      } catch (error) {
        return sendJson(res, 502, {
          ok: false,
          error: error.message,
          hint: error.hint || 'Revisa la configuración de .env y la consola del servidor.'
        });
      }
      return sendJson(res, 200, tracksPayload(sid));
    }

    if (pathname === '/api/status') {
      return sendJson(res, 200, {
        ok: !catalog.error,
        mode: MODE,
        driveConfigured: Boolean(DRIVE_FOLDER_ID),
        driveAuthenticated: DRIVE_READY,
        drivePublic: PUBLIC_DRIVE,
        folder: DRIVE_FOLDER_ID ? `${DRIVE_FOLDER_ID.slice(0, 4)}…${DRIVE_FOLDER_ID.slice(-3)}` : '',
        tracks: catalog.tracks.length,
        updatedAt: catalog.updatedAt,
        error: catalog.error,
        hint: catalog.hint,
        warnings: catalog.warnings,
        secretEphemeral: SECRET_IS_EPHEMERAL,
        ttsFallback: true
      });
    }

    if (pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
    }

    if (pathname === '/api/tts') return await handleTts(req, res, url);
    if (pathname.startsWith('/api/stream/')) return await handleMedia(req, res, url, 'stream');
    if (pathname.startsWith('/api/cover/')) return await handleMedia(req, res, url, 'cover');

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { ok: false, error: 'Endpoint desconocido.' });
    }

    return await serveStatic(req, res, pathname);
  } catch (error) {
    console.error('[radio] error inesperado:', error);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Error interno.' });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  JAVA RADIO · 140.1');
  console.log(`  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  fuente: ${MODE}${MODE === 'local' ? ` (${MUSIC_DIR})` : ''}`);
  if (SECRET_IS_EPHEMERAL) {
    console.log('  aviso: SESSION_SECRET vacío; se generó uno temporal.');
  }
  if (MODE === 'drive' && !DRIVE_FOLDER_ID) {
    console.log('  aviso: falta DRIVE_FOLDER_ID en .env.');
  } else if (MODE === 'drive' && PUBLIC_DRIVE) {
    console.log('  Drive público: listado sin API key (solo carpetas compartidas con enlace).');
  }
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n  radio apagada. hasta la próxima.');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
});
