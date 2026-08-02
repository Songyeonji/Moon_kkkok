import { useEffect, useState } from 'react';

const QUOTES = ['라켓 들어', '공이 목적이 아니라 동작이 목적이다. 그러면 공은 자연스럽게 나온다.', '스매싱은 힘보다 각'];

const TYPE_MS = 55; // 한 글자 타이핑 간격
const ERASE_MS = 20; // 한 글자 지우는 간격
const HOLD_MS = 1700; // 다 쓴 뒤 멈춰있는 시간
const GAP_MS = 300; // 다음 말로 넘어가기 전 공백

/** 로딩 중 표시되는 코치 이미지 + 말풍선(타자 효과로 명언 순환) */
export default function CoachLoading({ label = '데이터를 불러오는 중' }: { label?: string }) {
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [text, setText] = useState('');
  const [dots, setDots] = useState(1);

  // 말풍선 타자 효과: 한 글자씩 쓰고 → 잠시 멈춤 → 한 글자씩 지우고 → 다음 문장
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    function step(idx: number, charIdx: number, erasing: boolean) {
      if (cancelled) return;
      const full = QUOTES[idx];
      setQuoteIdx(idx);
      setText(full.slice(0, charIdx));

      if (!erasing) {
        if (charIdx < full.length) {
          timer = setTimeout(() => step(idx, charIdx + 1, false), TYPE_MS);
        } else {
          timer = setTimeout(() => step(idx, charIdx, true), HOLD_MS);
        }
      } else if (charIdx > 0) {
        timer = setTimeout(() => step(idx, charIdx - 1, true), ERASE_MS);
      } else {
        const next = (idx + 1) % QUOTES.length;
        timer = setTimeout(() => step(next, 0, false), GAP_MS);
      }
    }

    step(0, 0, false);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // "불러오는 중" 뒤 점(.) 애니메이션
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d % 3) + 1), 450);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center gap-1 py-8">
      {/* 말풍선 */}
      <div
        aria-live="polite"
        className="relative flex min-h-[56px] w-72 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-slate-700 shadow-sm sm:w-80"
      >
        {text}
        <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-slate-400 align-middle" style={{ height: '1em' }} />
        <span
          className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1.5 rotate-45 border-b border-r border-slate-200 bg-white"
          aria-hidden="true"
        />
      </div>

      {/* 순환 표시용 점 */}
      <div className="mb-1 flex gap-1">
        {QUOTES.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${i === quoteIdx ? 'bg-brand-500' : 'bg-slate-200'}`}
          />
        ))}
      </div>

      <img src="/loading-coach.png" alt="배드민턴 코치" className="h-40 w-auto object-contain sm:h-48" />

      <p className="text-sm text-slate-500">
        {label}
        {'.'.repeat(dots)}
      </p>
    </div>
  );
}
