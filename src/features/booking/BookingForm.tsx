import { useMemo, useState } from 'react';
import Dropdown, { type Option } from '../../components/Dropdown';
import Button from '../../components/Button';
import { useToast } from '../../components/Toast';
import { submitRequest } from '../../lib/api';
import { formatDateKo, generateSlots, slotRangeLabel } from '../../lib/time';
import { availableDatesOf } from '../../lib/dates';
import { currentMonth, memberMonthStats, monthOf, quotaFor, remaining } from '../../lib/progress';
import type { AppState } from '../../lib/types';

interface Props {
  state: AppState;
  /** 달력에서 넘어온 경우 날짜/시간 미리 선택 */
  initialDate?: string;
  initialSlot?: string;
  /** 신청 성공 시(데이터 갱신 + 모달 닫기) */
  onSubmitted: () => void;
}

export default function BookingForm({ state, initialDate = '', initialSlot = '', onSubmitted }: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [date, setDate] = useState(initialDate);
  const [slot, setSlot] = useState(initialSlot);
  const [busy, setBusy] = useState(false);

  const memberOptions: Option[] = useMemo(
    () => state.members.map((m) => ({ value: m.name, label: m.name })),
    [state.members],
  );

  const dateOptions: Option[] = useMemo(
    () => availableDatesOf(state.settings, state.blackouts).map((d) => ({ value: d, label: formatDateKo(d) })),
    [state.settings, state.blackouts],
  );

  const cfg = state.settings;
  const slots = date ? generateSlots(cfg.startTime, cfg.endTime, cfg.slotMinutes) : [];

  // 선택한 회원의 해당 날짜 현재 상태
  const myApproved = useMemo(
    () => state.bookings.find((b) => b.name === name && b.date === date && b.status === 'approved'),
    [state.bookings, name, date],
  );
  const myPending = useMemo(
    () => state.bookings.find((b) => b.name === name && b.date === date && b.status === 'pending'),
    [state.bookings, name, date],
  );

  const capacity = cfg.capacityPerSlot;
  const approvedCountFor = (s: string) =>
    state.bookings.filter((b) => b.date === date && b.slot === s && b.status === 'approved').length;

  const slotOptions: Option[] = useMemo(() => {
    return slots.map((s) => {
      const left = capacity - approvedCountFor(s);
      const mine = myApproved?.slot === s;
      const full = left <= 0 && !mine;
      const suffix = mine ? ' · 내 예약' : full ? ' · 마감' : capacity > 1 ? ` · 남은자리 ${left}` : '';
      return { value: s, label: `${slotRangeLabel(s, cfg.slotMinutes)}${suffix}`, disabled: full };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, state.bookings, myApproved, capacity, cfg]);

  // 월별 신청 현황 (선택한 날짜의 달 기준, 없으면 이번 달)
  const statMonth = date ? monthOf(date) : currentMonth();
  const stats = useMemo(
    () => memberMonthStats(state.bookings, name, statMonth),
    [state.bookings, name, statMonth],
  );
  const quota = name ? quotaFor(state.quotas, name, statMonth) : 0;
  const left = remaining(quota, stats.used);

  const isChange = !!myApproved;
  const quotaBlocked = !isChange && left <= 0;
  const canSubmit = !!name && !!date && !!slot && !busy && slot !== myApproved?.slot && !quotaBlocked;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await submitRequest({
        name,
        date,
        slot,
        requestType: isChange ? 'change' : 'new',
        supersedesId: myApproved?.id,
      });
      toast.show(isChange ? '변경 신청 완료! 관리자 승인 후 반영돼요.' : '신청 완료! 바로 확정되었어요.', 'success');
      onSubmitted();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '신청 실패', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!myApproved) return;
    setBusy(true);
    try {
      await submitRequest({
        name,
        date,
        slot: myApproved.slot,
        requestType: 'cancel',
        supersedesId: myApproved.id,
      });
      toast.show('취소 신청 완료! 관리자 승인 후 취소돼요.', 'success');
      onSubmitted();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '취소 신청 실패', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Dropdown
        label="이름"
        value={name}
        onChange={(v) => setName(v)}
        options={memberOptions}
        placeholder="이름을 선택하세요"
        hint="명단에 없으면 관리자에게 등록을 요청하세요."
      />

      {/* 월별 신청 현황 */}
      {name && (
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-brand-700">
              {statMonth.slice(0, 4)}년 {Number(statMonth.slice(5, 7))}월 현황
            </span>
            <span className="text-xs text-slate-500">
              남은 신청 <b className="text-brand-700">{left}</b>회
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 text-center">
            <Stat label="총 횟수" value={quota} />
            <Stat label="확정" value={stats.approved} tone="success" />
            <Stat label="완료" value={stats.completed} tone="muted" />
            <Stat label="대기" value={stats.pending} tone="warning" />
          </div>
        </div>
      )}

      <Dropdown
        label="날짜"
        value={date}
        onChange={(v) => {
          setDate(v);
          setSlot('');
        }}
        options={dateOptions}
        placeholder={dateOptions.length ? '날짜를 선택하세요' : '신청 가능한 날짜가 없어요'}
        disabled={!name || dateOptions.length === 0}
      />

      {/* 현재 상태 안내 */}
      {date && (myApproved || myPending) && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          {myApproved && (
            <p className="text-success-fg">
              ✅ 현재 확정: <b>{myApproved.slot}</b>
            </p>
          )}
          {myPending && (
            <p className="text-warning-fg">
              ⏳ 신청 대기중: <b>{myPending.slot}</b> ({myPending.requestType === 'cancel' ? '취소' : '예약'} 승인 대기)
            </p>
          )}
        </div>
      )}

      <Dropdown
        label={isChange ? '변경할 시간' : '시간 선택'}
        value={slot}
        onChange={setSlot}
        options={slotOptions}
        placeholder={date ? '시간을 선택하세요' : '먼저 날짜를 선택하세요'}
        disabled={!date}
      />

      {quotaBlocked && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-fg">
          이번 달 신청 가능 횟수({quota}회)를 모두 사용했어요. 기존 예약을 변경하거나 관리자에게 문의하세요.
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={handleSubmit} disabled={!canSubmit} loading={busy} className="flex-1">
          {isChange ? '변경 신청' : '신청하기'}
        </Button>
        {myApproved && (
          <Button variant="danger" onClick={handleCancel} disabled={busy}>
            예약 취소 신청
          </Button>
        )}
      </div>

      <p className="text-xs text-slate-500">
        * 신규 신청은 <b>바로 확정</b>됩니다. <b>변경·취소</b>는 관리자 승인 후 반영되며, 반려되면 이전 예약이 그대로
        유지돼요.
      </p>
    </div>
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
      <div className={`text-lg font-extrabold leading-none ${toneCls[tone]}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
