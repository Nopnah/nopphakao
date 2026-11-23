import {
  buildDistribution,
  computeNumericSummary,
  countTodayEntries,
  formatShortHeader,
  type DatasetProfile,
} from '../utils/analytics';

interface KpiStripProps {
  allRows: Record<string, string>[];
  filteredRows: Record<string, string>[];
  profile: DatasetProfile;
  selectedNumericCol: string;
  onSelectNumericCol: (col: string) => void;
  isLoading: boolean;
}

export function KpiStrip({
  allRows,
  filteredRows,
  profile,
  selectedNumericCol,
  onSelectNumericCol,
  isLoading,
}: KpiStripProps) {
  if (isLoading && allRows.length === 0) {
    return (
      <section aria-label="ตัวชี้วัดหลัก" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="h-32 rounded-xl border border-slate-200 bg-white p-5 animate-pulse"
          >
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="mt-4 h-8 w-28 rounded bg-slate-200" />
            <div className="mt-3 h-3 w-36 rounded bg-slate-100" />
          </div>
        ))}
      </section>
    );
  }

  const activeNumericCol =
    selectedNumericCol && profile.numericColumns.includes(selectedNumericCol)
      ? selectedNumericCol
      : (profile.numericColumns[0] ?? null);

  const numericSummary = computeNumericSummary(filteredRows, activeNumericCol);
  const todayStats = countTodayEntries(filteredRows, profile.timestampColumn);

  const primaryCatCol = profile.categoricalColumns[0] ?? null;
  const primaryCatDist = primaryCatCol
    ? buildDistribution(filteredRows, primaryCatCol, false, 10)
    : [];
  const topCat = primaryCatDist[0] ?? null;

  const isFiltered = filteredRows.length !== allRows.length;

  return (
    <section
      id="overview"
      aria-label="สรุปตัวเลขสำคัญ"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {/* KPI 1: Total Responses */}
      <article className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-xs font-medium text-slate-500">จำนวนผู้ตอบทั้งหมด</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
            {filteredRows.length.toLocaleString('th-TH')}
          </span>
          <span className="text-sm text-slate-500">รายการ</span>
        </div>
        <p className="mt-2 text-xs text-slate-500 tabular-nums">
          {isFiltered
            ? `กรองจากทั้งหมด ${allRows.length.toLocaleString('th-TH')} รายการ`
            : `ข้อมูลที่ใช้งานได้ ${profile.activeHeaders.length} คอลัมน์`}
        </p>
      </article>

      {/* KPI 2: New Entries Today */}
      <article className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-xs font-medium text-slate-500">รายการเข้ามาใหม่วันนี้</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-3xl font-bold tracking-tight text-emerald-700 tabular-nums">
            {todayStats.todayCount.toLocaleString('th-TH')}
          </span>
          <span className="text-sm text-slate-500">รายการ</span>
        </div>
        <p className="mt-2 text-xs text-slate-500 tabular-nums truncate">
          {todayStats.latestDateLabel
            ? `วันล่าสุด (${todayStats.latestDateLabel}): ${todayStats.latestDateCount.toLocaleString('th-TH')} รายการ`
            : 'ไม่พบคอลัมน์ประทับเวลา'}
        </p>
      </article>

      {/* KPI 3: Key Numeric Column Sum & Avg */}
      <article className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500 truncate" title={numericSummary?.column}>
            {numericSummary ? formatShortHeader(numericSummary.column) : 'คอลัมน์ตัวเลขสำคัญ'}
          </span>
          {profile.numericColumns.length > 1 && (
            <select
              aria-label="เลือกคอลัมน์ตัวเลขสำคัญ"
              value={activeNumericCol ?? ''}
              onChange={(e) => onSelectNumericCol(e.target.value)}
              className="max-w-[100px] shrink-0 truncate rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 focus:border-emerald-600 focus:outline-none cursor-pointer"
            >
              {profile.numericColumns.map((col) => (
                <option key={col} value={col}>
                  {formatShortHeader(col)}
                </option>
              ))}
            </select>
          )}
        </div>

        {numericSummary ? (
          <>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                {numericSummary.average.toLocaleString('th-TH', {
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-xs font-medium text-slate-500">เฉลี่ย</span>
            </div>
            <p className="mt-2 text-xs text-slate-500 tabular-nums">
              ผลรวม{' '}
              <strong className="font-semibold text-slate-700">
                {numericSummary.sum.toLocaleString('th-TH', { maximumFractionDigits: 2 })}
              </strong>{' '}
              · ช่วง {numericSummary.min.toLocaleString('th-TH')}–
              {numericSummary.max.toLocaleString('th-TH')}
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-400">ไม่พบคอลัมน์ตัวเลขในชุดข้อมูลนี้</p>
        )}
      </article>

      {/* KPI 4: Top Category / Area Coverage */}
      <article className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-xs font-medium text-slate-500 truncate">
          {primaryCatCol ? `สัดส่วนสูงสุด · ${formatShortHeader(primaryCatCol)}` : 'ความหลากหลายของข้อมูล'}
        </div>
        {topCat ? (
          <>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 truncate"
                title={topCat.name}
              >
                {topCat.name}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500 tabular-nums">
              {topCat.value.toLocaleString('th-TH')} รายการ ({topCat.percentage}%) ·{' '}
              {primaryCatDist.length} กลุ่มย่อย
            </p>
          </>
        ) : (
          <div className="mt-2">
            <span className="font-display text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
              {profile.activeHeaders.length}
            </span>
            <p className="mt-2 text-xs text-slate-500">คอลัมน์ที่มีข้อมูล</p>
          </div>
        )}
      </article>
    </section>
  );
}
