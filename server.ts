import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower === '[::1]' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }

  // Block private IPv4 ranges
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }
  return false;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.get('/api/fetch-source', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'MISSING_URL', message: 'กรุณาระบุ URL ของแหล่งข้อมูล' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: 'INVALID_URL', message: 'รูปแบบ URL ไม่ถูกต้อง' });
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      res.status(400).json({ error: 'INVALID_PROTOCOL', message: 'รองรับเฉพาะ HTTP/HTTPS เท่านั้น' });
      return;
    }

    if (isBlockedHostname(parsed.hostname)) {
      res.status(403).json({ error: 'BLOCKED_HOST', message: 'ไม่อนุญาตให้เชื่อมต่อโฮสต์ภายในเครือข่าย' });
      return;
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept: 'text/csv, application/json, text/plain;q=0.9, */*;q=0.8',
          'User-Agent': 'SheetPulse-Dashboard/1.0',
        },
        signal: AbortSignal.timeout(12000),
      });

      const contentType = upstream.headers.get('content-type') || '';
      const bodyText = await upstream.text();

      if (!upstream.ok) {
        res.status(upstream.status).json({
          error: 'UPSTREAM_ERROR',
          message: `ไม่สามารถดึงข้อมูลจากต้นทางได้ (HTTP ${upstream.status})`,
        });
        return;
      }

      // Detect Google Sign-In / HTML error page when Sheet is private
      const trimmed = bodyText.trimStart().toLowerCase();
      if (
        contentType.includes('text/html') &&
        (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html'))
      ) {
        res.status(403).json({
          error: 'PRIVATE_OR_HTML',
          message:
            'ลิงก์นี้ตอบกลับเป็นหน้าเว็บ HTML (อาจตั้งค่าสิทธิ์ชีตเป็นส่วนตัว) กรุณาตั้งค่าแชร์เป็น "ทุกคนที่มีลิงก์" หรือกดเข้าสู่ระบบ Google เพื่อดึงข้อมูลโดยตรง',
        });
        return;
      }

      res.setHeader('Content-Type', contentType || 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(bodyText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      res.status(502).json({
        error: 'FETCH_FAILED',
        message: `ดึงข้อมูลไม่สำเร็จ: ${msg}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
