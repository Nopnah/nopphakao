export type ParsedSourceType =
  | 'google-sheet'
  | 'google-sheet-published'
  | 'google-form'
  | 'web-app'
  | 'csv-url'
  | 'unknown';

export interface ParsedDataUrl {
  originalUrl: string;
  normalizedFetchUrl: string;
  sourceType: ParsedSourceType;
  spreadsheetId?: string;
  gid?: string;
  formId?: string;
  isValid: boolean;
  label: string;
}

/**
 * Converts various Google Sheets, Google Forms, CSV, or Apps Script Web App URLs
 * into a structured descriptor with a normalized fetch URL.
 */
export function parseDataSourceUrl(rawInput: string): ParsedDataUrl {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      originalUrl: '',
      normalizedFetchUrl: '',
      sourceType: 'unknown',
      isValid: false,
      label: 'ยังไม่ได้ระบุลิงก์',
    };
  }

  // Allow relative local sample paths
  if (trimmed.startsWith('/')) {
    return {
      originalUrl: trimmed,
      normalizedFetchUrl: trimmed,
      sourceType: 'csv-url',
      isValid: true,
      label: 'ไฟล์ข้อมูลภายในแอป',
    };
  }

  let urlObj: URL;
  try {
    urlObj = new URL(trimmed);
  } catch {
    return {
      originalUrl: trimmed,
      normalizedFetchUrl: '',
      sourceType: 'unknown',
      isValid: false,
      label: 'รูปแบบ URL ไม่ถูกต้อง',
    };
  }

  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    return {
      originalUrl: trimmed,
      normalizedFetchUrl: '',
      sourceType: 'unknown',
      isValid: false,
      label: 'รองรับเฉพาะ http:// หรือ https://',
    };
  }

  const href = urlObj.href;

  // 1. Google Apps Script Web App URL
  if (urlObj.hostname === 'script.google.com' && urlObj.pathname.includes('/macros/')) {
    return {
      originalUrl: trimmed,
      normalizedFetchUrl: href,
      sourceType: 'web-app',
      isValid: true,
      label: 'Google Apps Script Web App',
    };
  }

  // 2. Google Forms URL
  const formMatch = urlObj.pathname.match(/\/forms\/d\/(?!e\/)([a-zA-Z0-9_-]+)/);
  if (urlObj.hostname.includes('docs.google.com') && formMatch) {
    return {
      originalUrl: trimmed,
      normalizedFetchUrl: href,
      sourceType: 'google-form',
      formId: formMatch[1],
      isValid: true,
      label: 'Google Forms (ต้องเข้าสู่ระบบ Google เพื่อดึงคำตอบ)',
    };
  }

  // 3. Google Sheets Published to Web (/spreadsheets/d/e/2PACX-.../pubhtml or /pub)
  const pubMatch = urlObj.pathname.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (urlObj.hostname.includes('docs.google.com') && pubMatch) {
    const gid = urlObj.searchParams.get('gid') || extractGidFromHash(urlObj.hash);
    const csvUrl = new URL(`https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pub`);
    csvUrl.searchParams.set('output', 'csv');
    if (gid) csvUrl.searchParams.set('gid', gid);
    return {
      originalUrl: trimmed,
      normalizedFetchUrl: csvUrl.toString(),
      sourceType: 'google-sheet-published',
      gid: gid || undefined,
      isValid: true,
      label: 'Google Sheets (เผยแพร่บนเว็บ · CSV)',
    };
  }

  // 4. Standard Google Sheets URL (/spreadsheets/d/{id}/...)
  const sheetMatch = urlObj.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (urlObj.hostname.includes('docs.google.com') && sheetMatch) {
    const spreadsheetId = sheetMatch[1];
    const gid = urlObj.searchParams.get('gid') || extractGidFromHash(urlObj.hash) || '0';

    // Already an export/gviz CSV URL
    if (
      urlObj.pathname.endsWith('/export') &&
      urlObj.searchParams.get('format') === 'csv'
    ) {
      return {
        originalUrl: trimmed,
        normalizedFetchUrl: href,
        sourceType: 'google-sheet',
        spreadsheetId,
        gid,
        isValid: true,
        label: 'Google Sheets CSV Export',
      };
    }

    if (
      urlObj.pathname.includes('/gviz/tq') &&
      urlObj.searchParams.get('tqx')?.includes('csv')
    ) {
      return {
        originalUrl: trimmed,
        normalizedFetchUrl: href,
        sourceType: 'google-sheet',
        spreadsheetId,
        gid,
        isValid: true,
        label: 'Google Sheets GViz CSV',
      };
    }

    const csvUrl = new URL(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export`);
    csvUrl.searchParams.set('format', 'csv');
    csvUrl.searchParams.set('gid', gid);

    return {
      originalUrl: trimmed,
      normalizedFetchUrl: csvUrl.toString(),
      sourceType: 'google-sheet',
      spreadsheetId,
      gid,
      isValid: true,
      label: 'Google Sheets (แปลงเป็นลิงก์ CSV อัตโนมัติ)',
    };
  }

  // 5. Generic direct CSV or JSON endpoint
  return {
    originalUrl: trimmed,
    normalizedFetchUrl: href,
    sourceType: 'csv-url',
    isValid: true,
    label: 'ลิงก์ข้อมูล CSV / JSON โดยตรง',
  };
}

function extractGidFromHash(hash: string): string | null {
  if (!hash) return null;
  const match = hash.match(/gid=(\d+)/);
  return match ? match[1] : null;
}
