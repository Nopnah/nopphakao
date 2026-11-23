import { useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  Database,
  Download,
  FileSpreadsheet,
  Link2,
  LogOut,
  Printer,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { parseDataSourceUrl } from '../utils/sheetsUrl';
import type { SheetTabInfo } from '../services/dataFetcher';

export type RefreshIntervalSec = 0 | 10 | 30 | 60;

interface ConnectionBarProps {
  sourceMode: 'sample' | 'url' | 'upload' | 'google-api';
  sourceTitle: string;
  urlInput: string;
  onUrlInputChange: (val: string) => void;
  onConnectUrl: (url: string) => void;
  onLoadSample: () => void;
  onUploadCsvFile: (file: File) => void;
  autoRefreshSec: RefreshIntervalSec;
  onAutoRefreshChange: (sec: RefreshIntervalSec) => void;
  countdownSec: number;
  lastUpdated: Date | null;
  totalRows: number;
  isRefreshing: boolean;
  errorMessage: string | null;
  googleUser: User | null;
  hasGoogleToken: boolean;
  isSigningIn: boolean;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  availableTabs: SheetTabInfo[];
  activeTabTitle: string;
  onSelectSheetTab: (tabTitle: string) => void;
  onExportCsv: () => void;
  onExportSummaryJson: () => void;
  onPrintReport: () => void;
}

export function ConnectionBar({
  sourceMode,
  sourceTitle,
  urlInput,
  onUrlInputChange,
  onConnectUrl,
  onLoadSample,
  onUploadCsvFile,
  autoRefreshSec,
  onAutoRefreshChange,
  countdownSec,
  lastUpdated,
  totalRows,
  isRefreshing,
  errorMessage,
  googleUser,
  hasGoogleToken,
  isSigningIn,
  onGoogleSignIn,
  onGoogleSignOut,
  availableTabs,
  activeTabTitle,
  onSelectSheetTab,
  onExportCsv,
  onExportSummaryJson,
  onPrintReport,
}: ConnectionBarProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedPreview = useMemo(() => parseDataSourceUrl(urlInput), [urlInput]);

  const formattedLastUpdated = lastUpdated
    ? lastUpdated.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnectUrl(urlInput);
  };

  return (
    <section
      id="connection"
      aria-label="การเชื่อมต่อข้อมูลแบบเรียลไทม์"
      className="rounded-xl border border-slate-200 bg-white print:hidden"
    >
      {/* Top summary bar with clean unboxed metadata */}
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              {sourceTitle}
            </h1>
            <button
              type="button"
              onClick={() => setIsPanelOpen((prev) => !prev)}
              aria-expanded={isPanelOpen}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline underline-offset-2 cursor-pointer whitespace-nowrap"
            >
              {isPanelOpen ? 'ซ่อนตั้งค่าการเชื่อมต่อ' : 'ตั้งค่าลิงก์ / แหล่งข้อมูล'}
            </button>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 tabular-nums">
            <span>
              โหมด:{' '}
              <strong className="font-medium text-slate-700">
                {sourceMode === 'sample'
                  ? 'ข้อมูลตัวอย่าง Zoning 2570'
                  : sourceMode === 'google-api'
                    ? 'Google Workspace API'
                    : sourceMode === 'upload'
                      ? 'ไฟล์ CSV จากเครื่อง'
                      : 'ลิงก์ชีต / CSV / Web App'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>อัปเดตล่าสุด {formattedLastUpdated}</span>
            <span aria-hidden="true">·</span>
            <span>{totalRows.toLocaleString('th-TH')} รายการ</span>
            {autoRefreshSec > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700 font-medium">
                  รีเฟรชอัตโนมัติใน {countdownSec} วิ
                </span>
              </>
            )}
          </p>
        </div>

        {/* Auto-refresh selector & Export Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <label
              htmlFor="auto-refresh-select"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
            >
              Auto-refresh
            </label>
            <select
              id="auto-refresh-select"
              value={autoRefreshSec}
              onChange={(e) => onAutoRefreshChange(Number(e.target.value) as RefreshIntervalSec)}
              className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer tabular-nums"
            >
              <option value={0}>ปิดไว้</option>
              <option value={10}>ทุก 10 วินาที</option>
              <option value={30}>ทุก 30 วินาที</option>
              <option value={60}>ทุก 60 วินาที</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onExportCsv}
            disabled={totalRows === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>ส่งออก CSV</span>
          </button>

          <button
            type="button"
            onClick={onExportSummaryJson}
            disabled={totalRows === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            <span>สรุป JSON</span>
          </button>

          <button
            type="button"
            onClick={onPrintReport}
            disabled={totalRows === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            <span>พิมพ์รายงาน</span>
          </button>
        </div>
      </div>

      {/* Expandable Connection Studio */}
      {isPanelOpen && (
        <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
            {/* Left: URL Input + Auto-CSV Converter */}
            <form onSubmit={handleSubmit} className="lg:col-span-8 space-y-2">
              <label
                htmlFor="source-url-input"
                className="block text-xs font-semibold text-slate-700"
              >
                วางลิงก์ Google Sheets, Google Forms, ลิงก์ CSV หรือ Apps Script Web App URL (บันทึกค่าไว้ในเบราว์เซอร์อัตโนมัติ)
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Link2
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="source-url-input"
                    type="url"
                    value={urlInput}
                    onChange={(e) => onUrlInputChange(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0 หรือลิงก์ CSV / Web App"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isRefreshing || !urlInput.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                  <span>เชื่อมต่อข้อมูล</span>
                </button>
              </div>

              {/* URL Conversion Preview */}
              {urlInput.trim() !== '' && (
                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-slate-700">{parsedPreview.label}</span>
                  {parsedPreview.isValid &&
                    parsedPreview.normalizedFetchUrl !== urlInput.trim() && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px] text-slate-500 break-all">
                          CSV: {parsedPreview.normalizedFetchUrl}
                        </span>
                      </>
                    )}
                </div>
              )}
            </form>

            {/* Right: Google Workspace Sign-In & Quick Sources */}
            <div className="lg:col-span-4 flex flex-col gap-2.5 lg:border-l lg:border-slate-200 lg:pl-4">
              <div className="text-xs font-semibold text-slate-700">
                บัญชี Google Workspace (สำหรับชีตส่วนตัวและ Google Forms)
              </div>

              {googleUser && hasGoogleToken ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900 truncate">
                      <Check className="h-3.5 w-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {googleUser.displayName || googleUser.email || 'เชื่อมต่อ Google แล้ว'}
                      </span>
                    </div>
                    {googleUser.email && (
                      <div className="text-[11px] text-emerald-800/80 truncate">
                        {googleUser.email}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onGoogleSignOut}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>ออก</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={isSigningIn}
                  className="inline-flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-xs hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>
                    {isSigningIn ? 'กำลังเข้าสู่ระบบ...' : 'Sign in with Google'}
                  </span>
                </button>
              )}

              {/* Sheet tab selector when Google Sheets API returns multiple tabs */}
              {availableTabs.length > 1 && (
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="sheet-tab-select"
                    className="text-xs font-medium text-slate-600 whitespace-nowrap"
                  >
                    เลือกแท็บชีต:
                  </label>
                  <select
                    id="sheet-tab-select"
                    value={activeTabTitle}
                    onChange={(e) => onSelectSheetTab(e.target.value)}
                    className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                  >
                    {availableTabs.map((tab) => (
                      <option key={tab.sheetId} value={tab.title}>
                        {tab.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Secondary Utility Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="อัปโหลดไฟล์ CSV จากเครื่อง"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadCsvFile(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>นำเข้าไฟล์ CSV</span>
              </button>

              <button
                type="button"
                onClick={onLoadSample}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>ใช้ข้อมูลตัวอย่าง Zoning 2570</span>
              </button>
            </div>

            <p className="text-xs text-slate-500">
              รองรับลิงก์ชีตสาธารณะ, Web App JSON/CSV และการเข้าสู่ระบบ Google เพื่ออ่านชีต/ฟอร์มส่วนตัว
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs sm:text-sm text-rose-800"
            >
              <strong className="font-semibold">ไม่สามารถดึงข้อมูลได้:</strong> {errorMessage}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
