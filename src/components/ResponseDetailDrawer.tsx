import { useEffect } from 'react';
import { X } from 'lucide-react';
import { formatShortHeader } from '../utils/analytics';

interface ResponseDetailDrawerProps {
  row: Record<string, string> | null;
  headers: string[];
  onClose: () => void;
}

export function ResponseDetailDrawer({
  row,
  headers,
  onClose,
}: ResponseDetailDrawerProps) {
  useEffect(() => {
    if (!row) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [row, onClose]);

  if (!row) return null;

  const nonEmptyEntries = headers
    .map((h) => ({ header: h, value: (row[h] ?? '').trim() }))
    .filter((entry) => entry.value !== '');

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px] print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="รายละเอียดรายการคำตอบ"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              รายละเอียดคำตอบฉบับเต็ม
            </h2>
            <p className="text-xs text-slate-500 tabular-nums">
              แสดงข้อมูลที่มีการกรอกทั้งหมด {nonEmptyEntries.length} ฟิลด์
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างรายละเอียด"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <dl className="divide-y divide-slate-100">
            {nonEmptyEntries.map(({ header, value }) => (
              <div key={header} className="py-3 grid grid-cols-1 gap-1 sm:grid-cols-12 sm:gap-4">
                <dt className="sm:col-span-5 text-xs font-medium text-slate-500">
                  {formatShortHeader(header)}
                </dt>
                <dd className="sm:col-span-7 text-sm font-medium text-slate-900 break-words tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
