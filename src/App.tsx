import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { Bell, X } from 'lucide-react';
import { Header } from './components/Header';
import { ConnectionBar, type RefreshIntervalSec } from './components/ConnectionBar';
import { KpiStrip } from './components/KpiStrip';
import { FilterBar } from './components/FilterBar';
import { ChartsGrid } from './components/ChartsGrid';
import { ResponsesTable } from './components/ResponsesTable';
import { ResponseDetailDrawer } from './components/ResponseDetailDrawer';
import { PrintReportView } from './components/PrintReportView';
import {
  buildDistribution,
  computeNumericSummary,
  countNewIncomingRows,
  filterDatasetRows,
  profileDataset,
  type FilterState,
} from './utils/analytics';
import { parseCsv, toCsvString } from './utils/csv';
import { parseDataSourceUrl } from './utils/sheetsUrl';
import {
  fetchBuiltInSample,
  fetchFromPublicUrl,
  fetchViaGoogleFormsApi,
  fetchViaGoogleSheetsApi,
  type FetchResult,
  type SheetTabInfo,
} from './services/dataFetcher';
import {
  getAccessToken,
  initGoogleAuth,
  signInWithGoogleWorkspace,
  signOutGoogle,
} from './services/googleAuth';

const STORAGE_KEY = 'sheetpulse_prefs_v1';

interface SavedPrefs {
  urlInput: string;
  autoRefreshSec: RefreshIntervalSec;
  sourceMode: 'sample' | 'url' | 'upload' | 'google-api';
  activeTabTitle: string;
}

function loadSavedPrefs(): SavedPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        urlInput: '',
        autoRefreshSec: 30,
        sourceMode: 'sample',
        activeTabTitle: '',
      };
    }
    const parsed = JSON.parse(raw) as Partial<SavedPrefs>;
    const validIntervals: RefreshIntervalSec[] = [0, 10, 30, 60];
    const autoRefreshSec = validIntervals.includes(parsed.autoRefreshSec as RefreshIntervalSec)
      ? (parsed.autoRefreshSec as RefreshIntervalSec)
      : 30;
    return {
      urlInput: typeof parsed.urlInput === 'string' ? parsed.urlInput : '',
      autoRefreshSec,
      sourceMode:
        parsed.sourceMode === 'url' || parsed.sourceMode === 'google-api'
          ? parsed.sourceMode
          : 'sample',
      activeTabTitle: typeof parsed.activeTabTitle === 'string' ? parsed.activeTabTitle : '',
    };
  } catch {
    return {
      urlInput: '',
      autoRefreshSec: 30,
      sourceMode: 'sample',
      activeTabTitle: '',
    };
  }
}

export default function App() {
  const initialPrefs = useMemo(() => loadSavedPrefs(), []);

  const [sourceMode, setSourceMode] = useState<'sample' | 'url' | 'upload' | 'google-api'>(
    initialPrefs.sourceMode
  );
  const [urlInput, setUrlInput] = useState(initialPrefs.urlInput);
  const [activeUrl, setActiveUrl] = useState(initialPrefs.urlInput);
  const [sourceTitle, setSourceTitle] = useState('แบบสำรวจ Zoning 2570 (ชุดข้อมูลตัวอย่าง)');
  const [autoRefreshSec, setAutoRefreshSec] = useState<RefreshIntervalSec>(
    initialPrefs.autoRefreshSec
  );
  const [countdownSec, setCountdownSec] = useState<number>(initialPrefs.autoRefreshSec);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [availableTabs, setAvailableTabs] = useState<SheetTabInfo[]>([]);
  const [activeTabTitle, setActiveTabTitle] = useState(initialPrefs.activeTabTitle);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newArrivalAlert, setNewArrivalAlert] = useState<{
    count: number;
    timeLabel: string;
  } | null>(null);

  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [hasGoogleToken, setHasGoogleToken] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [selectedNumericCol, setSelectedNumericCol] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    dateFrom: '',
    dateTo: '',
    columnFilters: {},
  });
  const [selectedRow, setSelectedRow] = useState<Record<string, string> | null>(null);

  const rowsRef = useRef<Record<string, string>[]>([]);
  rowsRef.current = rows;

  // Persist user preferences (never store access tokens)
  useEffect(() => {
    try {
      const toSave: SavedPrefs = {
        urlInput: activeUrl,
        autoRefreshSec,
        sourceMode: sourceMode === 'upload' ? 'sample' : sourceMode,
        activeTabTitle,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // ignore storage quota errors
    }
  }, [activeUrl, autoRefreshSec, sourceMode, activeTabTitle]);

  // Google Workspace Auth listener
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user) => {
        setGoogleUser(user);
        setHasGoogleToken(true);
      },
      (user) => {
        setGoogleUser(user);
        setHasGoogleToken(Boolean(getAccessToken()));
      }
    );
    return unsubscribe;
  }, []);

  const applyFetchResult = useCallback(
    (result: FetchResult, detectNewRows: boolean) => {
      const prevRows = rowsRef.current;
      const nextHeaders = result.table.headers;
      const nextRows = result.table.rows;

      if (detectNewRows && prevRows.length > 0) {
        const added = countNewIncomingRows(prevRows, nextRows, nextHeaders);
        if (added > 0) {
          setNewArrivalAlert({
            count: added,
            timeLabel: new Date().toLocaleTimeString('th-TH', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          });
        }
      }

      setHeaders(nextHeaders);
      setRows(nextRows);
      setSourceTitle(result.sourceTitle);
      setAvailableTabs(result.availableTabs ?? []);
      if (result.activeTabTitle) {
        setActiveTabTitle(result.activeTabTitle);
      }
      setLastUpdated(new Date());
      setErrorMessage(null);
    },
    []
  );

  const executeSourceLoad = useCallback(
    async (
      mode: 'sample' | 'url' | 'upload' | 'google-api',
      targetUrl: string,
      preferredTab?: string,
      detectNew = false
    ) => {
      setIsRefreshing(true);
      setErrorMessage(null);
      try {
        if (mode === 'sample' || (!targetUrl && mode !== 'upload')) {
          const result = await fetchBuiltInSample();
          applyFetchResult(result, detectNew);
          setSourceMode('sample');
          return;
        }

        if (mode === 'upload') {
          // Local uploaded file cannot be re-polled from network
          setLastUpdated(new Date());
          return;
        }

        const parsed = parseDataSourceUrl(targetUrl);
        const token = getAccessToken();

        if (parsed.sourceType === 'google-form' && parsed.formId) {
          if (!token) {
            throw new Error(
              'กรุณากด "Sign in with Google" เพื่ออ่านคำตอบจาก Google Forms'
            );
          }
          const result = await fetchViaGoogleFormsApi(parsed.formId, token);
          applyFetchResult(result, detectNew);
          setSourceMode('google-api');
          return;
        }

        if (parsed.sourceType === 'google-sheet' && parsed.spreadsheetId && token) {
          const result = await fetchViaGoogleSheetsApi(
            parsed.spreadsheetId,
            token,
            preferredTab,
            parsed.gid
          );
          applyFetchResult(result, detectNew);
          setSourceMode('google-api');
          return;
        }

        const result = await fetchFromPublicUrl(targetUrl);
        applyFetchResult(result, detectNew);
        setSourceMode('url');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการดึงข้อมูล';
        setErrorMessage(msg);
        // If first load from saved URL failed, fall back gracefully to sample if empty
        if (rowsRef.current.length === 0) {
          try {
            const sample = await fetchBuiltInSample();
            applyFetchResult(sample, false);
            setSourceMode('sample');
          } catch {
            // ignore
          }
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [applyFetchResult]
  );

  // Initial load
  useEffect(() => {
    if (
      (initialPrefs.sourceMode === 'url' || initialPrefs.sourceMode === 'google-api') &&
      initialPrefs.urlInput
    ) {
      void executeSourceLoad(
        initialPrefs.sourceMode,
        initialPrefs.urlInput,
        initialPrefs.activeTabTitle,
        false
      );
    } else {
      void executeSourceLoad('sample', '', '', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh interval timer
  useEffect(() => {
    if (autoRefreshSec === 0 || sourceMode === 'upload') {
      setCountdownSec(0);
      return;
    }

    setCountdownSec(autoRefreshSec);
    const timer = window.setInterval(() => {
      setCountdownSec((prev) => {
        if (prev <= 1) {
          void executeSourceLoad(sourceMode, activeUrl, activeTabTitle, true);
          return autoRefreshSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [autoRefreshSec, sourceMode, activeUrl, activeTabTitle, executeSourceLoad]);

  const handleRefreshNow = () => {
    setCountdownSec(autoRefreshSec);
    void executeSourceLoad(sourceMode, activeUrl, activeTabTitle, true);
  };

  const handleConnectUrl = (nextUrl: string) => {
    const trimmed = nextUrl.trim();
    if (!trimmed) return;
    setActiveUrl(trimmed);
    setActiveTabTitle('');
    setFilters({
      searchQuery: '',
      dateFrom: '',
      dateTo: '',
      columnFilters: {},
    });
    setCountdownSec(autoRefreshSec);
    void executeSourceLoad('url', trimmed, '', false);
  };

  const handleLoadSample = () => {
    setActiveUrl('');
    setUrlInput('');
    setActiveTabTitle('');
    setAvailableTabs([]);
    setFilters({
      searchQuery: '',
      dateFrom: '',
      dateTo: '',
      columnFilters: {},
    });
    void executeSourceLoad('sample', '', '', false);
  };

  const handleUploadCsvFile = async (file: File) => {
    try {
      const text = await file.text();
      const table = parseCsv(text);
      if (table.headers.length === 0) {
        setErrorMessage('ไฟล์ CSV ไม่มีหัวคอลัมน์หรือข้อมูลที่อ่านได้');
        return;
      }
      setSourceMode('upload');
      setAvailableTabs([]);
      setFilters({
        searchQuery: '',
        dateFrom: '',
        dateTo: '',
        columnFilters: {},
      });
      applyFetchResult(
        {
          table,
          sourceTitle: file.name.replace(/\.csv$/i, ''),
        },
        false
      );
    } catch {
      setErrorMessage('ไม่สามารถอ่านไฟล์ CSV นี้ได้');
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMessage(null);
    try {
      const { user } = await signInWithGoogleWorkspace();
      setGoogleUser(user);
      setHasGoogleToken(true);

      // Automatically reload active URL if it's a Google Sheet or Form
      const targetUrl = urlInput.trim() || activeUrl;
      if (targetUrl) {
        const parsed = parseDataSourceUrl(targetUrl);
        if (parsed.sourceType === 'google-sheet' || parsed.sourceType === 'google-form') {
          setActiveUrl(targetUrl);
          await executeSourceLoad('google-api', targetUrl, activeTabTitle, false);
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'เข้าสู่ระบบ Google ไม่สำเร็จ';
      setErrorMessage(msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogle();
    setGoogleUser(null);
    setHasGoogleToken(false);
  };

  const handleSelectSheetTab = (tabTitle: string) => {
    setActiveTabTitle(tabTitle);
    void executeSourceLoad('google-api', activeUrl, tabTitle, false);
  };

  const profile = useMemo(() => profileDataset(headers, rows), [headers, rows]);

  const filteredRows = useMemo(
    () => filterDatasetRows(rows, profile, filters),
    [rows, profile, filters]
  );

  const handleToggleChartFilter = (column: string, value: string) => {
    setFilters((prev) => {
      const current = prev.columnFilters[column];
      const nextFilters = { ...prev.columnFilters };
      if (current === value) {
        delete nextFilters[column];
      } else {
        nextFilters[column] = value;
      }
      return { ...prev, columnFilters: nextFilters };
    });
  };

  const handleExportCsv = () => {
    const csvContent = toCsvString(profile.activeHeaders, filteredRows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sheetpulse-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSummaryJson = () => {
    const activeNumericCol =
      selectedNumericCol && profile.numericColumns.includes(selectedNumericCol)
        ? selectedNumericCol
        : (profile.numericColumns[0] ?? null);

    const summaryPayload = {
      sourceTitle,
      exportedAt: new Date().toISOString(),
      totalResponses: filteredRows.length,
      numericSummary: computeNumericSummary(filteredRows, activeNumericCol),
      distributions: Object.fromEntries(
        [...profile.categoricalColumns, ...profile.multiSelectColumns]
          .slice(0, 6)
          .map((col) => [
            col,
            buildDistribution(
              filteredRows,
              col,
              profile.multiSelectColumns.includes(col),
              15
            ),
          ])
      ),
    };

    const blob = new Blob([JSON.stringify(summaryPayload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sheetpulse-summary-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header isRefreshing={isRefreshing} onRefreshNow={handleRefreshNow} />

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 space-y-5 print:p-0">
        {/* Real-time New Submission Notification */}
        {newArrivalAlert && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 print:hidden"
          >
            <div className="flex items-center gap-2.5">
              <Bell className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>
                ตรวจพบข้อมูลใหม่เข้ามาเพิ่ม{' '}
                <strong className="font-bold tabular-nums">
                  +{newArrivalAlert.count} รายการ
                </strong>{' '}
                เมื่อเวลา {newArrivalAlert.timeLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setNewArrivalAlert(null)}
              aria-label="ปิดการแจ้งเตือนรายการใหม่"
              className="rounded p-1 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <ConnectionBar
          sourceMode={sourceMode}
          sourceTitle={sourceTitle}
          urlInput={urlInput}
          onUrlInputChange={setUrlInput}
          onConnectUrl={handleConnectUrl}
          onLoadSample={handleLoadSample}
          onUploadCsvFile={handleUploadCsvFile}
          autoRefreshSec={autoRefreshSec}
          onAutoRefreshChange={setAutoRefreshSec}
          countdownSec={countdownSec}
          lastUpdated={lastUpdated}
          totalRows={rows.length}
          isRefreshing={isRefreshing}
          errorMessage={errorMessage}
          googleUser={googleUser}
          hasGoogleToken={hasGoogleToken}
          isSigningIn={isSigningIn}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          availableTabs={availableTabs}
          activeTabTitle={activeTabTitle}
          onSelectSheetTab={handleSelectSheetTab}
          onExportCsv={handleExportCsv}
          onExportSummaryJson={handleExportSummaryJson}
          onPrintReport={() => window.print()}
        />

        <KpiStrip
          allRows={rows}
          filteredRows={filteredRows}
          profile={profile}
          selectedNumericCol={selectedNumericCol}
          onSelectNumericCol={setSelectedNumericCol}
          isLoading={isLoading}
        />

        <FilterBar
          allRows={rows}
          filteredCount={filteredRows.length}
          profile={profile}
          filters={filters}
          onFiltersChange={setFilters}
        />

        <ChartsGrid
          filteredRows={filteredRows}
          profile={profile}
          activeColumnFilters={filters.columnFilters}
          onToggleFilter={handleToggleChartFilter}
        />

        <ResponsesTable
          rows={filteredRows}
          totalAllRows={rows.length}
          profile={profile}
          onSelectRow={setSelectedRow}
          onClearFilters={() =>
            setFilters({
              searchQuery: '',
              dateFrom: '',
              dateTo: '',
              columnFilters: {},
            })
          }
        />

        <PrintReportView
          sourceTitle={sourceTitle}
          lastUpdated={lastUpdated}
          filteredRows={filteredRows}
          profile={profile}
          selectedNumericCol={selectedNumericCol}
        />
      </main>

      <ResponseDetailDrawer
        row={selectedRow}
        headers={profile.activeHeaders}
        onClose={() => setSelectedRow(null)}
      />
    </div>
  );
}
