import { useEffect, useMemo, useState } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { useToast } from '../../components/Toast';
import { saveBlackouts, updateSettings } from '../../lib/api';
import { formatDateKo, generateSlots, weekdayKo } from '../../lib/time';
import { WEEKDAY_LABELS, availableDates } from '../../lib/dates';
import type { Settings } from '../../lib/types';

interface Props {
  token: string;
  settings: Settings;
  blackouts: string[];
  onDone: () => void;
}

export default function DateSlotManager({ token, settings, blackouts, onDone }: Props) {
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

  // 요일 규칙상 열리는 후보 날짜(블랙아웃 무시) — 저장된 설정 기준
  const candidates = useMemo(
    () => availableDates(settings.availableWeekdays, []),
    [settings.availableWeekdays],
  );
  const blkSet = new Set(blk);

  function toggleBlackout(date: string) {
    setBlk((cur) => (cur.includes(date) ? cur.filter((d) => d !== date) : [...cur, date].sort()));
    setBlkDirty(true);
  }

  async function handleSaveBlackouts() {
    setSavingBlk(true);
    try {
      await saveBlackouts(token, blk);
      toast.show('사용불가 날짜를 저장했어요.', 'success');
      setBlkDirty(false);
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
          아래는 요일 규칙상 자동으로 열리는 날짜예요. 학교 사정으로 <b>레슨이 없는 날</b>을 눌러 <b className="text-danger">사용불가</b>로
          바꾸면 회원이 그 날은 신청할 수 없어요.
        </p>
        {candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">열리는 날짜가 없어요. (요일 설정을 확인하세요)</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {candidates.map((date) => {
              const blocked = blkSet.has(date);
              return (
                <li
                  key={date}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                    blocked ? 'border-danger/30 bg-danger-soft' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className={`font-medium ${blocked ? 'text-danger-fg line-through' : 'text-slate-800'}`}>
                    {formatDateKo(date)} <span className="text-xs opacity-70">{weekdayKo(date)}</span>
                  </span>
                  <button
                    onClick={() => toggleBlackout(date)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      blocked
                        ? 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                        : 'bg-danger-soft text-danger-fg hover:brightness-95'
                    }`}
                  >
                    {blocked ? '사용가능으로' : '사용불가'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          {blkDirty && <span className="text-xs text-warning">저장되지 않은 변경사항</span>}
          <Button onClick={handleSaveBlackouts} loading={savingBlk} disabled={!blkDirty}>
            사용불가 저장
          </Button>
        </div>
      </Card>
    </div>
  );
}
