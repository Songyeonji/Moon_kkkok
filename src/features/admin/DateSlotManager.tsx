import { useEffect, useMemo, useState } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { saveBlackouts, updateSettings } from '../../lib/api';
import { formatDateKo, generateSlots, todayKST } from '../../lib/time';
import { WEEKDAY_LABELS, isAvailableWeekday, monthGrid, shiftMonth } from '../../lib/dates';
import { currentMonth } from '../../lib/progress';
import type { Booking, Settings } from '../../lib/types';

interface Props {
  token: string;
  settings: Settings;
  blackouts: string[];
  /** 확정·대기 예약 — 휴무 지정 시 취소될 예약을 미리 보여주기 위해 사용 */
  bookings: Booking[];
  onDone: () => void;
}

export default function DateSlotManager({ token, settings, blackouts, bookings, onDone }: Props) {
  const toast = useToast();

  // ── 레슨 시간 + 신청 가능 요일 ──
  const [draft, setDraft] = useState<Settings>(settings);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  useEffect(() => {
    if (!settingsDirty) setDraft(settings);
  }, [settings, settingsDirty]);

  const previewSlots = generateSlots(draft.startTime, draft.endTime, draft.slotMinutes);

  function patch(p: Partial<Settings>) {
    setDraft((d) => ({ ...d, ...p }));
    setSettingsDirty(true);
  }
  function toggleWeekday(idx: number) {
    const has = draft.availableWeekdays.includes(idx);
    patch({
      availableWeekdays: has
        ? draft.availableWeekdays.filter((x) => x !== idx)
        : [...draft.availableWeekdays, idx].sort(),
    });
  }

  async function handleSaveSettings() {
    if (previewSlots.length === 0) {
      toast.show('시간 설정이 올바르지 않아요. 종료시각/간격을 확인하세요.', 'error');
      return;
    }
    if (draft.availableWeekdays.length === 0) {
      toast.show('신청 가능 요일을 최소 1개 선택하세요.', 'error');
      return;
    }
    setSavingSettings(true);
    try {
      await updateSettings(token, draft);
      toast.show('레슨 설정을 저장했어요.', 'success');
      setSettingsDirty(false);
      onDone();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장 실패', 'error');
    } finally {
      setSavingSettings(false);
    }
  }

  // ── 사용불가(블랙아웃) 날짜 ──
  const [blk, setBlk] = useState<string[]>(blackouts);
  const [blkDirty, setBlkDirty] = useState(false);
  const [savingBlk, setSavingBlk] = useState(false);
  useEffect(() => {
    if (!blkDirty) setBlk(blackouts);
  }, [blackouts, blkDirty]);

  // 달력으로 보여줄 월
  const [blkMonth, setBlkMonth] = useState(currentMonth());
  const weeks = useMemo(() => monthGrid(blkMonth), [blkMonth]);
  const blkSet = new Set(blk);
  const today = todayKST();

  function toggleBlackout(date: string) {
    setBlk((cur) => (cur.includes(date) ? cur.filter((d) => d !== date) : [...cur, date].sort()));
    setBlkDirty(true);
  }

  /** 저장하면 취소될 예약들(휴무로 지정한 날짜에 남아 있는 확정·대기 건) */
  const affected = useMemo(() => {
    const target = new Set(blk);
    return bookings
      .filter((b) => target.has(b.date) && (b.status === 'approved' || b.status === 'pending'))
      .sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
  }, [blk, bookings]);

  const [confirmOpen, setConfirmOpen] = useState(false);

  function requestSaveBlackouts() {
    // 취소될 예약이 있으면 먼저 확인받는다
    if (affected.length > 0) setConfirmOpen(true);
    else void doSaveBlackouts();
  }

  async function doSaveBlackouts() {
    setSavingBlk(true);
    try {
      const cancelled = await saveBlackouts(token, blk);
      toast.show(
        cancelled > 0
          ? `사용불가 날짜를 저장하고 예약 ${cancelled}건을 취소했어요.`
          : '사용불가 날짜를 저장했어요.',
        'success',
      );
      setBlkDirty(false);
      setConfirmOpen(false);
      onDone();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장 실패', 'error');
    } finally {
      setSavingBlk(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* 레슨 시간 + 요일 */}
      <Card title="레슨 시간 · 요일 설정">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">시작</span>
            <input
              type="time"
              value={draft.startTime}
              onChange={(e) => patch({ startTime: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">종료</span>
            <input
              type="time"
              value={draft.endTime}
              onChange={(e) => patch({ endTime: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">간격(분)</span>
            <input
              type="number"
              min={5}
              step={5}
              value={draft.slotMinutes}
              onChange={(e) => patch({ slotMinutes: Number(e.target.value) || 0 })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">슬롯당 정원</span>
            <input
              type="number"
              min={1}
              value={draft.capacityPerSlot}
              onChange={(e) => patch({ capacityPerSlot: Number(e.target.value) || 1 })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>

        <div className="mt-4">
          <span className="mb-1 block text-sm font-medium text-slate-700">신청 가능 요일</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((w, i) => (
              <button
                key={w}
                onClick={() => toggleWeekday(i)}
                className={`h-9 w-9 rounded-lg text-sm font-semibold transition ${
                  draft.availableWeekdays.includes(i)
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">기본값: 월·화·목·금. 선택한 요일이 매달 자동으로 열립니다.</p>
        </div>

        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="mb-2 text-xs text-slate-500">
            미리보기: 총 <b className="text-slate-700">{previewSlots.length}</b>개 슬롯
            {previewSlots.length > 0 && ` (최대 ${previewSlots.length * draft.capacityPerSlot}명)`}
          </p>
          <div className="flex flex-wrap gap-1">
            {previewSlots.map((s) => (
              <span key={s} className="rounded-md bg-white px-1.5 py-0.5 font-mono text-xs text-slate-600 ring-1 ring-slate-200">
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <Button onClick={handleSaveSettings} loading={savingSettings} disabled={!settingsDirty}>
            설정 저장
          </Button>
        </div>
      </Card>

      {/* 사용불가 날짜 */}
      <Card title="사용불가 날짜 지정">
        <p className="mb-3 text-xs text-slate-500">
          레슨하는 요일만 누를 수 있어요. 학교 사정으로 <b>레슨이 없는 날</b>을 누르면 <b className="text-danger">휴무</b>가 되고,
          회원은 그 날 신청할 수 없어요. 다시 누르면 해제됩니다.
        </p>
        {/* 월 이동 */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setBlkMonth(shiftMonth(blkMonth, -1))}
              aria-label="이전 달"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="min-w-[7rem] text-center text-sm font-extrabold text-slate-900">
              {blkMonth.slice(0, 4)}년 {Number(blkMonth.slice(5, 7))}월
            </span>
            <button
              onClick={() => setBlkMonth(shiftMonth(blkMonth, 1))}
              aria-label="다음 달"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <span className="text-[11px] text-slate-500">
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-danger-soft ring-1 ring-danger/30 align-middle" />
            휴무
          </span>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-1 pb-1">
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

        {/* 날짜 격자 — 레슨하는 요일만 누를 수 있음 */}
        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((date) => {
            const inMonth = date.slice(0, 7) === blkMonth;
            const isLessonDay = isAvailableWeekday(settings.availableWeekdays, date);
            const blocked = blkSet.has(date);
            const clickable = inMonth && isLessonDay;
            const isToday = date === today;

            let tone = 'border-transparent bg-transparent text-transparent';
            if (inMonth && !isLessonDay) tone = 'border-slate-100 bg-slate-50 text-slate-300';
            else if (blocked) tone = 'border-danger/30 bg-danger-soft text-danger-fg font-bold line-through';
            else if (clickable) tone = 'border-slate-200 bg-white text-slate-700 hover:border-danger/40 hover:bg-danger-soft';

            return (
              <button
                key={date}
                disabled={!clickable}
                onClick={() => toggleBlackout(date)}
                title={clickable ? (blocked ? '사용가능으로 되돌리기' : '사용불가로 지정') : undefined}
                className={`flex h-10 items-center justify-center rounded-lg border text-sm transition ${tone} ${
                  clickable ? 'cursor-pointer' : 'cursor-default'
                } ${isToday && inMonth ? 'ring-2 ring-brand-500' : ''}`}
              >
                {inMonth ? Number(date.slice(8, 10)) : ''}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {affected.length > 0 && (
            <span className="text-xs font-semibold text-danger-fg">
              저장하면 예약 {affected.length}건이 취소됩니다
            </span>
          )}
          {blkDirty && <span className="text-xs text-warning">저장되지 않은 변경사항</span>}
          <Button onClick={requestSaveBlackouts} loading={savingBlk} disabled={!blkDirty}>
            사용불가 저장
          </Button>
        </div>
      </Card>

      {/* 휴무 지정으로 취소될 예약 확인 */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="예약이 취소됩니다"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={savingBlk}>
              취소
            </Button>
            <Button variant="danger" onClick={doSaveBlackouts} loading={savingBlk}>
              저장하고 {affected.length}건 취소
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            휴무로 지정한 날짜에 이미 <b className="text-danger-fg">{affected.length}건</b>의 예약이 있어요. 저장하면
            아래 예약이 <b>모두 취소</b>됩니다. (취소된 만큼 그 달 신청 횟수는 다시 사용할 수 있어요)
          </p>
          <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {affected.map((b) => (
              <li key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{b.name}</span>
                <span className="text-slate-500">{formatDateKo(b.date)}</span>
                <span className="ml-auto font-mono text-xs text-slate-500">{b.slot}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">회원에게는 별도 알림이 가지 않으니, 필요하면 따로 안내해주세요.</p>
        </div>
      </Modal>
    </div>
  );
}
