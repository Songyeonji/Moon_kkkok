import { useState } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { useToast } from '../../components/Toast';
import { addMember, toggleMember } from '../../lib/api';
import type { Member } from '../../lib/types';

interface Props {
  token: string;
  members: Member[];
  onDone: () => void;
}

export default function MemberManager({ token, members, onDone }: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    try {
      await addMember(token, clean);
      toast.show(`'${clean}' 추가 완료`, 'success');
      setName('');
      onDone();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '추가 실패', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(m: Member) {
    try {
      await toggleMember(token, m.name, !m.active);
      onDone();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '변경 실패', 'error');
    }
  }

  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  return (
    <Card title={`회원 명단 (${members.filter((m) => m.active).length}명 활성)`}>
      <div className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="회원 이름 추가"
          className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <Button onClick={handleAdd} loading={busy} disabled={!name.trim()}>
          추가
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">등록된 회원이 없어요.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sorted.map((m) => (
            <li
              key={m.name}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                m.active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'
              }`}
            >
              <span className={`font-medium ${m.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                {m.name}
              </span>
              <button
                onClick={() => handleToggle(m)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  m.active
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : 'bg-success-soft text-success-fg hover:brightness-95'
                }`}
              >
                {m.active ? '비활성화' : '활성화'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500">비활성 회원은 신청 화면 드롭다운에서 숨겨집니다.</p>
    </Card>
  );
}
