import { useState } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { adminLogin, IS_MOCK, MOCK_ADMIN_PASSWORD } from '../../lib/api';
import { useToast } from '../../components/Toast';

export default function AdminLogin({ onSuccess }: { onSuccess: (token: string) => void }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    if (!pw) return;
    setBusy(true);
    try {
      await adminLogin(pw);
      onSuccess(pw);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '로그인 실패', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-6">
      <Card title="관리자 로그인">
        <div className="space-y-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="관리자 비밀번호"
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <Button onClick={handleLogin} loading={busy} disabled={!pw} className="w-full">
            로그인
          </Button>
          {IS_MOCK && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              🧪 목업 모드입니다. 테스트 비밀번호: <b>{MOCK_ADMIN_PASSWORD}</b>
              <br />
              실제 배포 시에는 Apps Script의 <code>ADMIN_PASSWORD</code> 값으로 검증됩니다.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
