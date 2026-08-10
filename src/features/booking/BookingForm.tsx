import { useMemo, useState } from 'react';
import Dropdown, { type Option } from '../../components/Dropdown';
import Button from '../../components/Button';
import { useToast } from '../../components/Toast';
import { submitRequest } from '../../lib/api';
import { formatDateKo, generateSlots, slotRangeLabel } from '../../lib/time';
import { availableDatesOf } from '../../lib/dates';
import {
  adjustFor,
  currentMonth,
  memberMonthStats,
  monthOf,
  monthlyRoster,
  quotaFor,
  remaining,
} from '../../lib/progress';
import type { AppState, Booking } from '../../lib/types';

interface Props {
  state: AppState;
  /** 달력에서 넘어온 경우 날짜/시간 미리 선택 */
  initialDate?: string;
  initialSlot?: string;
  /**
   * 지정하면 **그 예약의 시간을 바꾸는** 변경 신청이 된다(관리자 승인 필요).
   * 없으면 항상 새 신청 → 같은 날 다른 시간대도 연달아 신청할 수 있다.
   */
  changeTarget?: Booking;
  /** 신청 성공 시(데이터 갱신 + 모달 닫기) */
  onSubmitted: () => void;
}

export default function BookingForm({
  state,
  initialDate = '',
  initialSlot = '',
  changeTarget,
  onSubmitted,
}: Props) {
  const toast = useToast();
  const [name, setName] = useState(changeTarget?.name ?? '');
  const [date, setDate] = useState(initialDate);
  const [slot, setSlot] = useState(initialSlot);
  const [busy, setBusy] = useState(false);

  const dateOptions: Option[] = useMemo(
    () => availableDatesOf(state.settings, state.blackouts).map((d) => ({ value: d, label: formatDateKo(d) })),
    [state.settings, state.blackouts],
  );

  // 신청 가능한 날짜 범위(이번 달·다음 달)에 걸친 모든 달의 명단을 합쳐서 보여준다.
  // → 관리자가 다음 달 명단을 미리 만들어두면(예: 8월 말에 9월 명단 준비), 달이 바뀌기 전에도
  //   회원이 바로 다음 달 날짜를 신청할 수 있다.
  const bookableMonths = useMemo(() => {
    const months = new Set(dateOptions.map((o) => o.value.slice(0, 7)));
    return months.size ? months : new Set([currentMonth()]);
  }, [dateOptions]);

  const roster = useMemo(() => {
    const names = new Set<string>();
    bookableMonths.forEach((m) => monthlyRoster(state.quotas, m).forEach((n) => names.add(n)));
    return names;
  }, [state.quotas, bookableMonths]);

  const memberOptions: Option[] = useMemo(
    () => state.members.filter((m) => roster.has(m.name)).map((m) => ({ value: m.name, label: m.name })),
    [state.members, roster],
  );

  const monthsLabel = useMemo(
    () =>
      [...bookableMonths]
        .sort()
        .map((m) => `${Number(m.slice(5, 7))}월`)
        .join('·'),
    [bookableMonths],
  );

  const cfg = state.settings;
  const slots = date ? generateSlots(cfg.startTime, cfg.endTime, cfg.slotMinutes) : [];

  // 선택한 회원이 그 날짜에 이미 가진 예약들 (같은 날 여러 타임 가능)
  const myOnDate = useMemo(
    () =>
      state.bookings
        .filter((b) => b.name === name && b.date === date && (b.status === 'approved' || b.status === 'pending'))
        .sort((a, b) => a.slot.localeCompare(b.slot)),
    [state.bookings, name, date],
  );

  const capacity = cfg.capacityPerSlot;

  const slotOptions: Option[] = useMemo(() => {
    const mineSlots = new Set(myOnDate.map((b) => b.slot));
    return slots.map((s) => {
      const taken = state.bookings.filter(
        (b) => b.date === date && b.slot === s && b.status === 'approved',
      ).length;
      const left = capacity - taken;
      // 변경 모드에서는 원래 내 시간도 고를 수 있게 열어둔다
      const isMyTarget = changeTarget?.slot === s;
      const mine = mineSlots.has(s) && !isMyTarget;
      const full = left <= 0 && !isMyTarget && !mine;
      const suffix = mine
        ? ' · 이미 신청함'
        : isMyTarget
          ? ' · 현재 예약'
          : full
            ? ' · 마감'
            : capacity > 1
              ? ` · 남은자리 ${left}`
              : '';
      return {
        value: s,
        label: `${slotRangeLabel(s, cfg.slotMinutes)}${suffix}`,
        // 이미 내가 신청한 시간은 중복 신청 불가
        disabled: full || mine,
      };
    });
  }, [slots, state.bookings, myOnDate, capacity, cfg, date, changeTarget]);

  // 월별 신청 현황 (선택한 날짜의 달 기준, 없으면 이번 달)
  const statMonth = date ? monthOf(date) : currentMonth();
  const stats = useMemo(
    () => memberMonthStats(state.bookings, name, statMonth, adjustFor(state.quotas, name, statMonth)),
    [state.bookings, state.quotas, name, statMonth],
  );
  const quota = name ? quotaFor(state.quotas, name, statMonth) : 0;
  const left = remaining(quota, stats.used);

  const isChange = !!changeTarget;
  // 변경은 횟수를 더 쓰지 않으므로 잔여 횟수와 무관
  const quotaBlocked = !isChange && left <= 0;
  const canSubmit =
    !!name && !!date && !!slot && !busy && !quotaBlocked && (!isChange || slot !== changeTarget?.slot);

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await submitRequest({
        name,
        date,
        slot,
        requestType: isChange ? 'change' : 'new',
        supersedesId: changeTarget?.id,
      });
      toast.show(isChange ? '변경 신청 완료! 관리자 승인 후 반영돼요.' : '신청 완료! 바로 확정되었어요.', 'success');
      onSubmitted();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '신청 실패', 'error');
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
        placeholder={memberOptions.length ? '이름을 선택하세요' : '명단이 아직 없어요'}
        hint={`${monthsLabel} 명단 ${memberOptions.length}명 · 명단에 없으면 관리자에게 문의하세요.`}
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

      {/* 이 날짜에 이미 잡아둔 예약 — 같은 날 여러 타임도 가능 */}
      {date && myOnDate.length > 0 && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="mb-1 text-xs font-semibold text-slate-500">이 날 내 예약 {myOnDate.length}건</p>
          <div className="flex flex-wrap gap-1.5">
            {myOnDate.map((b) => (
              <span
                key={b.id}
                className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                  b.id === changeTarget?.id
                    ? 'bg-brand-100 text-brand-700'
                    : 'bg-success-soft text-success-fg'
                }`}
              >
                {b.slot}
                {b.id === changeTarget?.id && ' (변경 중)'}
              </span>
            ))}
          </div>
          {!isChange && <p className="mt-1.5 text-xs text-slate-500">다른 시간을 골라 연달아 신청할 수 있어요.</p>}
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
          {quota === 0
            ? `${Number(statMonth.slice(5, 7))}월 신청 대상 명단에 없어요. 관리자에게 문의하세요.`
            : `이번 달 신청 가능 횟수(${quota}회)를 모두 사용했어요. 기존 예약을 변경하거나 관리자에게 문의하세요.`}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={handleSubmit} disabled={!canSubmit} loading={busy} className="flex-1">
          {isChange ? '시간 변경' : '신청하기'}
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        * 신청·변경·취소 모두 <b>바로 반영</b>됩니다. 같은 날 <b>여러 시간대</b>도 신청할 수 있고, 한 타임에는 한 명만
        들어갑니다.
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
