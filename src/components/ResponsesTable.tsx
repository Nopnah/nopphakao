import { useMemo, useState } from 'react';
import { ArrowDownUp, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import {
  formatShortHeader,
  parseFlexibleTimestamp,
  parseNumericValue,
  type DatasetProfile,
} from '../utils/analytics';

interface ResponsesTableProps {
  rows: Record<string, string>[];
  totalAllRows: number;
  profile: DatasetProfile;
  onSelectRow: (row: Record<string, string>) => void;
  onClearFilters: () => void;
}

export function ResponsesTable({
  rows,
  totalAllRows,
  profile,
  onSelectRow,
  onClearFilters,
}: ResponsesTableProps) {
  const [sortCol, setSortCol] = useState<string>(profile.timestampColumn ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const columns = profile.previewColumns;

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = (a[sortCol] ?? '').trim();
      const vb = (b[sortCol] ?? '').trim();

      if (sortCol === profile.timestampColumn) {
        const da = parseFlexibleTimestamp(va)?.getTime() ?? 0;
        const db = parseFlexibleTimestamp(vb)?.getTime() ?? 0;
        return sortDir === 'asc' ? da - db : db - da;
      }

      const na = parseNumericValue(va);
      const nb = parseNumericValue(vb);
      if (na !== null && nb !== null) {
        return sortDir === 'asc' ? na - nb : nb - na;
      }

      return sortDir === 'asc'
        ? va.localeCompare(vb, 'th')
        : vb.localeCompare(va, 'th');
    });
    return copy;
  }, [rows, sortCol, sortDir, profile.timestampColumn]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
    setPage(1);
  };

  return (
    <section
      id="responses"
      aria-label="ตารางข้อมูลล่าสุด"
      className="rounded-xl border border-slate-200 bg-white overflow-hidden print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-6">
        <div>
          <h2 className="text-sm font-bold text-slate-900">รายการคำตอบล่าสุด</h2>
          <p className="text-xs text-slate-500 tabular-nums">
            แสดง {pageRows.length} จาก {sortedRows.length.toLocaleString('th-TH')} รายการ · คลิกที่แถวเพื่อดูข้อมูลครบทุกคอลัมน์
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="table-page-size" className="text-slate-600">
            แถวต่อหน้า
          </label>
          <select
            id="table-page-size"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-800 focus:border-emerald-600 focus:outline-none cursor-pointer tabular-nums"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-800">
            {totalAllRows === 0
              ? 'ยังไม่มีรายการคำตอบในแหล่งข้อมูลนี้'
              : 'ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหาหรือตัวกรอง'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {totalAllRows === 0
              ? 'ลองเชื่อมต่อลิงก์ Google Sheets / CSV หรือเลือกชุดข้อมูลตัวอย่างด้านบน'
              : 'ลองปรับคำค้นหา ช่วงวันที่ หรือล้างตัวกรองเพื่อดูข้อมูลทั้งหมด'}
          </p>
          {totalAllRows > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-4 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  {columns.map((col) => (
                    <th key={col} className="whitespace-nowrap px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => handleSort(col)}
                        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                      >
                        <span className="max-w-[180px] truncate" title={col}>
                          {formatShortHeader(col)}
                        </span>
                        <ArrowDownUp className="h-3 w-3 text-slate-400" aria-hidden="true" />
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right whitespace-nowrap">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((row, idx) => {
                  const isNumericCol = (col: string) =>
                    profile.numericColumns.includes(col);
                  return (
                    <tr
                      key={idx}
                      className="hover:bg-emerald-50/40 transition-colors"
                    >
                      {columns.map((col) => (
                        <td
                          key={col}
                          className={`px-4 py-2.5 max-w-[220px] truncate text-slate-700 ${
                            isNumericCol(col) || col === profile.timestampColumn
                              ? 'font-mono text-xs tabular-nums'
                              : ''
                          }`}
                          title={row[col] ?? ''}
                        >
                          {row[col] || '—'}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectRow(row)}
                          aria-label={`ดูรายละเอียดคำตอบแถวที่ ${(safePage - 1) * pageSize + idx + 1}`}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>ดูข้อมูล</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 sm:px-6 text-xs text-slate-600 tabular-nums">
              <span>
                หน้า {safePage} จาก {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  aria-label="หน้าก่อนหน้า"
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  aria-label="หน้าถัดไป"
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
