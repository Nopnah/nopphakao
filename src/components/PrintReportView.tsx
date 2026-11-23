import {
  buildDistribution,
  computeNumericSummary,
  formatShortHeader,
  type DatasetProfile,
} from '../utils/analytics';

interface PrintReportViewProps {
  sourceTitle: string;
  lastUpdated: Date | null;
  filteredRows: Record<string, string>[];
  profile: DatasetProfile;
  selectedNumericCol: string;
}

export function PrintReportView({
  sourceTitle,
  lastUpdated,
  filteredRows,
  profile,
  selectedNumericCol,
}: PrintReportViewProps) {
  const activeNumericCol =
    selectedNumericCol && profile.numericColumns.includes(selectedNumericCol)
      ? selectedNumericCol
      : (profile.numericColumns[0] ?? null);
  const numericSummary = computeNumericSummary(filteredRows, activeNumericCol);

  const summaryCols = [
    ...profile.categoricalColumns.slice(0, 2),
    ...profile.multiSelectColumns.slice(0, 1),
  ];

  return (
    <div className="hidden print:block space-y-6 text-slate-900">
      <div className="border-b border-slate-300 pb-3 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">{sourceTitle}</h1>
          <p className="text-xs text-slate-600">
            รายงานสรุปผลข้อมูลจาก SheetPulse Dashboard · จำนวน {filteredRows.length} รายการ
          </p>
        </div>
        <div className="text-xs text-slate-600 tabular-nums">
          พิมพ์เมื่อ {new Date().toLocaleString('th-TH')}
          {lastUpdated ? ` · อัปเดตล่าสุด ${lastUpdated.toLocaleTimeString('th-TH')}` : ''}
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="border border-slate-300 rounded p-3">
          <div className="text-xs text-slate-500">จำนวนผู้ตอบในรายงาน</div>
          <div className="text-xl font-bold tabular-nums mt-1">{filteredRows.length} รายการ</div>
        </div>
        {numericSummary && (
          <div className="border border-slate-300 rounded p-3">
            <div className="text-xs text-slate-500">
              {formatShortHeader(numericSummary.column)}
            </div>
            <div className="text-xl font-bold tabular-nums mt-1">
              เฉลี่ย {numericSummary.average.toFixed(2)} (รวม {numericSummary.sum})
            </div>
          </div>
        )}
        <div className="border border-slate-300 rounded p-3">
          <div className="text-xs text-slate-500">จำนวนคอลัมน์ข้อมูล</div>
          <div className="text-xl font-bold tabular-nums mt-1">
            {profile.activeHeaders.length} คอลัมน์
          </div>
        </div>
      </div>

      {/* Category distributions */}
      {summaryCols.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {summaryCols.map((col) => {
            const isMulti = profile.multiSelectColumns.includes(col);
            const dist = buildDistribution(filteredRows, col, isMulti, 8);
            return (
              <div key={col} className="border border-slate-300 rounded p-3">
                <h3 className="text-xs font-bold mb-2">{formatShortHeader(col)}</h3>
                <ul className="space-y-1 text-xs">
                  {dist.map((item) => (
                    <li key={item.name} className="flex justify-between gap-2 tabular-nums">
                      <span className="truncate">{item.name}</span>
                      <span>
                        {item.value} ({item.percentage}%)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Table */}
      <table className="w-full border-collapse border border-slate-300 text-[11px]">
        <thead>
          <tr className="bg-slate-100">
            {profile.previewColumns.map((col) => (
              <th key={col} className="border border-slate-300 px-2 py-1.5 text-left">
                {formatShortHeader(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredRows.slice(0, 40).map((row, idx) => (
            <tr key={idx}>
              {profile.previewColumns.map((col) => (
                <td key={col} className="border border-slate-300 px-2 py-1 tabular-nums">
                  {row[col] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
