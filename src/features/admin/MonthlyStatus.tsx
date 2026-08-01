import { useEffect, useMemo, useState } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Dropdown from '../../components/Dropdown';
import { useToast } from '../../components/Toast';
import { saveQuotas } from '../../lib/api';
import {
  DEFAULT_MONTHLY_QUOTA,
  QUOTA_OPTIONS,
  currentMonth,
  memberMonthStats,
} from '../../lib/progress';
import { dayjs, KST } from '../../lib/time';
import type { Booking, Member, Quota } from '../../lib/types';

interface Props {
  token: string;
  members: Member[];
  quotas: Quota[];
  bookings: Booking[]; // pending + approved
  onDone: () => void;
}

interface Row {
  name: string;
  quota: number;
}

function prevMonth(ym: string) {
  return dayjs.tz(`${ym}-01`, KST).subtract(1, 'month').format('YYYY-MM');
}

export default function MonthlyStatus({ token, members, quotas, bookings, onDone }: Props) {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addName, setAddName] = useState('');

  // 그 달 명단 = Quotas 의 그 달 행들
  const savedRows = useMemo(
    () =>
      quotas
        .filter((q) => q.month === month)
        .map((q) => ({ name: q.name, quota: q.quota }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [quotas, month],
  );

  useEffect(() => {
    if (!dirty) setRows(savedRows);
  }, [savedRows, dirty]);

  const inRoster = new Set(rows.map((r) => r.name));
  const addable = members
    .filter((m) => m.active && !inRoster.has(m.name))
    .map((m) => ({ value: m.name, label: m.name }));

  function setQuota(name: string, q: number) {
    setRows((cur) => cur.map((r) => (r.name === name ? { ...r, quota: q } : r)));
    setDirty(true);
  }

  function addRow(name: string) {
    if (!name || inRoster.has(name)) return;
    setRows((cur) =>
      [...cur, { name, quota: DEFAULT_MONTHLY_QUOTA }].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    );
    setAddName('');
    setDirty(true);
  }

  function removeRow(name: string) {
    setRows((cur) => cur.filter((r) => r.name !== name));
    setDirty(true);
  }

  function copyPrevMonth() {
    const pm = prevMonth(month);
    const prev = quotas.filter((q) => q.month === pm).map((q) => ({ name: q.name, quota: q.quota }));
    if (prev.length === 0) {
      toast.show(`${Number(pm.slice(5, 7))}월 명단이 없어요.`, 'info');
      return;
    }
    setRows(prev.sort((a, b) => a.name.localeCompare(b.name, 'ko')));
    setDirty(true);
    toast.show(`${Number(pm.slice(5, 7))}월 명단 ${prev.length}명을 불러왔어요. (저장 필요)`, 'info');
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveQuotas(token, month, rows);
      toast.show(`${Number(month.slice(5, 7))}월 명단을 저장했어요.`, 'success');
      setDirty(false);
      onDone();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장 실패', 'error');
    } finally {
      setSaving(false);
    }
  }

  const totalLessons = rows.reduce((s, r) => s + r.quota, 0);

  return (
    <Card
      title="월별 명단 · 횟수"
      right={
        <input
          type="month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setDirty(false);
          }}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          매월 참여 회원과 횟수가 다릅니다. <b>이 달 명단에 있는 사람만</b> 신청할 수 있어요.
        </p>
        <Button size="sm" variant="secondary" onClick={copyPrevMonth}>
          지난달 명단 복사
        </Button>
      </div>

      <div className="mb-3 flex items-end gap-2">
        <Dropdown
          className="max-w-[14rem]"
          size="sm"
          value={addName}
          onChange={addRow}
          options={addable}
          placeholder={addable.length ? '회원 추가...' : '추가할 회원 없음'}
        />
        <span className="pb-1.5 text-xs text-slate-500">
          {rows.length}명 · 총 {totalLessons}회
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-2 font-semibold">회원</th>
              <th className="px-2 py-2 font-semibold">횟수</th>
              <th className="px-2 py-2 text-center font-semibold">확정</th>
              <th className="px-2 py-2 text-center font-semibold">완료</th>
              <th className="px-2 py-2 text-center font-semibold">대기</th>
              <th className="px-2 py-2 text-center font-semibold">남음</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = memberMonthStats(bookings, r.name, month);
              const left = Math.max(0, r.quota - s.used);
              const options = QUOTA_OPTIONS.includes(r.quota) ? QUOTA_OPTIONS : [r.quota, ...QUOTA_OPTIONS];
              return (
                <tr key={r.name} className="border-b border-slate-100">
                  <td className="py-2 pr-2 font-medium text-slate-800">{r.name}</td>
                  <td className="px-2 py-2">
                    <Dropdown
                      size="sm"
                      className="w-24"
                      value={String(r.quota)}
                      onChange={(v) => setQuota(r.name, Number(v))}
                      options={options.map((o) => ({ value: String(o), label: `${o}회` }))}
                    />
                  </td>
                  <td className="px-2 py-2 text-center font-semibold text-success-fg">{s.approved}</td>
                  <td className="px-2 py-2 text-center text-slate-500">{s.completed}</td>
                  <td className="px-2 py-2 text-center text-warning-fg">{s.pending}</td>
                  <td className="px-2 py-2 text-center font-bold text-brand-700">{left}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => removeRow(r.name)}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition hover:bg-danger-soft hover:text-danger-fg"
                    >
                      제거
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  이 달 명단이 비어 있어요. 위에서 회원을 추가하거나 <b>지난달 명단 복사</b>를 눌러보세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        {dirty && <span className="text-xs text-warning">저장되지 않은 변경사항</span>}
        <Button onClick={handleSave} loading={saving} disabled={!dirty}>
          명단 저장
        </Button>
      </div>
    </Card>
  );
}
