import { useMemo, useState } from 'react';
import Card from '../../components/Card';
import { useToast } from '../../components/Toast';
import { setAdjust, setPaid } from '../../lib/api';
import { currentMonth, memberMonthStats } from '../../lib/progress';
import type { Booking, Member, Quota } from '../../lib/types';

interface AdminData {
  quotas: Quota[];
  [key: string]: unknown;
}

interface Props {
  token: string;
  quotas: Quota[];
  bookings: Booking[]; // pending + approved
  members: Member[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  optimistic: (patch: (prev: any) => any, save: () => Promise<unknown>) => void;
}

/** 월별 현황 — 조회 + 입금 확인. 명단/횟수 변경은 [회원 관리] 에서 합니다. */
export default function MonthlyStatus({ token, quotas, bookings, members, optimistic }: Props) {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());

  /** 비활성화(또는 삭제)된 회원은 월별 현황에서 숨긴다 */
  const activeNames = useMemo(
    () => new Set(members.filter((m) => m.active).map((m) => m.name)),
    [members],
  );

  const rows = useMemo(
    () =>
      quotas
        .filter((q) => q.month === month && activeNames.has(q.name))
        .map((q) => ({ name: q.name, quota: q.quota, paid: !!q.paid, adjust: q.adjust ?? 0 }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [quotas, month, activeNames],
  );

  /** 화면은 즉시 바뀌고 저장은 백그라운드 — 느린 왕복을 기다리지 않는다 */
  function togglePaid(name: string, next: boolean) {
    optimistic(
      (prev: AdminData) => ({
        ...prev,
        quotas: prev.quotas.map((q) => (q.month === month && q.name === name ? { ...q, paid: next } : q)),
      }),
      async () => {
        try {
          await setPaid(token, month, name, next);
        } catch (e) {
          toast.show(e instanceof Error ? e.message : '입금 상태 저장 실패', 'error');
          throw e;
        }
      },
    );
  }

  /** 사용 횟수를 손으로 +1 / -1 (레슨은 했는데 앱에 없거나, 잘못 잡힌 경우 보정) */
  function bumpAdjust(name: string, delta: number) {
    const cur = rows.find((r) => r.name === name)?.adjust ?? 0;
    const next = cur + delta;
    optimistic(
      (prev: AdminData) => ({
        ...prev,
        quotas: prev.quotas.map((q) => (q.month === month && q.name === name ? { ...q, adjust: next } : q)),
      }),
      async () => {
        try {
          await setAdjust(token, month, name, next);
        } catch (e) {
          toast.show(e instanceof Error ? e.message : '횟수 조정 실패', 'error');
          throw e;
        }
      },
    );
  }

  const total = rows.reduce((s, r) => s + r.quota, 0);
  const done = rows.reduce((s, r) => s + memberMonthStats(bookings, r.name, month, r.adjust).used, 0);
  const paidCount = rows.filter((r) => r.paid).length;

  return (
    <Card
      title="월별 현황"
      right={
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      }
    >
      <div className="mb-3 grid grid-cols-4 gap-2 rounded-xl border border-brand-100 bg-brand-50 p-2.5 text-center">
        <Stat label="명단" value={`${rows.length}명`} />
        <Stat label="배정 횟수" value={`${total}회`} />
        <Stat label="신청 완료" value={`${done}회`} />
        <Stat label="입금" value={`${paidCount}/${rows.length}`} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-2 font-semibold">회원</th>
              <th className="px-2 py-2 text-center font-semibold">횟수</th>
              <th className="px-2 py-2 text-center font-semibold">확정</th>
              <th className="px-2 py-2 text-center font-semibold">완료</th>
              <th className="px-2 py-2 text-center font-semibold">사용</th>
              <th className="px-2 py-2 text-center font-semibold">남음</th>
              <th className="px-2 py-2 text-center font-semibold">입금</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = memberMonthStats(bookings, r.name, month, r.adjust);
              const left = Math.max(0, r.quota - s.used);
              return (
                <tr key={r.name} className="border-b border-slate-100">
                  <td className="py-2 pr-2 font-medium text-slate-800">{r.name}</td>
                  <td className="px-2 py-2 text-center text-slate-600">{r.quota}</td>
                  <td className="px-2 py-2 text-center font-semibold text-success-fg">{s.approved}</td>
                  <td className="px-2 py-2 text-center text-slate-500">{s.completed}</td>
                  {/* 사용 횟수: 예약 건수 + 관리자 보정. −/+ 로 직접 조정 */}
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => bumpAdjust(r.name, -1)}
                        title="사용 횟수 1회 되돌리기"
                        className="h-6 w-6 rounded-md bg-slate-100 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
                      >
                        −
                      </button>
                      <span className="min-w-[2.5rem] text-center font-semibold text-slate-700">
                        {s.used}
                        {r.adjust !== 0 && (
                          <span className="ml-0.5 text-[10px] font-normal text-brand-600">
                            ({r.adjust > 0 ? '+' : ''}
                            {r.adjust})
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => bumpAdjust(r.name, 1)}
                        title="사용 횟수 1회 차감"
                        className="h-6 w-6 rounded-md bg-slate-100 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center font-bold text-brand-700">{left}</td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => togglePaid(r.name, !r.paid)}
                      title="누르면 입금 상태가 바뀝니다"
                      className={`rounded-lg px-2 py-1 text-xs font-bold transition ${
                        r.paid
                          ? 'bg-success-soft text-success-fg hover:brightness-95'
                          : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {r.paid ? '완료' : '미입금'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  {Number(month.slice(5, 7))}월 명단이 없어요. <b>회원 관리</b> 탭에서 추가하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/70 py-1.5">
      <div className="text-base font-extrabold leading-none text-brand-700">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
