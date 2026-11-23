export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * RFC-4180 compliant CSV parser that supports UTF-8 BOM, CRLF/LF,
 * quoted multiline headers/cells, and escaped double quotes.
 */
export function parseCsv(input: string): ParsedTable {
  const text = input.replace(/^\uFEFF/, '');
  if (!text.trim()) {
    return { headers: [], rows: [] };
  }

  const matrix: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField);
      matrix.push(currentRow);
      currentRow = [];
      currentField = '';
    } else if (ch === '\n') {
      currentRow.push(currentField);
      matrix.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  // Flush final field/row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    matrix.push(currentRow);
  }

  // Drop trailing completely empty rows
  const nonEmptyRows = matrix.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = nonEmptyRows[0];
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, idx) => {
    const cleaned = h.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const base = cleaned || `คอลัมน์ ${idx + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < nonEmptyRows.length; r++) {
    const rawRow = nonEmptyRows[r];
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (rawRow[c] ?? '').trim();
    }
    rows.push(obj);
  }

  return { headers, rows };
}

/**
 * Converts JSON array payloads (e.g. from Google Apps Script Web App) into ParsedTable.
 */
export function normalizeJsonPayload(payload: unknown): ParsedTable {
  let records: unknown[] = [];

  if (Array.isArray(payload)) {
    records = payload;
  } else if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) records = obj.data;
    else if (Array.isArray(obj.rows)) records = obj.rows;
    else if (Array.isArray(obj.values)) {
      // 2D array style (like Sheets API values)
      return normalizeValuesMatrix(obj.values as unknown[][]);
    }
  }

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  // Handle array of arrays
  if (Array.isArray(records[0])) {
    return normalizeValuesMatrix(records as unknown[][]);
  }

  const headerSet = new Set<string>();
  for (const item of records) {
    if (item && typeof item === 'object') {
      for (const key of Object.keys(item as Record<string, unknown>)) {
        headerSet.add(key.trim());
      }
    }
  }

  const headers = Array.from(headerSet);
  const rows = records
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => {
      const row: Record<string, string> = {};
      for (const h of headers) {
        const val = item[h];
        row[h] = val === null || val === undefined ? '' : String(val).trim();
      }
      return row;
    });

  return { headers, rows };
}

export function normalizeValuesMatrix(values: unknown[][]): ParsedTable {
  if (!Array.isArray(values) || values.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = values[0].map((v) => String(v ?? ''));
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, idx) => {
    const cleaned = h.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const base = cleaned || `คอลัมน์ ${idx + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < values.length; r++) {
    const rawRow = values[r] || [];
    if (!rawRow.some((cell) => String(cell ?? '').trim() !== '')) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = String(rawRow[c] ?? '').trim();
    }
    rows.push(obj);
  }

  return { headers, rows };
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsvString(headers: string[], rows: Record<string, string>[]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvCell(row[h] ?? '')).join(',')
  );
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}
