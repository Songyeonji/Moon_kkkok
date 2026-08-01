// ── 한국 시간(KST) 유틸 & 슬롯 생성 ──
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import 'dayjs/locale/ko';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.locale('ko');

export const KST = 'Asia/Seoul';
// 앱 전체를 한국 시간 기준으로 고정
dayjs.tz.setDefault(KST);

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** 지금(KST) */
export function nowKST() {
  return dayjs().tz(KST);
}

/** 오늘 날짜 문자열 (YYYY-MM-DD, KST) */
export function todayKST(): string {
  return nowKST().format('YYYY-MM-DD');
}

/** 요일 한글 1글자: "2026-08-05" → "수" */
export function weekdayKo(date: string): string {
  return WEEKDAYS_KO[dayjs.tz(date, KST).day()];
}

/** 요일 인덱스(일=0 ... 토=6) */
export function weekdayIndex(date: string): number {
  return dayjs.tz(date, KST).day();
}

/** 화면 표기용: "2026-08-05" → "8/5 (수)" */
export function formatDateKo(date: string): string {
  const d = dayjs.tz(date, KST);
  return `${d.month() + 1}/${d.date()} (${WEEKDAYS_KO[d.day()]})`;
}

/** 전체 표기용: "2026-08-05" → "2026년 8월 5일 (수)" */
export function formatDateLongKo(date: string): string {
  const d = dayjs.tz(date, KST);
  return `${d.year()}년 ${d.month() + 1}월 ${d.date()}일 (${WEEKDAYS_KO[d.day()]})`;
}

/** 오늘 이전 날짜인지 (지난 날짜는 신청 마감) */
export function isPast(date: string): boolean {
  return dayjs.tz(date, KST).isBefore(nowKST().startOf('day'));
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 슬롯 시작시각 배열 생성.
 * 예) ("19:00","20:40",10) → ["19:00","19:10",...,"20:30"] (총 10개)
 * 각 슬롯이 stepMin 만큼 차지하므로 시작+step 이 종료를 넘지 않아야 함.
 */
export function generateSlots(start: string, end: string, stepMin: number): string[] {
  const slots: string[] = [];
  if (!start || !end || !stepMin || stepMin <= 0) return slots;
  const endMin = toMinutes(end);
  for (let cur = toMinutes(start); cur + stepMin <= endMin; cur += stepMin) {
    slots.push(toHHMM(cur));
  }
  return slots;
}

/** "19:00" → "19:00~19:10" (레이블용) */
export function slotRangeLabel(slot: string, stepMin: number): string {
  return `${slot}~${toHHMM(toMinutes(slot) + stepMin)}`;
}

export { dayjs };
