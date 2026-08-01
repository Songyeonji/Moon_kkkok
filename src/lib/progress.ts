// ── 월별 신청 횟수 / 진행 현황 계산 ──
import { todayKST } from './time';
import type { Booking, Quota } from './types';

/** 관리자가 고르는 기본 월 횟수 옵션 */
export const QUOTA_OPTIONS = [4, 8, 10];
/** 새로 명단에 추가할 때 기본으로 잡히는 횟수 */
export const DEFAULT_MONTHLY_QUOTA = 10;

/** "2026-08-05" → "2026-08" */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** 이번 달 "2026-08" (KST) */
export function currentMonth(): string {
  return todayKST().slice(0, 7);
}

/**
 * 회원의 해당 월 신청 가능 횟수.
 * 그 달 Quotas 에 행이 없으면 **그 달 참여 대상이 아님** → 0회.
 * (매월 참여 회원과 횟수가 달라지므로, 그 달 명단 = Quotas 의 그 달 행들)
 */
export function quotaFor(quotas: Quota[], name: string, month: string): number {
  const q = quotas.find((x) => x.name === name && x.month === month);
  return q ? q.quota : 0;
}

/** 그 달 참여 회원 이름 목록 (횟수가 1 이상인 사람) */
export function monthlyRoster(quotas: Quota[], month: string): string[] {
  return quotas.filter((q) => q.month === month && q.quota > 0).map((q) => q.name);
}

/** 그 달 참여 대상인지 */
export function isInRoster(quotas: Quota[], name: string, month: string): boolean {
  return quotaFor(quotas, name, month) > 0;
}

export interface MonthStats {
  approved: number; // 확정
  completed: number; // 완료(이미 받은 레슨 = 지난 날짜의 확정)
  upcoming: number; // 예정(다가오는 확정)
  pending: number; // 대기중 신청
  used: number; // 횟수 소진분(확정 + 신규 대기) → 남은 신청 계산용
}

/** 회원의 특정 월 진행 현황 */
export function memberMonthStats(
  bookings: Booking[],
  name: string,
  month: string,
  today = todayKST(),
): MonthStats {
  const inMonth = bookings.filter((b) => b.name === name && monthOf(b.date) === month);
  const approvedRows = inMonth.filter((b) => b.status === 'approved');
  const completed = approvedRows.filter((b) => b.date < today).length;
  const upcoming = approvedRows.length - completed;
  const pending = inMonth.filter((b) => b.status === 'pending').length;
  // 횟수 소진 = 확정 + 신규 대기(new) 의 "날짜" 기준(하루 1레슨). 변경/취소 신청은 총량 불변.
  const usedDates = new Set(
    inMonth
      .filter((b) => b.status === 'approved' || (b.status === 'pending' && b.requestType === 'new'))
      .map((b) => b.date),
  );
  return {
    approved: approvedRows.length,
    completed,
    upcoming,
    pending,
    used: usedDates.size,
  };
}

/** 남은 신청 가능 횟수 */
export function remaining(quota: number, used: number): number {
  return Math.max(0, quota - used);
}
