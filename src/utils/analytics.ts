export type ColumnKind =
  | 'timestamp'
  | 'numeric'
  | 'multi-select'
  | 'categorical'
  | 'identifier'
  | 'text'
  | 'empty';

export interface ColumnProfile {
  name: string;
  kind: ColumnKind;
  nonEmptyCount: number;
  uniqueCount: number;
  numericPriority: number;
  chartPriority: number;
}

export interface DatasetProfile {
  activeHeaders: string[];
  columns: ColumnProfile[];
  timestampColumn: string | null;
  numericColumns: string[];
  categoricalColumns: string[];
  multiSelectColumns: string[];
  previewColumns: string[];
}

export interface FilterState {
  searchQuery: string;
  dateFrom: string;
  dateTo: string;
  columnFilters: Record<string, string>;
}

export interface NumericSummary {
  column: string;
  count: number;
  sum: number;
  average: number;
  min: number;
  max: number;
}

export interface DistributionItem {
  name: string;
  value: number;
  percentage: number;
}

export interface TimeSeriesPoint {
  key: string;
  label: string;
  count: number;
  cumulative: number;
}

const THAI_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/**
 * Parses timestamps from Google Forms/Sheets (DD/MM/YYYY, HH:mm:ss, ISO, YYYY-MM-DD)
 * including Buddhist Era years (> 2400 -> AD).
 */
export function parseFlexibleTimestamp(raw: string): Date | null {
  const val = raw.trim();
  if (!val) return null;

  // 1. DD/MM/YYYY(,)? HH:mm(:ss)? or DD-MM-YYYY
  const dmyMatch = val.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (dmyMatch) {
    const p1 = Number(dmyMatch[1]);
    const p2 = Number(dmyMatch[2]);
    let year = Number(dmyMatch[3]);
    if (year >= 2400) year -= 543;

    // Interpret as DD/MM/YYYY unless p2 > 12 (then MM/DD/YYYY)
    let day = p1;
    let month = p2;
    if (p2 > 12 && p1 <= 12) {
      month = p1;
      day = p2;
    }

    const hour = dmyMatch[4] ? Number(dmyMatch[4]) : 0;
    const min = dmyMatch[5] ? Number(dmyMatch[5]) : 0;
    const sec = dmyMatch[6] ? Number(dmyMatch[6]) : 0;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const dt = new Date(year, month - 1, day, hour, min, sec);
      if (!Number.isNaN(dt.getTime())) return dt;
    }
  }

  // 2. ISO or YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    const dt = new Date(val);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  return null;
}

export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseNumericValue(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '');
  if (!cleaned) return null;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function isLikelyIdentifierHeader(header: string): boolean {
  return /(เลขบัตร|ประชาชน|เบอร์โทร|โทร|phone|tel|easting|northing|พิกัด|บ้านเลขที่|รหัส|id$|email|อีเมล|ลำดับ)/i.test(
    header
  );
}

function isLikelyTimestampHeader(header: string): boolean {
  return /(ประทับเวลา|timestamp|created|submitted|วันที่|เวลา)/i.test(header);
}

export function profileDataset(
  headers: string[],
  rows: Record<string, string>[]
): DatasetProfile {
  const columns: ColumnProfile[] = [];

  for (const name of headers) {
    const values = rows.map((r) => (r[name] ?? '').trim()).filter((v) => v !== '');
    const nonEmptyCount = values.length;

    if (nonEmptyCount === 0) {
      columns.push({
        name,
        kind: 'empty',
        nonEmptyCount: 0,
        uniqueCount: 0,
        numericPriority: 0,
        chartPriority: 0,
      });
      continue;
    }

    const uniqueValues = new Set(values);
    const uniqueCount = uniqueValues.size;

    // 1. Timestamp detection
    const tsMatches = values.filter((v) => parseFlexibleTimestamp(v) !== null).length;
    if (
      tsMatches >= Math.max(1, Math.ceil(nonEmptyCount * 0.6)) &&
      (isLikelyTimestampHeader(name) || tsMatches === nonEmptyCount)
    ) {
      columns.push({
        name,
        kind: 'timestamp',
        nonEmptyCount,
        uniqueCount,
        numericPriority: 0,
        chartPriority: 0,
      });
      continue;
    }

    // 2. Identifier detection (phone numbers, Thai IDs, UTM coordinates, sequence index)
    const looksLikeIdValues = values.every(
      (v) => (/^0\d{8,10}$/.test(v) || /^\d{12,13}$/.test(v))
    );
    if (isLikelyIdentifierHeader(name) || looksLikeIdValues) {
      columns.push({
        name,
        kind: 'identifier',
        nonEmptyCount,
        uniqueCount,
        numericPriority: 0,
        chartPriority: 0,
      });
      continue;
    }

    // 3. Numeric detection
    const numericMatches = values.filter((v) => parseNumericValue(v) !== null).length;
    if (numericMatches >= Math.max(1, Math.ceil(nonEmptyCount * 0.75))) {
      let priority = 50;
      if (/(พื้นที่|ไร่|ผลผลิต|ราคา|ต้นทุน|รายได้|จำนวน|คะแนน|score|amount|total|area)/i.test(name)) {
        priority += 40;
      }
      if (/(อายุ|age)/i.test(name)) {
        priority += 25;
      }
      if (uniqueCount > 1) priority += 10;

      columns.push({
        name,
        kind: 'numeric',
        nonEmptyCount,
        uniqueCount,
        numericPriority: priority,
        chartPriority: 0,
      });
      continue;
    }

    // 4. Multi-select detection (e.g. "กล้วย, ฝรั่ง, มะพร้าว, มะม่วง")
    const multiCommaMatches = values.filter((v) => {
      const parts = v.split(',').map((p) => p.trim()).filter(Boolean);
      return parts.length >= 2 && parts.every((p) => p.length <= 60);
    }).length;

    if (
      (multiCommaMatches >= Math.max(1, Math.ceil(nonEmptyCount * 0.25)) ||
        /เลือกได้มากกว่า\s*1/i.test(name)) &&
      !/(ที่ตั้ง|ที่อยู่|address)/i.test(name)
    ) {
      let chartPriority = 80;
      if (/(ชนิดพืชใหม่|พืชใหม่|ชนิดพืช)/i.test(name)) {
        chartPriority += 40;
      } else if (/(ที่มาความรู้|สาเหตุ|ปัญหา|ช่องทาง)/i.test(name)) {
        chartPriority += 15;
      }
      columns.push({
        name,
        kind: 'multi-select',
        nonEmptyCount,
        uniqueCount,
        numericPriority: 0,
        chartPriority,
      });
      continue;
    }

    // 5. Categorical detection
    const maxCatUnique = Math.min(24, Math.max(8, Math.floor(nonEmptyCount * 0.85)));
    if (uniqueCount <= maxCatUnique && values.every((v) => v.length <= 120)) {
      let chartPriority = 50;
      if (uniqueCount >= 3 && uniqueCount <= 10) chartPriority += 35;
      else if (uniqueCount === 2) chartPriority += 20;
      else if (uniqueCount === 1) chartPriority -= 20;

      if (/(ตำบล|อำเภอ|จังหวัด|ชนิดพืช|ระดับ|ความเหมาะสม|ตลาด|ต้นทุน|สถานะ|หมวดหมู่|ประเภท)/i.test(name)) {
        chartPriority += 30;
      } else if (/(เพศ)/i.test(name)) {
        chartPriority += 10;
      }

      columns.push({
        name,
        kind: 'categorical',
        nonEmptyCount,
        uniqueCount,
        numericPriority: 0,
        chartPriority,
      });
      continue;
    }

    columns.push({
      name,
      kind: 'text',
      nonEmptyCount,
      uniqueCount,
      numericPriority: 0,
      chartPriority: 0,
    });
  }

  const activeHeaders = columns.filter((c) => c.kind !== 'empty').map((c) => c.name);
  const timestampColumn = columns.find((c) => c.kind === 'timestamp')?.name ?? null;
  const numericColumns = columns
    .filter((c) => c.kind === 'numeric')
    .sort((a, b) => b.numericPriority - a.numericPriority)
    .map((c) => c.name);

  const categoricalColumns = columns
    .filter((c) => c.kind === 'categorical')
    .sort((a, b) => b.chartPriority - a.chartPriority)
    .map((c) => c.name);

  const multiSelectColumns = columns
    .filter((c) => c.kind === 'multi-select')
    .sort((a, b) => b.chartPriority - a.chartPriority)
    .map((c) => c.name);

  // Pick crisp preview columns for the latest responses table
  const preferredOrder: string[] = [];
  if (timestampColumn) preferredOrder.push(timestampColumn);

  const nameCol = activeHeaders.find((h) => /(ชื่อ\s*-\s*นามสกุล|ชื่อ-สกุล|ชื่อ|name)/i.test(h));
  if (nameCol && !preferredOrder.includes(nameCol)) preferredOrder.push(nameCol);

  for (const col of [...categoricalColumns, ...numericColumns, ...multiSelectColumns]) {
    if (preferredOrder.length >= 7) break;
    if (!preferredOrder.includes(col)) preferredOrder.push(col);
  }
  for (const col of activeHeaders) {
    if (preferredOrder.length >= 7) break;
    if (!preferredOrder.includes(col)) preferredOrder.push(col);
  }

  return {
    activeHeaders,
    columns,
    timestampColumn,
    numericColumns,
    categoricalColumns,
    multiSelectColumns,
    previewColumns: preferredOrder,
  };
}

export function filterDatasetRows(
  rows: Record<string, string>[],
  profile: DatasetProfile,
  filters: FilterState
): Record<string, string>[] {
  const q = filters.searchQuery.trim().toLowerCase();
  const activeColFilters = Object.entries(filters.columnFilters).filter(
    ([, val]) => val && val !== '__ALL__'
  );

  return rows.filter((row) => {
    // 1. Search query
    if (q) {
      const matched = profile.activeHeaders.some((h) =>
        (row[h] ?? '').toLowerCase().includes(q)
      );
      if (!matched) return false;
    }

    // 2. Date range filter
    if ((filters.dateFrom || filters.dateTo) && profile.timestampColumn) {
      const ts = parseFlexibleTimestamp(row[profile.timestampColumn] ?? '');
      if (!ts) return false;
      const dateKey = formatLocalDateKey(ts);
      if (filters.dateFrom && dateKey < filters.dateFrom) return false;
      if (filters.dateTo && dateKey > filters.dateTo) return false;
    }

    // 3. Column category / multi-select filters
    for (const [col, targetVal] of activeColFilters) {
      const cell = (row[col] ?? '').trim();
      const colKind = profile.columns.find((c) => c.name === col)?.kind;
      if (colKind === 'multi-select') {
        const items = cell.split(',').map((s) => s.trim()).filter(Boolean);
        if (!items.includes(targetVal)) return false;
      } else {
        if (cell !== targetVal) return false;
      }
    }

    return true;
  });
}

export function computeNumericSummary(
  rows: Record<string, string>[],
  column: string | null
): NumericSummary | null {
  if (!column) return null;
  const nums: number[] = [];
  for (const row of rows) {
    const val = parseNumericValue(row[column] ?? '');
    if (val !== null) nums.push(val);
  }
  if (nums.length === 0) return null;
  const sum = nums.reduce((acc, n) => acc + n, 0);
  return {
    column,
    count: nums.length,
    sum,
    average: sum / nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
  };
}

export function countTodayEntries(
  rows: Record<string, string>[],
  timestampColumn: string | null,
  referenceDate: Date = new Date()
): { todayCount: number; latestDateCount: number; latestDateLabel: string | null } {
  if (!timestampColumn || rows.length === 0) {
    return { todayCount: 0, latestDateCount: 0, latestDateLabel: null };
  }

  const todayKey = formatLocalDateKey(referenceDate);
  const dateCounts = new Map<string, number>();

  for (const row of rows) {
    const dt = parseFlexibleTimestamp(row[timestampColumn] ?? '');
    if (!dt) continue;
    const key = formatLocalDateKey(dt);
    dateCounts.set(key, (dateCounts.get(key) ?? 0) + 1);
  }

  const sortedDates = Array.from(dateCounts.keys()).sort();
  const latestKey = sortedDates[sortedDates.length - 1] ?? null;
  let latestDateLabel: string | null = null;
  if (latestKey) {
    const [y, m, d] = latestKey.split('-').map(Number);
    latestDateLabel = `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
  }

  return {
    todayCount: dateCounts.get(todayKey) ?? 0,
    latestDateCount: latestKey ? dateCounts.get(latestKey) ?? 0 : 0,
    latestDateLabel,
  };
}

export function buildDistribution(
  rows: Record<string, string>[],
  column: string,
  isMultiSelect: boolean,
  maxItems = 10
): DistributionItem[] {
  const counts = new Map<string, number>();
  let totalWeight = 0;

  for (const row of rows) {
    const raw = (row[column] ?? '').trim();
    if (!raw) continue;

    if (isMultiSelect) {
      const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
      for (const item of items) {
        counts.set(item, (counts.get(item) ?? 0) + 1);
        totalWeight++;
      }
    } else {
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
      totalWeight++;
    }
  }

  if (totalWeight === 0) return [];

  const denominator = isMultiSelect ? Math.max(1, rows.length) : totalWeight;
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems);

  return sorted.map(([name, value]) => ({
    name,
    value,
    percentage: Math.round((value / denominator) * 1000) / 10,
  }));
}

export function buildTimeSeries(
  rows: Record<string, string>[],
  timestampColumn: string | null
): { granularity: 'hour' | 'day'; points: TimeSeriesPoint[] } {
  if (!timestampColumn) {
    return { granularity: 'day', points: [] };
  }

  const parsedDates: Date[] = [];
  for (const row of rows) {
    const dt = parseFlexibleTimestamp(row[timestampColumn] ?? '');
    if (dt) parsedDates.push(dt);
  }

  if (parsedDates.length === 0) {
    return { granularity: 'day', points: [] };
  }

  const uniqueDays = new Set(parsedDates.map((d) => formatLocalDateKey(d)));
  const granularity: 'hour' | 'day' = uniqueDays.size <= 2 ? 'hour' : 'day';

  const buckets = new Map<string, { label: string; count: number }>();

  for (const dt of parsedDates) {
    if (granularity === 'hour') {
      const dayKey = formatLocalDateKey(dt);
      const hourStr = String(dt.getHours()).padStart(2, '0');
      const key = `${dayKey} ${hourStr}:00`;
      const label =
        uniqueDays.size === 1
          ? `${hourStr}:00`
          : `${dt.getDate()} ${THAI_MONTHS[dt.getMonth()]} ${hourStr}:00`;
      const prev = buckets.get(key);
      buckets.set(key, { label, count: (prev?.count ?? 0) + 1 });
    } else {
      const key = formatLocalDateKey(dt);
      const label = `${dt.getDate()} ${THAI_MONTHS[dt.getMonth()]}`;
      const prev = buckets.get(key);
      buckets.set(key, { label, count: (prev?.count ?? 0) + 1 });
    }
  }

  const sortedKeys = Array.from(buckets.keys()).sort();
  let cumulative = 0;
  const points: TimeSeriesPoint[] = sortedKeys.map((key) => {
    const item = buckets.get(key)!;
    cumulative += item.count;
    return {
      key,
      label: item.label,
      count: item.count,
      cumulative,
    };
  });

  return { granularity, points };
}

export function getRowFingerprint(
  row: Record<string, string>,
  headers: string[]
): string {
  return headers.slice(0, 8).map((h) => row[h] ?? '').join('\u0001');
}

export function countNewIncomingRows(
  prevRows: Record<string, string>[],
  nextRows: Record<string, string>[],
  headers: string[]
): number {
  if (prevRows.length === 0) return 0;
  const prevCounts = new Map<string, number>();
  for (const r of prevRows) {
    const fp = getRowFingerprint(r, headers);
    prevCounts.set(fp, (prevCounts.get(fp) ?? 0) + 1);
  }
  let added = 0;
  for (const r of nextRows) {
    const fp = getRowFingerprint(r, headers);
    const remaining = prevCounts.get(fp) ?? 0;
    if (remaining > 0) {
      prevCounts.set(fp, remaining - 1);
    } else {
      added++;
    }
  }
  return added;
}

export function formatShortHeader(header: string): string {
  return header
    .replace(/\s*\(เลือกได้มากกว่า\s*1\s*ชนิด\s*\)/g, '')
    .replace(/\s*\(เลือกตอบอย่างใดอย่างหนึ่ง\)/g, '')
    .trim();
}
