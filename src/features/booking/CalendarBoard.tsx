import { useMemo, useState } from 'react';
import { generateSlots, todayKST } from '../../lib/time';
import { currentMonth } from '../../lib/progress';
import { dateStatus, monthGrid, shiftMonth, WEEKDAY_LABELS } from '../../lib/dates';
import type { AppState } from '../../lib/types';

interface Props {
  state: AppState;
  onPickDate: (date: string) => void;
}

interface DayInfo {
  approved: number;
  pending: number;
}

export default function CalendarBoard({ state, onPickDate }: Props) {
  const [ym, setYm] = useState(currentMonth());
  const today = todayKST();

  const slotsPerDay = useMemo(
    () => generateSlots(state.settings.startTime, state.settings.endTime, state.settings.slotMinutes).length,
    [state.settings],
  );
  const totalPerDay = slotsPerDay * state.settings.capacityPerSlot;

  const byDate = useMemo(() => {
    const map = new Map<string, DayInfo>();
    for (const b of state.bookings) {
      if (b.status !== 'approved' && b.status !== 'pending') continue;
      const info = map.get(b.date) ?? { approved: 0, pending: 0 };
      if (b.status === 'approved') info.approved += 1;
      else info.pending += 1;
      map.set(b.date, info);
    }
    return map;
  }, [state.bookings]);

  const weeks = useMemo(() => monthGrid(ym), [ym]);

  return (
    <div className="flex h-full flex-col">
      {/* 월 이동 */}
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-1">
          <NavBtn label="이전 달" onClick={() => setYm(shiftMonth(ym, -1))} dir="prev" />
          <span className="min-w-[7.5rem] text-center text-base font-extrabold text-slate-900">
            {ym.slice(0, 4)}년 {Number(ym.slice(5, 7))}월
          </span>
          <NavBtn label="다음 달" onClick={() => setYm(shiftMonth(ym, 1))} dir="next" />
          {ym !== currentMonth() && (
            <button
              onClick={() => setYm(currentMonth())}
              className="ml-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
            >
              오늘
            </button>
          )}
        </div>
        <div className="flex items-center gap-2.5 text-[11px] text-slate-500">
          <Legend className="bg-success" label="확정" />
          <Legend className="bg-warning" label="대기" />
          <Legend className="bg-danger-soft ring-1 ring-danger/30" label="휴무" />
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid shrink-0 grid-cols-7 gap-1 pb-1">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-xs font-bold ${
              i === 0 ? 'text-danger' : i === 6 ? 'text-blue-600' : 'text-slate-400'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 격자 */}
      <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-1">
        {weeks.flat().map((date) => {
          const inMonth = date.slice(0, 7) === ym;
          const status = dateStatus(state.settings, state.blackouts, date);
          const info = byDate.get(date);
          const isToday = date === today;
          const clickable = inMonth && (status === 'open' || (info?.approved ?? 0) > 0);
          const dayNum = Number(date.slice(8, 10));
          const full = (info?.approved ?? 0) >= totalPerDay && totalPerDay > 0;

          const base =
            'relative flex min-h-[3.25rem] flex-col items-center justify-start rounded-lg border px-0.5 py-1 text-center transition';
          let tone = 'border-slate-200 bg-white';
          if (!inMonth) tone = 'border-transparent bg-transparent';
          else if (status === 'blackout') tone = 'border-danger/25 bg-danger-soft';
          else if (status === 'off') tone = 'border-slate-100 bg-slate-50';
          else if (status === 'past') tone = 'border-slate-100 bg-slate-50/60';
          else if (full) tone = 'border-slate-200 bg-slate-100';
          else tone = 'border-slate-200 bg-white hover:border-brand-400 hover:bg-brand-50';

          return (
            <button
              key={date}
              disabled={!clickable}
              onClick={() => clickable && onPickDate(date)}
              className={`${base} ${tone} ${clickable ? 'cursor-pointer' : 'cursor-default'} ${
                isToday ? 'ring-2 ring-brand-500' : ''
              }`}
            >
              {inMonth && (
                <>
                  <span
                    className={`text-xs font-bold leading-tight ${
                      status === 'past' || status === 'off'
                        ? 'text-slate-300'
                        : status === 'blackout'
                          ? 'text-danger-fg'
                          : 'text-slate-700'
                    }`}
                  >
                    {dayNum}
                  </span>

                  {status === 'blackout' && (
                    <span className="mt-0.5 text-[10px] font-semibold text-danger-fg">휴무</span>
                  )}

                  {status !== 'blackout' && status !== 'off' && (
                    <span className="mt-0.5 flex flex-col items-center gap-0.5">
                      {info?.approved ? (
                        <span
                          className={`rounded px-1 text-[10px] font-bold leading-tight ${
                            status === 'past'
                              ? 'bg-slate-100 text-slate-400'
                              : 'bg-success-soft text-success-fg'
                          }`}
                        >
                          {info.approved}/{totalPerDay}
                        </span>
                      ) : status === 'open' ? (
                        <span className="text-[10px] leading-tight text-slate-300">0/{totalPerDay}</span>
                      ) : null}
                      {!!info?.pending && (
                        <span className="rounded bg-warning-soft px-1 text-[10px] font-bold leading-tight text-warning-fg">
                          대기 {info.pending}
                        </span>
                      )}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavBtn({ label, onClick, dir }: { label: string; onClick: () => void; dir: 'prev' | 'next' }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d={dir === 'prev' ? 'M12 5l-5 5 5 5' : 'M8 5l5 5-5 5'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}
