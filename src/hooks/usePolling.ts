import { useCallback, useEffect, useRef, useState } from 'react';

interface PollingResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
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

  return { data, error, loading, refresh: run };
}
