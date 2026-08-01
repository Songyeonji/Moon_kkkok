export type View = 'board' | 'my' | 'admin';

interface Props {
  view: View;
  onChange: (v: View) => void;
}

const TABS: { key: View; label: string }[] = [
  { key: 'board', label: '현황' },
  { key: 'my', label: '나의 신청 내역' },
  { key: 'admin', label: '관리자' },
];

export default function TopBar({ view, onChange }: Props) {
  return (
    <header className="shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <button
          onClick={() => onChange('board')}
          className="flex shrink-0 items-center gap-2 text-left"
          aria-label="홈으로"
        >
          <img
            src="/topbar-icon.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-lg object-contain"
          />
          <span className="hidden text-base font-extrabold text-slate-900 sm:block">레슨 예약</span>
        </button>

        <nav className="flex flex-1 justify-end gap-1 sm:flex-none">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              aria-current={view === t.key ? 'page' : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition sm:px-4 ${
                view === t.key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
