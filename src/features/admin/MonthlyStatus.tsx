import { useEffect, useMemo, useState } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Dropdown from '../../components/Dropdown';
import { useToast } from '../../components/Toast';
import { saveQuotas } from '../../lib/api';
import { QUOTA_OPTIONS, currentMonth, memberMonthStats, quotaFor } from '../../lib/progress';
import type { Booking, Member, Quota } from '../../lib/types';

interface Props {
  token: string;
  members: Member[];
  quotas: Quota[];
  bookings: Booking[]; // pending + approved
  onDone: () => void;
}

export default function MonthlyStatus({ token, members, quotas, bookings, onDone }: Props) {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeMembers = useMemo(() => members.filter((m) => m.active), [members]);

  // 월/원본 quota 변경 시(미수정 상태일 때) draft 동기화
  useEffect(() => {
    if (dirty) return;
    const next: Record<string, number> = {};
    activeMembers.forEach((m) => (next[m.name] = quotaFor(quotas, m.name, month)));
    setDraft(next);
  }, [activeMembers, quotas, month, dirty]);

  function setQuota(name: string, q: number) {
    setDraft((d) => ({ ...d, [name]: q }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const entries = activeMembers.map((m) => ({ name: m.name, quota: draft[m.name] ?? 0 }));
      await saveQuotas(token, month, entries);
      toast.show(`${month} 신청 횟수를 저장했어요.`, 'success');
      setDirty(false);
      onDone();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장 실패', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="월별 신청 횟수 · 현황"
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
      <p className="mb-3 text-xs text-slate-500">
        매달 학교 일정에 따라 회원별 신청 횟수(예: 4·8·10회)를 정하세요. 회원은 그 횟수만큼 원하는 날짜에 신청합니다.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-2 font-semibold">회원</th>
              <th className="px-2 py-2 font-semibold">신청 횟수</th>
              <th className="px-2 py-2 text-center font-semibold">확정</th>
              <th className="px-2 py-2 text-center font-semibold">완료</th>
              <th className="px-2 py-2 text-center font-semibold">대기</th>
              <th className="px-2 py-2 text-center font-semibold">남음</th>
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((m) => {
              const s = memberMonthStats(bookings, m.name, month);
              const q = draft[m.name] ?? 0;
              const left = Math.max(0, q - s.used);
              const options = QUOTA_OPTIONS.includes(q) ? QUOTA_OPTIONS : [q, ...QUOTA_OPTIONS];
              return (
                <tr key={m.name} className="border-b border-slate-100">
                  <td className="py-2 pr-2 font-medium text-slate-800">{m.name}</td>
                  <td className="px-2 py-2">
                    <Dropdown
                      size="sm"
                      className="w-24"
                      value={String(q)}
                      onChange={(v) => setQuota(m.name, Number(v))}
                      options={options.map((o) => ({ value: String(o), label: `${o}회` }))}
                    />
                  </td>
                  <td className="px-2 py-2 text-center font-semibold text-success-fg">{s.approved}</td>
                  <td className="px-2 py-2 text-center text-slate-500">{s.completed}</td>
                  <td className="px-2 py-2 text-center text-warning-fg">{s.pending}</td>
                  <td className="px-2 py-2 text-center font-bold text-brand-700">{left}</td>
                </tr>
              );
            })}
            {activeMembers.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
                  활성 회원이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        {dirty && <span className="text-xs text-warning">저장되지 않은 변경사항</span>}
        <Button onClick={handleSave} loading={saving} disabled={!dirty}>
          횟수 저장
        </Button>
      </div>
    </Card>
  );
}
