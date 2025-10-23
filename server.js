const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const APP_SUPPORT_NAME = 'AxureShare';

function resolvePlatformDataDir() {
  const override = process.env.AXURE_SHARE_DATA_DIR;
  if (override) {
    try {
      return path.resolve(override);
    } catch (err) {
      console.warn('无法解析 AXURE_SHARE_DATA_DIR:', override, err);
    }
  }
  const home = os.homedir && os.homedir();
  if (!home) return null;
  if (process.platform === 'win32') {
    const base =
      process.env.LOCALAPPDATA ||
      process.env.APPDATA ||
      path.join(home, 'AppData', 'Local');
    return path.join(base, APP_SUPPORT_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_SUPPORT_NAME);
  }
  const base = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  return path.join(base, APP_SUPPORT_NAME);
}

const defaultDataDir = () => {
  if (process.env.AXURE_SHARE_DATA_DIR) {
    return path.resolve(process.env.AXURE_SHARE_DATA_DIR);
  }
  if (process.pkg) {
    const platformDir = resolvePlatformDataDir();
    if (platformDir) return platformDir;
  }
  return path.join(ROOT_DIR, 'data');
};

const DATA_DIR = defaultDataDir();
const PUBLIC_DIR_CANDIDATES = [
  path.join(ROOT_DIR, 'public'),
  path.join(__dirname, 'public')
];
const PUBLIC_DIR = PUBLIC_DIR_CANDIDATES.find((dir) => fs.existsSync(dir));
if (!PUBLIC_DIR) {
  throw new Error('无法定位前端资源目录 public，请确认安装包完整。');
}
console.log('[Axure Preview Service] build 2025-10-14-02');
console.log('[Axure Preview Service] data dir:', DATA_DIR);

// Directories
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const SITES_DIR = path.join(DATA_DIR, 'sites');
const META_FILE = 'meta.json';
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const LEGACY_DATA_DIR = path.join(ROOT_DIR, 'data');
const LEGACY_UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const LEGACY_SITES_DIR = path.join(ROOT_DIR, 'sites');

// Ensure directories exist
[DATA_DIR, UPLOAD_DIR, SITES_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function moveOrCopy(fromPath, toPath) {
  try {
    fs.renameSync(fromPath, toPath);
    return true;
  } catch (err) {
    try {
      fs.cpSync(fromPath, toPath, { recursive: true });
      fs.rmSync(fromPath, { recursive: true, force: true });
      return true;
    } catch (err2) {
      console.warn('Failed to migrate item', fromPath, '->', toPath, err2);
      return false;
    }
  }
}

function migrateLegacyDir(fromDir, toDir) {
  if (!fs.existsSync(fromDir)) return;
  try {
    ensureDir(toDir);
    const legacyItems = fs.readdirSync(fromDir);
    if (!legacyItems.length) return;
    let movedAny = false;
    legacyItems.forEach((name) => {
      const fromPath = path.join(fromDir, name);
      const toPath = path.join(toDir, name);
      if (fs.existsSync(toPath)) return;
      if (moveOrCopy(fromPath, toPath)) movedAny = true;
    });
    const leftovers = fs.readdirSync(fromDir);
    if (!leftovers.length) {
      try {
        fs.rmSync(fromDir, { recursive: true, force: true });
      } catch {}
    }
    if (movedAny) {
      console.log(`Migrated legacy directory ${fromDir} -> ${toDir}`);
    }
  } catch (err) {
    console.warn('Failed to migrate legacy directory', fromDir, err);
  }
}

function migrateLegacyDataRoot() {
  const candidateDirs = [LEGACY_UPLOAD_DIR, LEGACY_SITES_DIR];
  const baseExists = fs.existsSync(LEGACY_DATA_DIR);
  if (!baseExists && !candidateDirs.some((dir) => fs.existsSync(dir))) return;

  if (path.resolve(LEGACY_DATA_DIR) === path.resolve(DATA_DIR)) return;

  try {
    if (baseExists) {
      const subdirs = fs.readdirSync(LEGACY_DATA_DIR);
      subdirs.forEach((name) => {
        const fromPath = path.join(LEGACY_DATA_DIR, name);
        const toPath = path.join(DATA_DIR, name);
        if (fs.existsSync(toPath)) return;
        moveOrCopy(fromPath, toPath);
      });
    }
    candidateDirs.forEach((dir) => migrateLegacyDir(dir, dir.includes('upload') ? UPLOAD_DIR : SITES_DIR));
  } catch (err) {
    console.warn('Failed to migrate legacy data root', err);
  }

  try {
    const remaining = fs.existsSync(LEGACY_DATA_DIR) ? fs.readdirSync(LEGACY_DATA_DIR) : [];
    if (!remaining.length) {
      fs.rmSync(LEGACY_DATA_DIR, { recursive: true, force: true });
    }
  } catch {}
}

migrateLegacyDataRoot();

let historyCache = null;

function normalizeHistoryEntry(meta) {
  if (!meta || !meta.slug) return null;
  const slug = meta.slug;
  const uploadedAt = meta.uploadedAt || null;
  const entryFile = meta.entryFile || meta.primaryHtml || 'index.html';
  const size = Number.isFinite(meta.size) ? meta.size : null;
  return {
    slug,
    url: meta.url || `/sites/${slug}/`,
    originalName: meta.originalName || slug,
    uploadedAt: uploadedAt || null,
    fileType: meta.fileType || 'unknown',
    entryFile,
    primaryHtml: meta.primaryHtml || null,
    size
  };
}

function loadHistoryCache() {
  if (historyCache) return historyCache;
  let items = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.items)) {
        items = parsed.items
          .map((entry) => normalizeHistoryEntry(entry))
          .filter(Boolean)
          .map((entry) => ({
            ...entry,
            uploadedAt: entry.uploadedAt || null
          }));
      }
    } catch (err) {
      console.warn('Failed to load history file, will recreate', err);
    }
  }
  historyCache = { items };
  return historyCache;
}

function saveHistoryCache() {
  if (!historyCache) return;
  try {
    ensureDir(path.dirname(HISTORY_FILE));
    const payload = {
      version: 1,
      items: historyCache.items
        .slice()
        .sort((a, b) => {
          const ta = a.uploadedAt ? new Date(a.uploadedAt).valueOf() : 0;
          const tb = b.uploadedAt ? new Date(b.uploadedAt).valueOf() : 0;
          return tb - ta;
        })
    };
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to persist history file', err);
  }
}

function upsertHistoryEntry(meta) {
  const entry = normalizeHistoryEntry(meta);
  if (!entry) return;
  const cache = loadHistoryCache();
  const idx = cache.items.findIndex((item) => item.slug === entry.slug);
  if (idx >= 0) {
    const existing = cache.items[idx];
    const next = {
      ...existing,
      ...entry
    };
    if (!entry.uploadedAt && existing.uploadedAt) {
      next.uploadedAt = existing.uploadedAt;
    }
    if (!Number.isFinite(entry.size) && Number.isFinite(existing.size)) {
      next.size = existing.size;
    }
    cache.items[idx] = next;
  } else {
    cache.items.push(entry);
  }
  saveHistoryCache();
}

function removeHistoryEntry(slug) {
  if (!slug) return;
  const cache = loadHistoryCache();
  const next = cache.items.filter((item) => item.slug !== slug);
  if (next.length === cache.items.length) return;
  cache.items = next;
  saveHistoryCache();
}

function pruneHistoryEntries(validSlugs) {
  const cache = loadHistoryCache();
  const filtered = cache.items.filter((item) => validSlugs.has(item.slug));
  if (filtered.length === cache.items.length) return;
  cache.items = filtered;
  saveHistoryCache();
}

function getHistoryIndex() {
  const cache = loadHistoryCache();
  const map = new Map();
  cache.items.forEach((item) => {
    map.set(item.slug, item);
  });
  return map;
}

app.use(cors());
app.use(express.json());

// Serve static frontend and hosted sites
app.use('/', express.static(PUBLIC_DIR));
app.use('/sites', express.static(SITES_DIR));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

// Helpers
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function isHtml(fileName) {
  return /\.html?$/i.test(fileName);
}

function isZip(fileName) {
  return /(\.(zip))$/i.test(fileName);
}

// Helpers for Axure-style zips
function listVisible(dir) {
  return fs.readdirSync(dir).filter((n) => !['__MACOSX', '.DS_Store'].includes(n));
}

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function isFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }

function hoistIfSingleRoot(baseDir) {
  // Remove __MACOSX (if any) first
  try { fs.rmSync(path.join(baseDir, '__MACOSX'), { recursive: true, force: true }); } catch {}
  try { fs.unlinkSync(path.join(baseDir, '.DS_Store')); } catch {}

  // Repeatedly hoist if there's exactly one visible directory and no files (ignoring hidden/mac metadata)
  while (true) {
    const entries = listVisible(baseDir);
    const dirs = entries.filter((e) => isDir(path.join(baseDir, e)));
    const files = entries.filter((e) => isFile(path.join(baseDir, e)));
    if (entries.length === 1 && dirs.length === 1 && files.length === 0) {
      const only = dirs[0];
      const from = path.join(baseDir, only);
      // move all children up
      listVisible(from).forEach((name) => {
        fs.renameSync(path.join(from, name), path.join(baseDir, name));
      });
      // remove the now-empty folder
      try { fs.rmSync(from, { recursive: true, force: true }); } catch {}
      // clean again and continue to check deeper nesting
      try { fs.rmSync(path.join(baseDir, '__MACOSX'), { recursive: true, force: true }); } catch {}
      try { fs.unlinkSync(path.join(baseDir, '.DS_Store')); } catch {}
      continue;
    }
    break;
  }
}

function createRedirectIndex(dir, target) {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta http-equiv="refresh" content="0; url=${target}"><script>location.replace('${target}');</script><title>Redirecting...</title></head><body>Redirecting to <a href="${target}">${target}</a> ...</body></html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

function createListingIndex(dir) {
  const entries = listVisible(dir);
  const htmls = entries.filter((e) => isFile(path.join(dir, e)) && /\.(html?)$/i.test(e));
  const links = htmls.map((f) => `<li><a href="./${f}">${f}</a></li>`).join('') || '<li>(无 HTML 文件)</li>';
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Site</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px}</style></head><body><h1>可用入口</h1><ul>${links}</ul></body></html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

function writeSiteMeta(siteDir, meta) {
  const metaPath = path.join(siteDir, META_FILE);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

function readSiteMeta(siteDir) {
  const metaPath = path.join(siteDir, META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  try {
    const raw = fs.readFileSync(metaPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to read meta for site:', siteDir, err);
    return null;
  }
}

function listSiteDirs() {
  return listVisible(SITES_DIR)
    .filter((name) => /^[\w-]+$/i.test(name))
    .filter((name) => isDir(path.join(SITES_DIR, name)));
}

function sanitizeRelativePath(relPath) {
  if (!relPath) return '';
  const withoutDrive = relPath.replace(/^[A-Za-z]:/, '');
  const parts = withoutDrive
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..');
  return parts.join('/');
}

function createSlug(length = 8) {
  const bytes = crypto.randomBytes(Math.max(4, Math.ceil((length * 3) / 4)));
  return bytes.toString('base64url').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, length);
}

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const seen = new Set();
  const ipv4 = [];
  Object.keys(interfaces).forEach((name) => {
    interfaces[name].forEach((net) => {
      if (net && net.family === 'IPv4' && !net.internal) {
        if (!seen.has(net.address)) {
          seen.add(net.address);
          ipv4.push({ address: net.address, interface: name });
        }
      }
    });
  });
  return ipv4;
}

app.post('/api/upload', upload.any(), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No file uploaded' });

    const uploadType = (req.body && req.body.uploadType ? String(req.body.uploadType).toLowerCase() : '');
    const hasNestedNames = files.some((file) => /[\\/]/.test(file.originalname || ''));
    const treatAsFolder = uploadType === 'folder' || files.length > 1 || hasNestedNames;
    console.log('uploadType', uploadType, 'files length', files.length);
    console.log('body keys', Object.keys(req.body || {}));
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'manifest')) {
      console.log('raw manifest value type', typeof req.body.manifest);
    }
    let manifest = [];
    if (req.body && req.body.manifest) {
      try {
        const rawManifest = Array.isArray(req.body.manifest) ? req.body.manifest[0] : req.body.manifest;
        manifest = JSON.parse(rawManifest);
      } catch (err) {
        console.warn('Failed to parse manifest', err);
      }
    }
    console.log('manifest length', manifest.length);
    if (uploadType === 'folder' && !manifest.length && !hasNestedNames) {
      console.warn('Folder upload requested but no manifest/relative paths provided.');
    }

    const slug = createSlug(8);
    const sitePath = path.join(SITES_DIR, slug);
    ensureDir(sitePath);
    const uploadedAt = new Date().toISOString();
    let fileType = 'unknown';
    let primaryHtml = null;
    let entryFile = 'index.html';
    let originalName = files[0].originalname ? path.basename(files[0].originalname) : slug;
    let storedName = null;
    let totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
    console.log('incoming files', files.slice(0, 3).map((f, idx) => ({
      original: f.originalname,
      manifest: manifest[idx]
    })));

    if (!treatAsFolder) {
      const { filename, path: tmpPath, originalname, size } = files[0];
      storedName = filename;
      totalSize = size ?? totalSize;
      if (isHtml(originalname)) {
        // Single HTML: Copy as index.html
        const target = path.join(sitePath, 'index.html');
        fs.copyFileSync(tmpPath, target);
        fileType = 'html';
        primaryHtml = 'index.html';
      } else if (isZip(originalname)) {
        // Unzip all
        const zip = new AdmZip(tmpPath);
        zip.extractAllTo(sitePath, true);

        // Normalize structure for Axure exports: first clean and then hoist single root folders like /test/
        hoistIfSingleRoot(sitePath);

        // Always prefer common Axure entry files by generating redirect index.html
        const extracted = fs.readdirSync(sitePath);
        const candidates = ['start.html', 'start_with_pages.html', 'start_c_1.html'];
        const chosen = candidates.find((f) => extracted.includes(f));
        if (chosen) {
          createRedirectIndex(sitePath, `./${chosen}`);
          primaryHtml = chosen;
          entryFile = chosen;
        } else if (extracted.includes('index.html')) {
          primaryHtml = 'index.html';
          entryFile = 'index.html';
        }
        fileType = 'zip';
      } else {
        return res.status(400).json({ error: 'Unsupported file type. 上传 .html、.zip 或完整文件夹' });
      }
    } else {
      // Folder upload: rebuild directory structure
      fileType = 'folder';
      let rootName = null;
      files.forEach((file, idx) => {
        const reference = manifest[idx] || file.originalname || file.filename;
        const clean = sanitizeRelativePath(reference);
        if (idx < 5) {
          console.log('folder copy', { reference, clean });
        }
        if (!clean) return;
        if (!rootName) rootName = clean.split('/')[0] || null;
        const destPath = path.join(sitePath, clean);
        ensureDir(path.dirname(destPath));
        fs.copyFileSync(file.path, destPath);
      });

      // Normalize structure
      hoistIfSingleRoot(sitePath);

      // Guess entry file
      const available = fs.existsSync(sitePath) ? fs.readdirSync(sitePath) : [];
      const candidates = ['index.html', 'start.html', 'start_with_pages.html', 'start_c_1.html'];
      const chosen = candidates.find((f) => available.includes(f));
      if (chosen && chosen !== 'index.html') {
        createRedirectIndex(sitePath, `./${chosen}`);
        primaryHtml = chosen;
        entryFile = chosen;
      } else if (chosen === 'index.html') {
        primaryHtml = 'index.html';
        entryFile = 'index.html';
      }

      if (rootName) {
        originalName = rootName;
      } else if (originalName.includes('/')) {
        originalName = originalName.split('/')[0];
      }
    }

    // Basic index.html fallback
    const finalIndex = path.join(sitePath, 'index.html');
    if (!fs.existsSync(finalIndex)) {
      // As a fallback, build a simple listing page for available HTML files
      createListingIndex(sitePath);
    }

    const metadata = {
      slug,
      url: `/sites/${slug}/`,
      originalName,
      storedName,
      fileType,
      entryFile,
      uploadedAt,
      size: totalSize,
      manifestSample: manifest.slice(0, 5)
    };
    if (primaryHtml) metadata.primaryHtml = primaryHtml;
    metadata.entryFile = entryFile;
    writeSiteMeta(sitePath, metadata);
    upsertHistoryEntry(metadata);

    // Return URL
    const url = `/sites/${slug}/`;
    res.json({ slug, url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    // Clean temp files
    if (req.files && req.files.length) {
      req.files.forEach((file) => {
        if (file && file.path && fs.existsSync(file.path)) {
          try { fs.unlinkSync(file.path); } catch (e) {}
        }
      });
    }
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/host-info', (req, res) => {
  try {
    const addresses = getLanAddresses();
    const hostHeader = req.get('host') || '';
    const [, portFromHeader] = hostHeader.match(/:(\d+)$/) || [];
    const port = Number(portFromHeader || PORT);
    const protocol = req.protocol || 'http';
    const hostname = os.hostname();
    const lanUrls = addresses.map((item) => ({
      interface: item.interface,
      address: item.address,
      url: `${protocol}://${item.address}:${port}/`
    }));
    res.json({
      hostname,
      port,
      protocol,
      localhostUrl: `${protocol}://localhost:${port}/`,
      lanUrls,
      hasLan: lanUrls.length > 0,
    });
  } catch (err) {
    console.error('host-info error', err);
    res.status(500).json({ error: 'Unable to determine host info' });
  }
});

app.get('/api/sites', (req, res) => {
  try {
    const slugs = listSiteDirs();
    const valid = new Set(slugs);
    pruneHistoryEntries(valid);
    const historyIndex = getHistoryIndex();
    const sites = slugs.map((slug) => {
      const siteDir = path.join(SITES_DIR, slug);
      const meta = readSiteMeta(siteDir) || {};
      const historyEntry = historyIndex.get(slug) || null;

      let uploadedAt = meta.uploadedAt || (historyEntry && historyEntry.uploadedAt) || null;
      if (!uploadedAt) {
        try {
          const stat = fs.statSync(siteDir);
          uploadedAt = stat.mtime.toISOString();
        } catch {
          uploadedAt = new Date().toISOString();
        }
      }

      const historySize = historyEntry && Number.isFinite(historyEntry.size) ? historyEntry.size : null;
      const entryFile = meta.entryFile || meta.primaryHtml || (historyEntry && (historyEntry.entryFile || historyEntry.primaryHtml)) || 'index.html';
      const record = {
        slug,
        url: meta.url || (historyEntry && historyEntry.url) || `/sites/${slug}/`,
        originalName: meta.originalName || (historyEntry && historyEntry.originalName) || slug,
        fileType: meta.fileType || (historyEntry && historyEntry.fileType) || 'unknown',
        uploadedAt,
        size: Number.isFinite(meta.size) ? meta.size : historySize,
        primaryHtml: meta.primaryHtml || (historyEntry && historyEntry.primaryHtml) || null,
        entryFile
      };

      const historyUploadedAt = historyEntry ? (historyEntry.uploadedAt || null) : null;
      const uploadedAtComparable = record.uploadedAt || null;
      const historySizeComparable = historySize;
      const recordSizeComparable = Number.isFinite(record.size) ? record.size : null;

      const needsHistoryUpdate = !historyEntry ||
        (historyEntry.originalName || null) !== record.originalName ||
        (historyEntry.fileType || null) !== record.fileType ||
        (historyEntry.entryFile || 'index.html') !== record.entryFile ||
        (historyEntry.primaryHtml || null) !== (record.primaryHtml || null) ||
        historyUploadedAt !== uploadedAtComparable ||
        historySizeComparable !== recordSizeComparable ||
        (historyEntry.url || `/sites/${slug}/`) !== record.url;

      if (needsHistoryUpdate) {
        upsertHistoryEntry(record);
      }

      return record;
    }).sort((a, b) => {
      return new Date(b.uploadedAt).valueOf() - new Date(a.uploadedAt).valueOf();
    });
    res.json({ items: sites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to list sites' });
  }
});

app.delete('/api/sites/:slug', (req, res) => {
  const { slug } = req.params;
  if (!/^[\w-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid slug' });
  }
  const target = path.join(SITES_DIR, slug);
  if (!fs.existsSync(target)) {
    return res.status(404).json({ error: 'Site not found' });
  }
  try {
    fs.rmSync(target, { recursive: true, force: true });
    removeHistoryEntry(slug);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete site' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
