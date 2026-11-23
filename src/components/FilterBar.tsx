import { useMemo } from 'react';
import { Calendar, Search, X } from 'lucide-react';
import {
  buildDistribution,
  formatShortHeader,
  type DatasetProfile,
  type FilterState,
} from '../utils/analytics';

interface FilterBarProps {
  allRows: Record<string, string>[];
  filteredCount: number;
  profile: DatasetProfile;
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
}

export function FilterBar({
  allRows,
  filteredCount,
  profile,
  filters,
  onFiltersChange,
}: FilterBarProps) {
  // Pick up to 3 high-priority categorical/multi-select columns for quick dropdowns
  const quickFilterColumns = useMemo(() => {
    const candidates = [...profile.categoricalColumns, ...profile.multiSelectColumns];
    const picked: string[] = [];
    for (const col of candidates) {
      if (picked.length >= 3) break;
      if (!picked.includes(col)) picked.push(col);
    }
    return picked;
  }, [profile.categoricalColumns, profile.multiSelectColumns]);

  const optionsByColumn = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of quickFilterColumns) {
      const isMulti = profile.multiSelectColumns.includes(col);
      const dist = buildDistribution(allRows, col, isMulti, 30);
      map[col] = dist.map((d) => d.name);
    }
    return map;
  }, [allRows, quickFilterColumns, profile.multiSelectColumns]);

  const hasActiveFilters =
    filters.searchQuery.trim() !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    Object.values(filters.columnFilters).some((v) => v && v !== '__ALL__');

  const clearAll = () => {
    onFiltersChange({
      searchQuery: '',
      dateFrom: '',
      dateTo: '',
      columnFilters: {},
    });
  };

  return (
    <section
      aria-label="ค้นหาและกรองข้อมูล"
      className="rounded-xl border border-slate-200 bg-white p-4 sm:px-6 print:hidden"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
        {/* Search Input */}
        <div className="md:col-span-4">
          <label
            htmlFor="dashboard-search"
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            ค้นหาข้อมูล
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="dashboard-search"
              type="search"
              value={filters.searchQuery}
              onChange={(e) =>
                onFiltersChange({ ...filters, searchQuery: e.target.value })
              }
              placeholder="ค้นหาชื่อ ตำบล พืช หรือคำตอบ..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            />
          </div>
        </div>

        {/* Date From & To */}
        {profile.timestampColumn && (
          <div className="md:col-span-3 grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="filter-date-from"
                className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600"
              >
                <Calendar className="h-3 w-3 text-slate-400" aria-hidden="true" />
                <span>ตั้งแต่วันที่</span>
              </label>
              <input
                id="filter-date-from"
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  onFiltersChange({ ...filters, dateFrom: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-emerald-600 focus:outline-none tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="filter-date-to"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                ถึงวันที่
              </label>
              <input
                id="filter-date-to"
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  onFiltersChange({ ...filters, dateTo: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-emerald-600 focus:outline-none tabular-nums"
              />
            </div>
          </div>
        )}

        {/* Dynamic Category Dropdowns */}
        <div
          className={`${
            profile.timestampColumn ? 'md:col-span-5' : 'md:col-span-8'
          } grid grid-cols-1 gap-2 sm:grid-cols-3`}
        >
          {quickFilterColumns.map((col, idx) => (
            <div key={col}>
              <label
                htmlFor={`quick-filter-${idx}`}
                className="mb-1 block truncate text-xs font-medium text-slate-600"
                title={col}
              >
                {formatShortHeader(col)}
              </label>
              <select
                id={`quick-filter-${idx}`}
                value={filters.columnFilters[col] || '__ALL__'}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    columnFilters: {
                      ...filters.columnFilters,
                      [col]: e.target.value,
                    },
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none cursor-pointer"
              >
                <option value="__ALL__">ทั้งหมด</option>
                {(optionsByColumn[col] ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Active filter summary & clear action */}
      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600 tabular-nums">
            <span>
              แสดงผล <strong className="text-slate-900">{filteredCount}</strong> จาก{' '}
              {allRows.length} รายการ
            </span>
            {Object.entries(filters.columnFilters)
              .filter(([, val]) => val && val !== '__ALL__')
              .map(([col, val]) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => {
                    const next = { ...filters.columnFilters };
                    delete next[col];
                    onFiltersChange({ ...filters, columnFilters: next });
                  }}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-slate-800 hover:bg-slate-200 cursor-pointer"
                >
                  <span>
                    {formatShortHeader(col)}: {val}
                  </span>
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              ))}
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:text-rose-800 hover:underline cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>ล้างตัวกรองทั้งหมด</span>
          </button>
        </div>
      )}
    </section>
  );
}
