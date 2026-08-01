import { IS_MOCK } from '../lib/api';
import { formatDateLongKo, todayKST } from '../lib/time';

export default function Footer() {
  return (
    <footer className="shrink-0 border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-[11px] text-slate-400 sm:px-6 sm:text-xs">
        <span>
          {formatDateLongKo(todayKST())} · 한국 시간(KST)
        </span>
        <span className="flex items-center gap-2">
          {IS_MOCK && (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning-fg">목업 모드</span>
          )}
          <span>moon._.kkkok</span>
        </span>
      </div>
    </footer>
  );
}
