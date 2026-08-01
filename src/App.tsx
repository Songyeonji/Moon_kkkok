import { useEffect, useState } from 'react';
import { ToastProvider } from './components/Toast';
import TopBar, { type View } from './components/TopBar';
import Footer from './components/Footer';
import BookingPage from './features/booking/BookingPage';
import MyHistory from './features/booking/MyHistory';
import AdminDashboard from './features/admin/AdminDashboard';

const HASH_TO_VIEW: Record<string, View> = { my: 'my', admin: 'admin' };
const VIEW_TO_HASH: Record<View, string> = { board: '', my: 'my', admin: 'admin' };

function currentView(): View {
  return HASH_TO_VIEW[window.location.hash.replace('#', '')] ?? 'board';
}

export default function App() {
  // 앱을 새로 열면 항상 '현황' 화면으로 시작 (이전에 보던 탭이 남지 않도록)
  const [view, setView] = useState<View>('board');

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    const onHash = () => setView(currentView());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function go(v: View) {
    window.location.hash = VIEW_TO_HASH[v];
    setView(v);
  }

  return (
    <ToastProvider>
      {/* 앱 셸: 탑바 · 본문 · 푸터 — 페이지 전체는 스크롤되지 않음 */}
      <div className="flex h-full flex-col">
        <TopBar view={view} onChange={go} />

        <main className="min-h-0 flex-1 overflow-hidden">
          <div className="mx-auto h-full w-full max-w-4xl px-4 py-3 sm:px-6">
            {view === 'admin' ? <AdminDashboard /> : view === 'my' ? <MyHistory /> : <BookingPage />}
          </div>
        </main>

        <Footer />
      </div>
    </ToastProvider>
  );
}
