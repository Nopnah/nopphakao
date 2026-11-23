import {
  parseCsv,
  normalizeJsonPayload,
  normalizeValuesMatrix,
  type ParsedTable,
} from '../utils/csv';
import { parseDataSourceUrl } from '../utils/sheetsUrl';

export const SAMPLE_DATASET_PATH =
  '/assets/aistudio/________________________Zoning2570______________a7556eb5';

export interface SheetTabInfo {
  sheetId: number;
  title: string;
}

export interface FetchResult {
  table: ParsedTable;
  sourceTitle: string;
  availableTabs?: SheetTabInfo[];
  activeTabTitle?: string;
}

export async function fetchBuiltInSample(): Promise<FetchResult> {
  const res = await fetch(SAMPLE_DATASET_PATH, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('ไม่สามารถโหลดไฟล์ข้อมูลตัวอย่าง Zoning 2570 ได้');
  }
  const text = await res.text();
  const table = parseCsv(text);
  return {
    table,
    sourceTitle: 'แบบสำรวจ Zoning 2570 (ชุดข้อมูลตัวอย่าง)',
  };
}

export async function fetchFromPublicUrl(rawUrl: string): Promise<FetchResult> {
  const parsed = parseDataSourceUrl(rawUrl);
  if (!parsed.isValid) {
    throw new Error(parsed.label);
  }

  if (parsed.sourceType === 'google-form') {
    throw new Error(
      'ลิงก์ Google Forms ต้องเข้าสู่ระบบด้วย Google ก่อนเพื่อดึงคำตอบผ่าน Forms API'
    );
  }

  // Local relative path
  if (parsed.normalizedFetchUrl.startsWith('/')) {
    const res = await fetch(parsed.normalizedFetchUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`โหลดไฟล์ไม่สำเร็จ (HTTP ${res.status})`);
    const text = await res.text();
    return {
      table: parseTextPayload(text, res.headers.get('content-type') || ''),
      sourceTitle: 'ข้อมูลจากไฟล์ภายในแอป',
    };
  }

  const proxyUrl = `/api/fetch-source?url=${encodeURIComponent(parsed.normalizedFetchUrl)}`;
  const res = await fetch(proxyUrl, { cache: 'no-store' });

  if (!res.ok) {
    let errMessage = `ดึงข้อมูลไม่สำเร็จ (HTTP ${res.status})`;
    try {
      const errJson = (await res.json()) as { message?: string };
      if (errJson.message) errMessage = errJson.message;
    } catch {
      // ignore non-json error body
    }
    throw new Error(errMessage);
  }

  const contentType = res.headers.get('content-type') || '';
  const bodyText = await res.text();
  const table = parseTextPayload(bodyText, contentType);

  if (table.headers.length === 0) {
    throw new Error('ไม่พบหัวคอลัมน์หรือข้อมูลในลิงก์ที่ระบุ');
  }

  return {
    table,
    sourceTitle:
      parsed.sourceType === 'web-app'
        ? 'Google Apps Script Web App'
        : parsed.sourceType === 'google-sheet' || parsed.sourceType === 'google-sheet-published'
          ? 'Google Sheets (CSV Live)'
          : 'CSV / JSON Feed',
  };
}

export async function fetchViaGoogleSheetsApi(
  spreadsheetId: string,
  accessToken: string,
  preferredTabTitle?: string,
  preferredGid?: string
): Promise<FetchResult> {
  const safeId = encodeURIComponent(spreadsheetId.trim());
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${safeId}?fields=properties.title,sheets.properties`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    }
  );

  if (!metaRes.ok) {
    if (metaRes.status === 401 || metaRes.status === 403) {
      throw new Error('สิทธิ์การเข้าถึง Google Sheets หมดอายุหรือถูกปฏิเสธ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
    }
    throw new Error(`ไม่สามารถอ่านข้อมูล Google Sheets ได้ (HTTP ${metaRes.status})`);
  }

  const meta = (await metaRes.json()) as {
    properties?: { title?: string };
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  };

  const tabs: SheetTabInfo[] = (meta.sheets ?? [])
    .map((s) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title ?? 'Sheet1',
    }))
    .filter((t) => Boolean(t.title));

  if (tabs.length === 0) {
    throw new Error('ไม่พบแท็บชีตในสเปรดชีตนี้');
  }

  let selectedTab = tabs[0];
  if (preferredTabTitle && tabs.some((t) => t.title === preferredTabTitle)) {
    selectedTab = tabs.find((t) => t.title === preferredTabTitle)!;
  } else if (preferredGid) {
    const byGid = tabs.find((t) => String(t.sheetId) === preferredGid);
    if (byGid) selectedTab = byGid;
  }

  const escapedRange = `'${selectedTab.title.replace(/'/g, "''")}'`;
  const valuesRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${safeId}/values/${encodeURIComponent(escapedRange)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    }
  );

  if (!valuesRes.ok) {
    throw new Error(`ไม่สามารถอ่านค่าจากแท็บ "${selectedTab.title}" ได้ (HTTP ${valuesRes.status})`);
  }

  const valuesJson = (await valuesRes.json()) as { values?: unknown[][] };
  const table = normalizeValuesMatrix(valuesJson.values ?? []);

  return {
    table,
    sourceTitle: meta.properties?.title || 'Google Sheets',
    availableTabs: tabs,
    activeTabTitle: selectedTab.title,
  };
}

export async function fetchViaGoogleFormsApi(
  formId: string,
  accessToken: string
): Promise<FetchResult> {
  const safeFormId = encodeURIComponent(formId.trim());
  const headers = { Authorization: `Bearer ${accessToken}` };

  const [formRes, respRes] = await Promise.all([
    fetch(`https://forms.googleapis.com/v1/forms/${safeFormId}`, {
      headers,
      cache: 'no-store',
    }),
    fetch(`https://forms.googleapis.com/v1/forms/${safeFormId}/responses`, {
      headers,
      cache: 'no-store',
    }),
  ]);

  if (!formRes.ok || !respRes.ok) {
    const status = !formRes.ok ? formRes.status : respRes.status;
    if (status === 401 || status === 403) {
      throw new Error('สิทธิ์การเข้าถึง Google Forms หมดอายุหรือถูกปฏิเสธ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
    }
    throw new Error(`ไม่สามารถอ่านข้อมูล Google Forms ได้ (HTTP ${status})`);
  }

  const formJson = (await formRes.json()) as {
    info?: { title?: string };
    items?: Array<{
      title?: string;
      questionItem?: { question?: { questionId?: string } };
      questionGroupItem?: {
        questions?: Array<{ questionId?: string; rowQuestion?: { title?: string } }>;
      };
    }>;
  };

  const respJson = (await respRes.json()) as {
    responses?: Array<{
      responseId?: string;
      createTime?: string;
      lastSubmittedTime?: string;
      respondentEmail?: string;
      answers?: Record<
        string,
        {
          textAnswers?: { answers?: Array<{ value?: string }> };
        }
      >;
    }>;
  };

  const questionMap = new Map<string, string>();
  const orderedQuestions: Array<{ id: string; label: string }> = [];

  for (const item of formJson.items ?? []) {
    const qId = item.questionItem?.question?.questionId;
    if (qId) {
      const label = (item.title || `คำถาม ${orderedQuestions.length + 1}`).trim();
      questionMap.set(qId, label);
      orderedQuestions.push({ id: qId, label });
    }
    const groupQuestions = item.questionGroupItem?.questions ?? [];
    for (const gq of groupQuestions) {
      if (gq.questionId) {
        const label = `${item.title || ''} ${gq.rowQuestion?.title || ''}`.trim() || gq.questionId;
        questionMap.set(gq.questionId, label);
        orderedQuestions.push({ id: gq.questionId, label });
      }
    }
  }

  const tableHeaders = ['ประทับเวลา', ...orderedQuestions.map((q) => q.label)];
  if ((respJson.responses ?? []).some((r) => r.respondentEmail)) {
    tableHeaders.splice(1, 0, 'อีเมลผู้ตอบ');
  }

  const rows: Record<string, string>[] = (respJson.responses ?? []).map((resp) => {
    const row: Record<string, string> = {};
    row['ประทับเวลา'] = resp.lastSubmittedTime || resp.createTime || '';
    if (tableHeaders.includes('อีเมลผู้ตอบ')) {
      row['อีเมลผู้ตอบ'] = resp.respondentEmail || '';
    }
    for (const q of orderedQuestions) {
      const ans = resp.answers?.[q.id]?.textAnswers?.answers ?? [];
      row[q.label] = ans
        .map((a) => (a.value ?? '').trim())
        .filter(Boolean)
        .join(', ');
    }
    return row;
  });

  return {
    table: { headers: tableHeaders, rows },
    sourceTitle: formJson.info?.title || 'Google Forms',
  };
}

function parseTextPayload(text: string, contentType: string): ParsedTable {
  const trimmed = text.trimStart();
  if (
    contentType.includes('application/json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  ) {
    try {
      const json = JSON.parse(text);
      return normalizeJsonPayload(json);
    } catch {
      // Fall back to CSV parser if JSON parse fails
    }
  }
  return parseCsv(text);
}
