import { useState } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { useToast } from '../../components/Toast';
import { decide } from '../../lib/api';
import { formatDateKo } from '../../lib/time';
import type { Booking } from '../../lib/types';

interface Props {
  token: string;
  pending: Booking[];
  resolvePrev: (id?: string) => Booking | undefined;
  onDone: () => void;
}

const typeLabel: Record<Booking['requestType'], string> = {
  new: '신규',
  change: '변경',
  cancel: '취소',
};

const typeCls: Record<Booking['requestType'], string> = {
  new: 'bg-info-soft text-info-fg',
  change: 'bg-brand-100 text-brand-700',
  cancel: 'bg-danger-soft text-danger-fg',
};

export default function ApprovalQueue({ token, pending, resolvePrev, onDone }: Props) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, approve: boolean) {
    setBusyId(id);
    try {
      await decide(token, id, approve);
      toast.show(approve ? '승인했어요.' : '반려했어요. 이전 예약은 유지됩니다.', approve ? 'success' : 'info');
      onDone();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '처리 실패', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card title={`승인 대기 (${pending.length})`}>
      {pending.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">대기 중인 신청이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((b) => {
            const prev = resolvePrev(b.supersedesId);
            return (
              <li
                key={b.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${typeCls[b.requestType]}`}>
                      {typeLabel[b.requestType]}
                    </span>
                    <span className="font-bold text-slate-800">{b.name}</span>
                    <span className="text-sm text-slate-500">{formatDateKo(b.date)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    {b.requestType === 'cancel' ? (
                      <>
                        <b className="text-danger">{prev?.slot ?? b.slot}</b> 예약 취소 요청
                      </>
                    ) : b.requestType === 'change' && prev ? (
                      <>
                        <span className="text-slate-400 line-through">{prev.slot}</span>{' '}
                        <span className="mx-1">→</span> <b className="text-brand-700">{b.slot}</b>
                      </>
                    ) : (
                      <b className="text-brand-700">{b.slot}</b>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="success" loading={busyId === b.id} onClick={() => act(b.id, true)}>
                    승인
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busyId === b.id} onClick={() => act(b.id, false)}>
                    반려
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
