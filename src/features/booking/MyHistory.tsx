import { useMemo, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { getState, submitRequest } from '../../lib/api';
import Spinner from '../../components/Spinner';
import Dropdown, { type Option } from '../../components/Dropdown';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/Badge';
import { useToast } from '../../components/Toast';
import { formatDateKo, slotRangeLabel, todayKST } from '../../lib/time';
import { currentMonth, memberMonthStats, quotaFor, remaining } from '../../lib/progress';
import type { AppState, Booking } from '../../lib/types';
import BookingForm from './BookingForm';

const NAME_KEY = 'moon_my_name';

export default function MyHistory() {
  const toast = useToast();
  const { data, loading, error, refresh } = usePolling<AppState>(getState, 12000);
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [changing, setChanging] = useState<Booking | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = todayKST();
  const month = currentMonth();

  const mine = useMemo(() => {
    if (!data || !name) return [];
    return data.bookings
      .filter((b) => b.name === name && (b.status === 'approved' || b.status === 'pending'))
      .sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
  }, [data, name]);

  if (loading && !data) return <Spinner />;
  if (error && !data)
    return <div className="rounded-xl bg-danger-soft p-4 text-sm text-danger-fg">불러오지 못했어요: {error}</div>;
  if (!data) return null;

  const memberOptions: Option[] = data.members.map((m) => ({ value: m.name, label: m.name }));
  const stats = name ? memberMonthStats(data.bookings, name, month) : null;
  const quota = name ? quotaFor(data.quotas, name, month) : 0;
  const left = stats ? remaining(quota, stats.used) : 0;

  function pickName(v: string) {
    setName(v);
    localStorage.setItem(NAME_KEY, v);
  }

  async function handleCancel(b: Booking) {
    setBusyId(b.id);
    try {
      await submitRequest({
        name: b.name,
        date: b.date,
        slot: b.slot,
        requestType: 'cancel',
        supersedesId: b.id,
      });
      toast.show('취소 신청 완료! 관리자 승인 후 취소돼요.', 'success');
      refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '취소 신청 실패', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const upcoming = mine.filter((b) => b.date >= today);
  const past = mine.filter((b) => b.date < today);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="shrink-0">
        <h1 className="text-lg font-extrabold text-slate-900">나의 신청 내역</h1>
        <p className="text-xs text-slate-500">이름을 선택하면 본인 예약을 확인·변경할 수 있어요</p>
      </div>

      <div className="shrink-0">
        <Dropdown value={name} onChange={pickName} options={memberOptions} placeholder="이름을 선택하세요" />
      </div>

      {name && stats && (
        <div className="grid shrink-0 grid-cols-5 gap-1.5 rounded-xl border border-brand-100 bg-brand-50 p-2.5 text-center">
          <Stat label="총 횟수" value={quota} />
          <Stat label="확정" value={stats.approved} tone="success" />
          <Stat label="완료" value={stats.completed} tone="muted" />
          <Stat label="대기" value={stats.pending} tone="warning" />
          <Stat label="남음" value={left} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!name ? (
          <p className="py-12 text-center text-sm text-slate-400">이름을 선택해주세요.</p>
        ) : mine.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">아직 신청 내역이 없어요.</p>
        ) : (
          <div className="space-y-4">
            <Section title={`다가오는 레슨 (${upcoming.length})`}>
              {upcoming.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-slate-400">예정된 레슨이 없어요.</p>
              ) : (
                upcoming.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-800">{formatDateKo(b.date)}</span>
                        <StatusBadge status={b.status} />
                        {b.requestType === 'cancel' && b.status === 'pending' && (
                          <span className="text-[11px] font-semibold text-danger-fg">취소 요청중</span>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">
                        {slotRangeLabel(b.slot, data.settings.slotMinutes)}
                      </p>
                    </div>
                    {b.status === 'approved' && (
                      <div className="flex shrink-0 gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setChanging(b)}>
                          변경
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={busyId === b.id}
                          onClick={() => handleCancel(b)}
                        >
                          취소
                        </Button>
                      </div>
                    )}
                  </li>
                ))
              )}
            </Section>

            {past.length > 0 && (
              <Section title={`지난 레슨 (${past.length})`}>
                {past.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 px-3 py-2 opacity-70">
                    <span className="flex-1 text-sm text-slate-600">{formatDateKo(b.date)}</span>
                    <span className="font-mono text-xs text-slate-400">{b.slot}</span>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </Section>
            )}
          </div>
        )}
      </div>

      <Modal open={!!changing} onClose={() => setChanging(null)} title="예약 변경" size="md">
        {changing && (
          <BookingForm
            state={data}
            initialDate={changing.date}
            onSubmitted={() => {
              setChanging(null);
              refresh();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-sm font-bold text-slate-700">{title}</h2>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {children}
      </ul>
    </section>
  );
}

const toneCls: Record<string, string> = {
  success: 'text-success-fg',
  warning: 'text-warning-fg',
  muted: 'text-slate-500',
  brand: 'text-brand-700',
};

function Stat({ label, value, tone = 'brand' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-white/70 py-1.5">
      <div className={`text-base font-extrabold leading-none ${toneCls[tone]}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
