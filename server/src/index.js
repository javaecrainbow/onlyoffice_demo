const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const STORAGE_DIR = path.resolve(
  process.env.STORAGE_DIR || path.join(__dirname, '../storage')
);

const normalizeBaseUrl = (value, fallback = '') => {
  const source = value || fallback;
  if (!source) {
    return '';
  }
  return source.replace(/\/$/, '');
};

const DEFAULT_APP_BASE_URL = `http://localhost:${PORT}`;
const APP_BASE_URL = normalizeBaseUrl(process.env.APP_BASE_URL, DEFAULT_APP_BASE_URL);
const ONLYOFFICE_APP_BASE_URL = normalizeBaseUrl(
  process.env.ONLYOFFICE_APP_BASE_URL,
  APP_BASE_URL
);
const ONLYOFFICE_BASE_URL = normalizeBaseUrl(
  process.env.ONLYOFFICE_BASE_URL,
  'http://localhost:8080'
);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const ONLYOFFICE_JWT_SECRET = process.env.ONLYOFFICE_JWT_SECRET || '';
const ONLYOFFICE_JWT_ALG = process.env.ONLYOFFICE_JWT_ALG || 'HS256';
const ONLYOFFICE_JWT_HEADER = (process.env.ONLYOFFICE_JWT_HEADER || 'Authorization').toLowerCase();

fs.mkdirSync(STORAGE_DIR, { recursive: true });

const SUPPORTED_EXTENSIONS = new Map([
  ['.docx', 'word'],
  ['.doc', 'word'],
  ['.odt', 'word'],
  ['.rtf', 'word'],
  ['.docm', 'word'],
  ['.xls', 'cell'],
  ['.xlsx', 'cell'],
  ['.xlsm', 'cell'],
  ['.ods', 'cell'],
  ['.pdf', 'word'],
]);

const corsOptions = {
  origin: CORS_ORIGINS,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/files', express.static(STORAGE_DIR));

const decodeOriginalName = (originalName) => {
  if (!originalName) {
    return '';
  }

  try {
    const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? originalName : decoded;
  } catch (_error) {
    return originalName;
  }
};

const sanitizeFileName = (originalName) => {
  const decoded = decodeOriginalName(originalName);
  const safe = decoded.replace(/[\\/]/g, '_');
  return safe.trim() || `document-${Date.now()}.docx`;
};

const ensureUniqueFileName = async (fileName) => {
  const baseName = path.parse(fileName).name;
  const ext = path.parse(fileName).ext;
  let candidate = fileName;
  let counter = 1;

  while (true) {
    try {
      await fsPromises.access(path.join(STORAGE_DIR, candidate));
      candidate = `${baseName} (${counter})${ext}`;
      counter += 1;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return candidate;
      }
      throw err;
    }
  }
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, STORAGE_DIR);
  },
  filename: async (req, file, cb) => {
    try {
      const sanitized = sanitizeFileName(file.originalname);
      const unique = await ensureUniqueFileName(sanitized);
      cb(null, unique);
    } catch (error) {
      cb(error, '');
    }
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      cb(new Error('不支持的文件类型'));
      return;
    }
    cb(null, true);
  },
});

const resolveFilePath = (fileId) => {
  const safeId = path.basename(fileId);
  return path.join(STORAGE_DIR, safeId);
};

const buildFileEntry = async (fileName) => {
  const filePath = resolveFilePath(fileName);
  const stats = await fsPromises.stat(filePath);
  if (!stats.isFile()) {
    return null;
  }

  const ext = path.extname(fileName).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return null;
  }

  return {
    id: fileName,
    name: fileName,
    size: stats.size,
    lastModified: stats.mtimeMs,
    url: `${APP_BASE_URL}/files/${encodeURIComponent(fileName)}`,
  };
};

const generateDocumentKey = (fileName, mtimeMs) => {
  return crypto.createHash('md5').update(`${fileName}-${mtimeMs}`).digest('hex');
};

const signOnlyOfficeConfig = (config) => {
  if (!ONLYOFFICE_JWT_SECRET) {
    return config;
  }

  const token = jwt.sign(config, ONLYOFFICE_JWT_SECRET, {
    algorithm: ONLYOFFICE_JWT_ALG,
  });

  return {
    ...config,
    token,
  };
};

const extractJwtFromHeaders = (req) => {
  const headerValue = req.headers[ONLYOFFICE_JWT_HEADER];
  if (!headerValue) {
    return null;
  }

  let tokenCandidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  const bearerMatch = /^Bearer\s+(.+)$/i.exec(tokenCandidate);
  if (bearerMatch) {
    tokenCandidate = bearerMatch[1];
  }

  return tokenCandidate || null;
};

const resolveCallbackPayload = (req) => {
  if (!ONLYOFFICE_JWT_SECRET) {
    return req.body;
  }

  const headerToken = extractJwtFromHeaders(req);
  const bodyToken = req.body?.token;
  const candidates = [bodyToken, headerToken].filter(Boolean);

  if (!candidates.length) {
    const err = new Error('OnlyOffice 回调缺少 JWT token');
    err.statusCode = 403;
    throw err;
  }

  let lastError;
  for (const token of candidates) {
    try {
      // Prefer the body token because OnlyOffice signs the full payload there.
      return jwt.verify(token, ONLYOFFICE_JWT_SECRET, {
        algorithms: [ONLYOFFICE_JWT_ALG],
      });
    } catch (verifyError) {
      lastError = verifyError;
    }
  }

  const err = new Error('OnlyOffice JWT 校验失败');
  err.statusCode = 403;
  err.cause = lastError;
  throw err;
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/files', async (_req, res, next) => {
  try {
    const entries = await fsPromises.readdir(STORAGE_DIR);
    const files = await Promise.all(entries.map((name) => buildFileEntry(name)));
    res.json(files.filter(Boolean));
  } catch (error) {
    next(error);
  }
});

app.post('/api/files', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: '未找到上传文件' });
      return;
    }

    const entry = await buildFileEntry(req.file.filename);
    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/files/:fileId', async (req, res, next) => {
  try {
    const fileId = req.params.fileId;
    const filePath = resolveFilePath(fileId);
    const ext = path.extname(fileId).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      res.status(400).json({ message: '不支持的文件类型' });
      return;
    }

    await fsPromises.unlink(filePath);
    res.status(204).send();
  } catch (error) {
    if (error?.code === 'ENOENT') {
      res.status(404).json({ message: '文件不存在' });
      return;
    }
    next(error);
  }
});

app.get('/api/editor/:fileId', async (req, res, next) => {
  try {
    const fileId = req.params.fileId;
    const filePath = resolveFilePath(fileId);

    const stats = await fsPromises.stat(filePath);
    if (!stats.isFile()) {
      res.status(404).json({ message: '文件不存在' });
      return;
    }

    const extWithDot = path.extname(fileId).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extWithDot)) {
      res.status(400).json({ message: '不支持的文件类型' });
      return;
    }

    const ext = extWithDot.slice(1);
    const documentType = SUPPORTED_EXTENSIONS.get(extWithDot) || 'word';
    const documentKey = generateDocumentKey(fileId, stats.mtimeMs);

    const configCore = {
      document: {
        fileType: ext,
        key: documentKey,
        title: fileId,
        url: `${ONLYOFFICE_APP_BASE_URL}/files/${encodeURIComponent(fileId)}`,
        permissions: {
          edit: true,
          download: true,
          print: true,
        },
      },
      documentType,
      editorConfig: {
        mode: 'edit',
        lang: 'zh-CN',
        callbackUrl: `${ONLYOFFICE_APP_BASE_URL}/api/onlyoffice/callback/${encodeURIComponent(fileId)}`,
        customization: {
          autosave: true,
          spellcheck: false,
        },
      },
      height: '100%',
      width: '100%',
      type: 'desktop',
    };

    res.json({
      config: signOnlyOfficeConfig(configCore),
      onlyofficeBaseUrl: ONLYOFFICE_BASE_URL,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/onlyoffice/callback/:fileId', async (req, res, next) => {
  try {
    const rawBody = req.body;
    const payload = resolveCallbackPayload(req);
    const { status, url } = payload || {};
    const fileId = req.params.fileId;
    console.log('[OnlyOffice callback raw]', JSON.stringify(rawBody));
    console.log(
      '[OnlyOffice callback]',
      JSON.stringify({
        fileId,
        status,
        hasUrl: Boolean(url),
      })
    );

    if (status === 2 || status === 6) {
      if (!url) {
        res.status(400).json({ error: 1, message: '缺少回调下载地址' });
        return;
      }

      const filePath = resolveFilePath(fileId);
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      await fsPromises.writeFile(filePath, response.data);
    }

    res.json({ error: 0 });
  } catch (error) {
    console.error('[OnlyOffice callback error]', error);
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({ message: err.message || '服务器错误' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT}`);
});
