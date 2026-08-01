// ── 신청 가능 날짜 계산 ──
// 기본: 월·화·목·금 자동 신청 가능. 관리자가 지정한 '사용불가(블랙아웃)' 날짜는 제외.
import { dayjs, isPast, KST, nowKST } from './time';
import type { Settings } from './types';

/** 기본 신청 가능 요일: 월(1) 화(2) 목(4) 금(5) */
export const DEFAULT_WEEKDAYS = [1, 2, 4, 5];
export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 오늘부터 (다음 달 말일까지) 범위에서 신청 가능한 날짜 목록.
 * - 요일이 availableWeekdays 에 포함되고
 * - 블랙아웃(사용불가)에 없는 날짜만
 */
export function availableDates(availableWeekdays: number[], blackouts: string[]): string[] {
  const wd = availableWeekdays && availableWeekdays.length ? availableWeekdays : DEFAULT_WEEKDAYS;
  const block = new Set(blackouts);
  const start = nowKST().startOf('day');
  const endStr = start.add(1, 'month').endOf('month').format('YYYY-MM-DD');

  const out: string[] = [];
  let d = start;
  // 안전 상한(약 1년) 내에서 순회
  for (let i = 0; i < 400; i++) {
    const ds = d.format('YYYY-MM-DD');
    if (ds > endStr) break;
    if (wd.includes(d.day()) && !block.has(ds)) out.push(ds);
    d = d.add(1, 'day');
  }
  return out;
}

/** AppState 편의 래퍼 */
export function availableDatesOf(settings: Settings, blackouts: string[]): string[] {
  return availableDates(settings.availableWeekdays, blackouts);
}

/** 특정 날짜가 요일 규칙상 신청 가능한 날인지(블랙아웃 무시) */
export function isAvailableWeekday(availableWeekdays: number[], date: string): boolean {
  const wd = availableWeekdays && availableWeekdays.length ? availableWeekdays : DEFAULT_WEEKDAYS;
  return wd.includes(dayjs.tz(date, KST).day());
}

/**
 * 달력용 날짜 상태
 * - open: 신청 가능
 * - blackout: 관리자가 지정한 사용불가(휴무)
 * - off: 레슨을 안 하는 요일
 * - past: 지난 날짜
 */
export type DateStatus = 'open' | 'blackout' | 'off' | 'past';

export function dateStatus(settings: Settings, blackouts: string[], date: string): DateStatus {
  if (isPast(date)) return 'past';
  if (!isAvailableWeekday(settings.availableWeekdays, date)) return 'off';
  if (blackouts.includes(date)) return 'blackout';
  return 'open';
}

/** "2026-08" → 달력 격자(일요일 시작, 앞뒤 달 날짜 포함한 주 배열) */
export function monthGrid(ym: string): string[][] {
  const first = dayjs.tz(`${ym}-01`, KST);
  const start = first.subtract(first.day(), 'day'); // 그 주 일요일까지 되감기
  const last = first.endOf('month');
  const end = last.add(6 - last.day(), 'day'); // 마지막 주 토요일까지

  const weeks: string[][] = [];
  let cur = start;
  while (cur.isBefore(end) || cur.isSame(end, 'day')) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cur.format('YYYY-MM-DD'));
      cur = cur.add(1, 'day');
    }
    weeks.push(week);
  }
  return weeks;
}

/** "2026-08" 기준 이전/다음 달 */
export function shiftMonth(ym: string, delta: number): string {
  return dayjs.tz(`${ym}-01`, KST).add(delta, 'month').format('YYYY-MM');
}
