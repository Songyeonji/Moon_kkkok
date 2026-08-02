import { useMemo, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { getAdminState } from '../../lib/api';
import type { AppState, Booking } from '../../lib/types';
import CoachLoading from '../../components/CoachLoading';
import Button from '../../components/Button';
import AdminLogin from './AdminLogin';
import ApprovalQueue from './ApprovalQueue';
import MemberManager from './MemberManager';
import DateSlotManager from './DateSlotManager';
import MonthlyStatus from './MonthlyStatus';

const TOKEN_KEY = 'moon_admin_token';
type Tab = 'approve' | 'monthly' | 'members' | 'dates';

export default function AdminDashboard() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));

  function login(t: string) {
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }
  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  if (!token) return <AdminLogin onSuccess={login} />;
  return <AdminConsole token={token} onLogout={logout} />;
}

function AdminConsole({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('approve');
  const { data, loading, error, refresh, mutate } = usePolling<AppState & { allBookings: Booking[] }>(
    () => getAdminState(token),
    60000,
  );

  /** 낙관적 업데이트: 화면을 먼저 바꾸고, 저장은 백그라운드로. 실패하면 서버 상태로 되돌린다. */
  type AdminData = AppState & { allBookings: Booking[] };
  const optimistic = (patch: (prev: AdminData) => AdminData, save: () => Promise<unknown>) => {
    mutate(patch);
    save().catch(() => refresh());
  };

  const pending = useMemo(() => (data ? data.allBookings.filter((b) => b.status === 'pending') : []), [data]);
  const byId = useMemo(() => new Map((data?.allBookings ?? []).map((b) => [b.id, b])), [data]);
  const resolvePrev = (id?: string) => (id ? byId.get(id) : undefined);

  if (loading && !data) return <CoachLoading label="관리자 데이터를 불러오는 중" />;
  if (error && !data)
    return (
      <div className="mx-auto max-w-sm space-y-3 pt-6 text-center">
        <p className="rounded-xl bg-danger-soft p-4 text-sm text-danger-fg">{error}</p>
        <Button variant="secondary" onClick={onLogout}>
          다시 로그인
        </Button>
      </div>
    );
  if (!data) return null;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'approve', label: '승인 대기', badge: pending.length },
    { key: 'monthly', label: '월별 현황' },
    { key: 'members', label: '회원 관리' },
    { key: 'dates', label: '날짜·시간' },
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 모바일에서는 탭이 가로 스크롤되고, 로그아웃 버튼은 항상 오른쪽에 고정 */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  tab === t.key
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {t.label}
                {!!t.badge && (
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold ${
                      tab === t.key ? 'bg-white/25 text-white' : 'bg-brand-600 text-white'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onLogout} className="shrink-0 whitespace-nowrap">
          로그아웃
        </Button>
      </div>

      {/* 관리 화면은 내용이 길어질 수 있어 이 영역만 스크롤 */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-1">
        {tab === 'approve' && (
          <ApprovalQueue token={token} pending={pending} resolvePrev={resolvePrev} onDone={refresh} />
        )}
        {tab === 'monthly' && (
          <MonthlyStatus
            token={token}
            members={data.members}
            quotas={data.quotas}
            bookings={data.bookings}
            optimistic={optimistic}
          />
        )}
        {tab === 'members' && (
          <MemberManager
            token={token}
            members={data.members}
            quotas={data.quotas}
            onDone={refresh}
            optimistic={optimistic}
          />
        )}
        {tab === 'dates' && (
          <DateSlotManager token={token} settings={data.settings} blackouts={data.blackouts} onDone={refresh} />
        )}
      </div>
    </div>
  );
}
