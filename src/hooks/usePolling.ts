import { useCallback, useEffect, useRef, useState } from 'react';

interface PollingResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
  /** 서버 응답을 기다리지 않고 화면을 먼저 바꾸는 낙관적 업데이트용 */
  mutate: (updater: (prev: T) => T) => void;
}

/**
 * 주기적으로 fn 을 호출해 데이터를 갱신(근실시간 현황판용).
 * - intervalMs 마다 자동 갱신
 * - 탭이 백그라운드면 갱신을 건너뛰어 불필요한 요청 방지
 * - refresh() 로 즉시 갱신 가능
 */
export function usePolling<T>(fn: () => Promise<T>, intervalMs = 60000, initialData: T | null = null): PollingResult<T> {
  const [data, setData] = useState<T | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialData === null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    try {
      const result = await fnRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [run, intervalMs]);

  /** 로컬 상태만 즉시 갱신 (서버 저장은 호출자가 백그라운드로 진행) */
  const mutate = useCallback((updater: (prev: T) => T) => {
    setData((prev) => (prev === null ? prev : updater(prev)));
  }, []);

  return { data, error, loading, refresh: run, mutate };
}
