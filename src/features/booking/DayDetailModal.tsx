import Modal from '../../components/Modal';
import Button from '../../components/Button';
import { formatDateLongKo, generateSlots, slotRangeLabel } from '../../lib/time';
import { dateStatus } from '../../lib/dates';
import type { AppState } from '../../lib/types';

interface Props {
  date: string | null;
  state: AppState;
  onClose: () => void;
  /** 빈 슬롯 신청하기 (날짜/시간 미리 채워 신청 모달 열기) */
  onBook: (date: string, slot: string) => void;
}

export default function DayDetailModal({ date, state, onClose, onBook }: Props) {
  if (!date) return null;

  const cfg = state.settings;
  const slots = generateSlots(cfg.startTime, cfg.endTime, cfg.slotMinutes);
  const status = dateStatus(cfg, state.blackouts, date);
  const bookable = status === 'open';

  return (
    <Modal open onClose={onClose} title={formatDateLongKo(date)} size="lg">
      {status === 'blackout' && (
        <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-fg">
          휴무일 — 이 날짜는 레슨이 없어요.
        </p>
      )}
      {status === 'past' && (
        <p className="mb-3 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-500">지난 날짜예요.</p>
      )}

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
        {slots.map((slot) => {
          const inSlot = state.bookings.filter((b) => b.date === date && b.slot === slot);
          const approved = inSlot.filter((b) => b.status === 'approved');
          const pending = inSlot.filter((b) => b.status === 'pending');
          const free = approved.length < cfg.capacityPerSlot;

          return (
            <li key={slot} className="flex items-center gap-2 px-3 py-2">
              <span className="w-24 shrink-0 font-mono text-xs text-slate-500 sm:text-sm">
                {slotRangeLabel(slot, cfg.slotMinutes)}
              </span>
              <span className="flex flex-1 flex-wrap items-center gap-1.5">
                {approved.map((b) => (
                  <span
                    key={b.id}
                    className="rounded-md bg-success-soft px-1.5 py-0.5 text-xs font-semibold text-success-fg"
                  >
                    {b.name}
                  </span>
                ))}
                {pending.map((b) => (
                  <span
                    key={b.id}
                    className="rounded-md bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning-fg"
                  >
                    {b.name} <span className="opacity-70">신청중</span>
                  </span>
                ))}
                {approved.length === 0 && pending.length === 0 && (
                  <span className="text-xs text-slate-300">빈자리</span>
                )}
              </span>
              {bookable && free && (
                <Button size="sm" variant="secondary" onClick={() => onBook(date, slot)}>
                  신청
                </Button>
              )}
              {bookable && !free && <span className="shrink-0 text-[11px] font-medium text-slate-400">마감</span>}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
