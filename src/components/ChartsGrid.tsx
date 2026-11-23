import { useEffect, useMemo, useState } from 'react';
import {
  buildDistribution,
  buildTimeSeries,
  formatShortHeader,
  type DatasetProfile,
} from '../utils/analytics';

const CHART_COLORS = [
  '#15803D', // Emerald 700
  '#0284C7', // Sky 600
  '#D97706', // Amber 600
  '#0D9488', // Teal 600
  '#4F46E5', // Indigo 600
  '#DC2626', // Crimson 600
  '#65A30D', // Lime 600
  '#7C3AED', // Violet 600
];

interface ChartsGridProps {
  filteredRows: Record<string, string>[];
  profile: DatasetProfile;
  activeColumnFilters: Record<string, string>;
  onToggleFilter: (column: string, value: string) => void;
}

export function ChartsGrid({
  filteredRows,
  profile,
  activeColumnFilters,
  onToggleFilter,
}: ChartsGridProps) {
  const chartableColumns = useMemo(
    () => [...profile.categoricalColumns, ...profile.multiSelectColumns],
    [profile.categoricalColumns, profile.multiSelectColumns]
  );

  // Choose sensible defaults for Donut, Multi/Bar1, and Bar2
  const defaultDonutCol = useMemo(() => {
    const preferred = profile.categoricalColumns.find((c) =>
      /(ระดับ|ความเหมาะสม|พืชเดิม|ตำบล|ตลาด)/.test(c)
    );
    return preferred ?? profile.categoricalColumns[0] ?? chartableColumns[0] ?? '';
  }, [profile.categoricalColumns, chartableColumns]);

  const defaultBar1Col = useMemo(() => {
    if (profile.multiSelectColumns[0]) return profile.multiSelectColumns[0];
    return (
      profile.categoricalColumns.find((c) => c !== defaultDonutCol) ??
      chartableColumns[0] ??
      ''
    );
  }, [profile.multiSelectColumns, profile.categoricalColumns, chartableColumns, defaultDonutCol]);

  const defaultBar2Col = useMemo(() => {
    const candidate = profile.categoricalColumns.find(
      (c) => c !== defaultDonutCol && c !== defaultBar1Col
    );
    return candidate ?? chartableColumns.find((c) => c !== defaultDonutCol) ?? '';
  }, [profile.categoricalColumns, chartableColumns, defaultDonutCol, defaultBar1Col]);

  const [donutCol, setDonutCol] = useState(defaultDonutCol);
  const [bar1Col, setBar1Col] = useState(defaultBar1Col);
  const [bar2Col, setBar2Col] = useState(defaultBar2Col);
  const [trendMode, setTrendMode] = useState<'count' | 'cumulative'>('count');
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!chartableColumns.includes(donutCol)) setDonutCol(defaultDonutCol);
    if (!chartableColumns.includes(bar1Col)) setBar1Col(defaultBar1Col);
    if (!chartableColumns.includes(bar2Col)) setBar2Col(defaultBar2Col);
  }, [chartableColumns, donutCol, bar1Col, bar2Col, defaultDonutCol, defaultBar1Col, defaultBar2Col]);

  const timeSeries = useMemo(
    () => buildTimeSeries(filteredRows, profile.timestampColumn),
    [filteredRows, profile.timestampColumn]
  );

  const donutData = useMemo(() => {
    if (!donutCol) return [];
    const isMulti = profile.multiSelectColumns.includes(donutCol);
    return buildDistribution(filteredRows, donutCol, isMulti, 8);
  }, [filteredRows, donutCol, profile.multiSelectColumns]);

  const bar1Data = useMemo(() => {
    if (!bar1Col) return [];
    const isMulti = profile.multiSelectColumns.includes(bar1Col);
    return buildDistribution(filteredRows, bar1Col, isMulti, 10);
  }, [filteredRows, bar1Col, profile.multiSelectColumns]);

  const bar2Data = useMemo(() => {
    if (!bar2Col) return [];
    const isMulti = profile.multiSelectColumns.includes(bar2Col);
    return buildDistribution(filteredRows, bar2Col, isMulti, 10);
  }, [filteredRows, bar2Col, profile.multiSelectColumns]);

  if (filteredRows.length === 0) {
    return null;
  }

  return (
    <section id="charts" aria-label="กราฟวิเคราะห์ข้อมูล" className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* 1. Time-Series Trend Chart */}
      <article className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              แนวโน้มการส่งคำตอบตามเวลา
            </h2>
            <p className="text-xs text-slate-500">
              แบ่งตาม{timeSeries.granularity === 'hour' ? 'รายชั่วโมง' : 'รายวัน'} ·{' '}
              {filteredRows.length.toLocaleString('th-TH')} รายการ
            </p>
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTrendMode('count')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                trendMode === 'count'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              รายช่วงเวลา
            </button>
            <button
              type="button"
              onClick={() => setTrendMode('cumulative')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                trendMode === 'cumulative'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ยอดสะสม
            </button>
          </div>
        </div>

        <div className="mt-4">
          {timeSeries.points.length === 0 ? (
            <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
              ไม่พบข้อมูลเวลาสำหรับสร้างกราฟแนวโน้ม
            </div>
          ) : (
            <TimeSeriesSvg
              points={timeSeries.points}
              mode={trendMode}
              hoveredIdx={hoveredTrendIdx}
              onHoverIdx={setHoveredTrendIdx}
            />
          )}
        </div>
      </article>

      {/* 2. Donut Chart */}
      <article className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 truncate">
              สัดส่วนข้อมูล (โดนัท)
            </h2>
            <p className="text-xs text-slate-500 truncate">คลิกเพื่อกรองข้อมูลตามหมวดหมู่</p>
          </div>
          {chartableColumns.length > 0 && (
            <select
              aria-label="เลือกคอลัมน์สำหรับกราฟโดนัท"
              value={donutCol}
              onChange={(e) => setDonutCol(e.target.value)}
              className="max-w-[190px] truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-600 focus:outline-none cursor-pointer"
            >
              {chartableColumns.map((col) => (
                <option key={col} value={col}>
                  {formatShortHeader(col)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
          <DonutSvg
            data={donutData}
            total={filteredRows.length}
            activeValue={activeColumnFilters[donutCol]}
            onSelect={(val) => onToggleFilter(donutCol, val)}
          />
          <ul className="w-full flex-1 space-y-1.5 min-w-0">
            {donutData.map((item, idx) => {
              const color = CHART_COLORS[idx % CHART_COLORS.length];
              const isSelected = activeColumnFilters[donutCol] === item.name;
              return (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => onToggleFilter(donutCol, item.name)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-900 font-semibold ring-1 ring-emerald-300'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                      <span className="truncate" title={item.name}>
                        {item.name}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-slate-600 tabular-nums">
                      {item.value} ({item.percentage}%)
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </article>

      {/* 3. Bar Chart 1 (Multi-select / Popular choices) */}
      <article className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 truncate">
              อันดับตัวเลือกยอดนิยม
            </h2>
            <p className="text-xs text-slate-500 truncate">
              {profile.multiSelectColumns.includes(bar1Col)
                ? 'นับแยกแต่ละตัวเลือก (ตอบได้หลายข้อ)'
                : 'จำนวนคำตอบแยกตามกลุ่ม'}
            </p>
          </div>
          {chartableColumns.length > 0 && (
            <select
              aria-label="เลือกคอลัมน์สำหรับกราฟแท่งที่ 1"
              value={bar1Col}
              onChange={(e) => setBar1Col(e.target.value)}
              className="max-w-[220px] truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-600 focus:outline-none cursor-pointer"
            >
              {chartableColumns.map((col) => (
                <option key={col} value={col}>
                  {formatShortHeader(col)}
                </option>
              ))}
            </select>
          )}
        </div>

        <HorizontalBarList
          items={bar1Data}
          accentColor="#15803D"
          activeValue={activeColumnFilters[bar1Col]}
          onSelect={(val) => onToggleFilter(bar1Col, val)}
        />
      </article>

      {/* 4. Bar Chart 2 */}
      <article className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 truncate">
              การกระจายข้อมูลตามหมวดหมู่
            </h2>
            <p className="text-xs text-slate-500 truncate">คลิกที่แท่งกราฟเพื่อกรองตารางด้านล่าง</p>
          </div>
          {chartableColumns.length > 0 && (
            <select
              aria-label="เลือกคอลัมน์สำหรับกราฟแท่งที่ 2"
              value={bar2Col}
              onChange={(e) => setBar2Col(e.target.value)}
              className="max-w-[220px] truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-600 focus:outline-none cursor-pointer"
            >
              {chartableColumns.map((col) => (
                <option key={col} value={col}>
                  {formatShortHeader(col)}
                </option>
              ))}
            </select>
          )}
        </div>

        <HorizontalBarList
          items={bar2Data}
          accentColor="#0284C7"
          activeValue={activeColumnFilters[bar2Col]}
          onSelect={(val) => onToggleFilter(bar2Col, val)}
        />
      </article>
    </section>
  );
}

function TimeSeriesSvg({
  points,
  mode,
  hoveredIdx,
  onHoverIdx,
}: {
  points: Array<{ key: string; label: string; count: number; cumulative: number }>;
  mode: 'count' | 'cumulative';
  hoveredIdx: number | null;
  onHoverIdx: (idx: number | null) => void;
}) {
  const width = 560;
  const height = 210;
  const pad = { top: 18, right: 24, bottom: 32, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const values = points.map((p) => (mode === 'cumulative' ? p.cumulative : p.count));
  const maxVal = Math.max(1, ...values);
  const insetX = points.length <= 3 ? plotW * 0.14 : 0;
  const usableW = plotW - insetX * 2;

  const coords = points.map((p, idx) => {
    const val = mode === 'cumulative' ? p.cumulative : p.count;
    const x =
      points.length === 1
        ? pad.left + plotW / 2
        : pad.left + insetX + (idx / (points.length - 1)) * usableW;
    const y = pad.top + plotH - (val / maxVal) * plotH;
    return { x, y, val, label: p.label };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    coords.length >= 2
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(pad.top + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z`
      : '';

  const yTicks = [0, Math.ceil(maxVal / 2), maxVal];
  const hovered = hoveredIdx !== null ? coords[hoveredIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="กราฟแนวโน้มจำนวนคำตอบตามเวลา"
      >
        {/* Horizontal gridlines */}
        {yTicks.map((tick, i) => {
          const y = pad.top + plotH - (tick / maxVal) * plotH;
          return (
            <g key={i}>
              <line
                x1={pad.left}
                y1={y}
                x2={width - pad.right}
                y2={y}
                stroke="#E2E8F0"
                strokeDasharray="3 3"
              />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400 text-[11px] font-mono"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Area */}
        {areaPath && <path d={areaPath} fill="#15803D" fillOpacity={0.12} />}

        {/* Line or single bar */}
        {coords.length >= 2 ? (
          <path
            d={linePath}
            fill="none"
            stroke="#15803D"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <rect
            x={coords[0].x - 24}
            y={coords[0].y}
            width={48}
            height={pad.top + plotH - coords[0].y}
            rx={4}
            fill="#15803D"
            fillOpacity={0.85}
          />
        )}

        {/* Data points & X labels */}
        {coords.map((c, idx) => {
          const showLabel =
            points.length <= 8 ||
            idx === 0 ||
            idx === points.length - 1 ||
            idx % Math.ceil(points.length / 6) === 0;
          return (
            <g key={points[idx].key}>
              {showLabel && (
                <text
                  x={c.x}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-slate-500 text-[11px] font-mono"
                >
                  {c.label}
                </text>
              )}
              <circle
                cx={c.x}
                cy={c.y}
                r={hoveredIdx === idx ? 6 : 4}
                fill="#FFFFFF"
                stroke="#15803D"
                strokeWidth={2.5}
                className="cursor-pointer transition-all"
                onMouseEnter={() => onHoverIdx(idx)}
                onMouseLeave={() => onHoverIdx(null)}
              />
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div className="mt-1 flex items-center justify-end gap-2 text-xs text-slate-600 tabular-nums">
          <span>ช่วงเวลา {hovered.label}:</span>
          <strong className="font-semibold text-emerald-700">
            {hovered.val.toLocaleString('th-TH')} รายการ
          </strong>
        </div>
      )}
    </div>
  );
}

function DonutSvg({
  data,
  total,
  activeValue,
  onSelect,
}: {
  data: Array<{ name: string; value: number; percentage: number }>;
  total: number;
  activeValue?: string;
  onSelect: (name: string) => void;
}) {
  const size = 156;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const sum = data.reduce((acc, d) => acc + d.value, 0) || 1;

  let offset = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label="กราฟโดนัทแสดงสัดส่วนข้อมูล"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#F1F5F9"
        strokeWidth={strokeWidth}
      />
      {data.map((item, idx) => {
        const segmentLen = (item.value / sum) * circumference;
        const dashArray = `${segmentLen} ${circumference - segmentLen}`;
        const dashOffset = -offset;
        offset += segmentLen;
        const isSelected = activeValue === item.name;
        const isDimmed = activeValue && !isSelected;

        return (
          <circle
            key={item.name}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
            strokeWidth={isSelected ? strokeWidth + 3 : strokeWidth}
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            opacity={isDimmed ? 0.35 : 1}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="cursor-pointer transition-opacity"
            onClick={() => onSelect(item.name)}
          />
        );
      })}
      <text
        x={size / 2}
        y={size / 2 - 2}
        textAnchor="middle"
        className="fill-slate-900 font-display text-xl font-bold tabular-nums"
      >
        {total}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 14}
        textAnchor="middle"
        className="fill-slate-500 text-[11px]"
      >
        รายการ
      </text>
    </svg>
  );
}

function HorizontalBarList({
  items,
  accentColor,
  activeValue,
  onSelect,
}: {
  items: Array<{ name: string; value: number; percentage: number }>;
  accentColor: string;
  activeValue?: string;
  onSelect: (name: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="mt-4 flex h-44 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
        ไม่มีข้อมูลในคอลัมน์นี้
      </div>
    );
  }

  const maxVal = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="mt-4 space-y-2.5">
      {items.map((item) => {
        const widthPct = Math.max(4, (item.value / maxVal) * 100);
        const isSelected = activeValue === item.name;
        return (
          <button
            key={item.name}
            type="button"
            onClick={() => onSelect(item.name)}
            className={`group block w-full rounded-md px-2 py-1 text-left transition-colors cursor-pointer ${
              isSelected ? 'bg-slate-100 ring-1 ring-slate-300' : 'hover:bg-slate-50'
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-800 truncate" title={item.name}>
                {item.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-slate-600 tabular-nums">
                {item.value.toLocaleString('th-TH')} ({item.percentage}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: accentColor,
                  opacity: activeValue && !isSelected ? 0.35 : 0.9,
                }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
