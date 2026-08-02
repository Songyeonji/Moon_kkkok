import { useMemo, useState } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import Dropdown from '../../components/Dropdown';
import { useToast } from '../../components/Toast';
import { addMember, saveQuotas, toggleMember } from '../../lib/api';
import { DEFAULT_MONTHLY_QUOTA, QUOTA_OPTIONS, currentMonth } from '../../lib/progress';
import { shiftMonth } from '../../lib/dates';
import type { Member, Quota } from '../../lib/types';

interface AdminData {
  members: Member[];
  quotas: Quota[];
  [key: string]: unknown;
}

interface Props {
  token: string;
  members: Member[];
  quotas: Quota[];
  onDone: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  optimistic: (patch: (prev: any) => any, save: () => Promise<unknown>) => void;
}

export default function MemberManager({ token, members, quotas, onDone, optimistic }: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // 추가 확인 모달
  const [pending, setPending] = useState<string | null>(null);
  const [addToMonth, setAddToMonth] = useState(true);
  const [quota, setQuota] = useState(DEFAULT_MONTHLY_QUOTA);

  // 횟수 수정 모달
  const [editing, setEditing] = useState<Member | null>(null);
  const [editQuota, setEditQuota] = useState(DEFAULT_MONTHLY_QUOTA);

  const month = currentMonth();
  const monthLabel = `${Number(month.slice(5, 7))}월`;

  /** 이번 달 명단(이름 → 횟수) */
  const monthQuota = useMemo(() => {
    const map = new Map<string, number>();
    quotas.filter((q) => q.month === month).forEach((q) => map.set(q.name, q.quota));
    return map;
  }, [quotas, month]);

  const sorted = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [members],
  );

  function openAddModal() {
    const clean = name.trim();
    if (!clean) return;
    if (members.some((m) => m.name === clean)) {
      toast.show(`'${clean}' 은(는) 이미 명단에 있어요.`, 'info');
      return;
    }
    setQuota(DEFAULT_MONTHLY_QUOTA);
    setAddToMonth(true);
    setPending(clean);
  }

  async function confirmAdd() {
    if (!pending) return;
    setBusy(true);
    try {
      await addMember(token, pending);
      if (addToMonth) {
        const entries = [
          ...quotas.filter((q) => q.month === month).map((q) => ({ name: q.name, quota: q.quota })),
          { name: pending, quota },
        ];
        await saveQuotas(token, month, entries);
      }
      toast.show(
        addToMonth ? `'${pending}' 추가 · ${monthLabel} 명단 ${quota}회로 등록했어요.` : `'${pending}' 을(를) 회원 명단에 추가했어요.`,
        'success',
      );
      setPending(null);
      setName('');
      onDone();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '추가 실패', 'error');
    } finally {
      setBusy(false);
    }
  }

  function handleToggleActive(m: Member, next: boolean) {
    optimistic(
      (prev: AdminData) => ({
        ...prev,
        members: prev.members.map((x) => (x.name === m.name ? { ...x, active: next } : x)),
      }),
      async () => {
        try {
          await toggleMember(token, m.name, next);
        } catch (e) {
          toast.show(e instanceof Error ? e.message : '변경 실패', 'error');
          throw e;
        }
      },
    );
  }

  function openEdit(m: Member) {
    setEditQuota(monthQuota.get(m.name) ?? DEFAULT_MONTHLY_QUOTA);
    setEditing(m);
  }

  /** 이번 달 횟수 저장 (명단에 없으면 추가됨) — 화면 즉시 반영 */
  function saveEdit() {
    if (!editing) return;
    const target = editing;
    const rest = quotas
      .filter((q) => q.month === month && q.name !== target.name)
      .map((q) => ({ name: q.name, quota: q.quota }));
    const entries = [...rest, { name: target.name, quota: editQuota }];
    setEditing(null);
    toast.show(`${target.name} · ${monthLabel} ${editQuota}회로 저장했어요.`, 'success');

    optimistic(
      (prev: AdminData) => {
        const others = prev.quotas.filter((q) => !(q.month === month && q.name === target.name));
        const before = prev.quotas.find((q) => q.month === month && q.name === target.name);
        return {
          ...prev,
          quotas: [...others, { month, name: target.name, quota: editQuota, paid: !!before?.paid }],
        };
      },
      async () => {
        try {
          await saveQuotas(token, month, entries);
        } catch (e) {
          toast.show(e instanceof Error ? e.message : '저장 실패', 'error');
          throw e;
        }
      },
    );
  }

  /** 이번 달 명단에서 빼기 — 화면 즉시 반영 */
  function removeFromMonth() {
    if (!editing) return;
    const target = editing;
    const rest = quotas
      .filter((q) => q.month === month && q.name !== target.name)
      .map((q) => ({ name: q.name, quota: q.quota }));
    setEditing(null);
    toast.show(`${target.name} 을(를) ${monthLabel} 명단에서 뺐어요.`, 'success');

    optimistic(
      (prev: AdminData) => ({
        ...prev,
        quotas: prev.quotas.filter((q) => !(q.month === month && q.name === target.name)),
      }),
      async () => {
        try {
          await saveQuotas(token, month, rest);
        } catch (e) {
          toast.show(e instanceof Error ? e.message : '변경 실패', 'error');
          throw e;
        }
      },
    );
  }

  /** 지난달 명단·횟수를 이번 달로 복사 */
  async function copyPrevMonth() {
    const pm = shiftMonth(month, -1);
    const prev = quotas.filter((q) => q.month === pm).map((q) => ({ name: q.name, quota: q.quota }));
    if (prev.length === 0) {
      toast.show(`${Number(pm.slice(5, 7))}월 명단이 없어요.`, 'info');
      return;
    }
    setBusy(true);
    try {
      await saveQuotas(token, month, prev);
      toast.show(`${Number(pm.slice(5, 7))}월 명단 ${prev.length}명을 ${monthLabel}로 복사했어요.`, 'success');
      onDone();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '복사 실패', 'error');
    } finally {
      setBusy(false);
    }
  }

  const activeCount = members.filter((m) => m.active).length;

  return (
    <Card title={`회원 명단 (활성 ${activeCount}명 · ${monthLabel} 명단 ${monthQuota.size}명)`}>
      <div className="mb-2 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && openAddModal()}
          placeholder="회원 이름 추가"
          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <Button onClick={openAddModal} disabled={!name.trim()}>
          추가
        </Button>
      </div>

      {/* 매달 반복 작업 줄이기: 지난달 명단·횟수를 그대로 가져온 뒤 달라진 사람만 수정 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          새 달이 시작되면 <b>지난달 명단 복사</b> 후, 달라진 사람만 <b>수정</b>하세요.
        </p>
        <Button size="sm" variant="secondary" onClick={copyPrevMonth} loading={busy && !pending && !editing}>
          지난달 명단 복사
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">등록된 회원이 없어요.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sorted.map((m) => {
            const inMonth = monthQuota.has(m.name);
            return (
              <li
                key={m.name}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                  m.active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className={`truncate font-medium ${m.active ? 'text-slate-800' : 'text-slate-400'}`}>
                    {m.name}
                  </span>
                  <span
                    title={`${monthLabel} 신청 횟수`}
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                      inMonth ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {inMonth ? `${monthQuota.get(m.name)}회` : '미등록'}
                  </span>
                </div>
                <button
                  onClick={() => openEdit(m)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                >
                  수정
                </button>
                <button
                  onClick={() => handleToggleActive(m, !m.active)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    m.active
                      ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      : 'bg-success-soft text-success-fg hover:brightness-95'
                  }`}
                >
                  {m.active ? '비활성화' : '활성화'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-xs text-slate-500">
        배지는 <b>{monthLabel} 신청 횟수</b>예요. <b>수정</b>으로 횟수를 바꾸거나 명단에서 뺄 수 있고,
        <b>비활성화</b>하면 신청 화면에서 아예 숨겨집니다.
      </p>

      {/* 횟수 수정 모달 */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`${monthLabel} 횟수 수정`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              취소
            </Button>
            <Button onClick={saveEdit} loading={busy}>
              저장
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              <b className="text-brand-700">{editing.name}</b> 님의 <b>{monthLabel}</b> 신청 횟수를 정하세요.
              {!monthQuota.has(editing.name) && (
                <span className="mt-1 block text-xs text-warning-fg">
                  현재 {monthLabel} 명단에 없어요. 저장하면 명단에 추가됩니다.
                </span>
              )}
            </p>

            <Dropdown
              label="신청 횟수"
              value={String(editQuota)}
              onChange={(v) => setEditQuota(Number(v))}
              options={(QUOTA_OPTIONS.includes(editQuota) ? QUOTA_OPTIONS : [editQuota, ...QUOTA_OPTIONS]).map((o) => ({
                value: String(o),
                label: `${o}회`,
              }))}
            />

            {monthQuota.has(editing.name) && (
              <button
                onClick={removeFromMonth}
                disabled={busy}
                className="w-full rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-fg transition hover:brightness-95 disabled:opacity-60"
              >
                {monthLabel} 명단에서 빼기
              </button>
            )}
          </div>
        )}
      </Modal>

      {/* 추가 확인 모달 */}
      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="회원 추가"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
              취소
            </Button>
            <Button onClick={confirmAdd} loading={busy}>
              추가하기
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            <b className="text-brand-700">{pending}</b> 님을 회원 명단에 추가합니다.
          </p>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={addToMonth}
              onChange={(e) => setAddToMonth(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-current text-brand-600"
            />
            <span className="text-sm">
              <b>이번 달({monthLabel}) 명단에도 추가</b>
              <span className="mt-0.5 block text-xs text-slate-500">
                이번 달 명단에 있어야 이번 달 레슨을 신청할 수 있어요.
              </span>
            </span>
          </label>

          {addToMonth && (
            <Dropdown
              label={`${monthLabel} 신청 횟수`}
              value={String(quota)}
              onChange={(v) => setQuota(Number(v))}
              options={(QUOTA_OPTIONS.includes(quota) ? QUOTA_OPTIONS : [quota, ...QUOTA_OPTIONS]).map((o) => ({
                value: String(o),
                label: `${o}회`,
              }))}
            />
          )}
        </div>
      </Modal>
    </Card>
  );
}
