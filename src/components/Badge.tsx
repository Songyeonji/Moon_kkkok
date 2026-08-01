import type { BookingStatus } from '../lib/types';

const map: Record<BookingStatus, { label: string; cls: string }> = {
  pending: { label: '대기', cls: 'bg-warning-soft text-warning-fg ring-warning/20' },
  approved: { label: '확정', cls: 'bg-success-soft text-success-fg ring-success/20' },
  rejected: { label: '반려', cls: 'bg-danger-soft text-danger-fg ring-danger/20' },
  cancelled: { label: '취소', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export default function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}
