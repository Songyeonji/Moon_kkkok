// ── 도메인 타입 (프론트/백엔드 공용 개념) ──

export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type RequestType = 'new' | 'change' | 'cancel';

/** 레슨 기본 설정 (관리자만 변경) */
export interface Settings {
  startTime: string; // "19:00"
  endTime: string; // "20:40"
  slotMinutes: number; // 10
  capacityPerSlot: number; // 슬롯당 정원(기본 1명)
  availableWeekdays: number[]; // 신청 가능 요일 (일=0..토=6). 기본 [1,2,4,5] = 월화목금
}

/** 회원 명단 (드롭다운 소스, 오타 방지) */
export interface Member {
  name: string;
  active: boolean;
}

/** 예약 = 신청 (status 로 상태 관리) */
export interface Booking {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  slot: string; // "19:00"
  status: BookingStatus;
  requestType: RequestType;
  supersedesId?: string; // 변경 신청일 때, 이전(현재 확정) 예약 id
  createdAt: string; // ISO
  decidedAt?: string; // 승인/반려 시각 ISO
  note?: string;
}

/** 월별 신청 가능 횟수 (매달 학교 일정에 따라 회원별로 다름) */
export interface Quota {
  month: string; // "2026-08"
  name: string;
  quota: number; // 그 달에 신청 가능한 총 횟수 (예: 4 / 8 / 10)
}

/** 공개 상태(회원 화면·현황판용): 민감정보 없음 */
export interface AppState {
  settings: Settings;
  members: Member[];
  blackouts: string[]; // 사용불가 날짜 목록 (YYYY-MM-DD)
  bookings: Booking[]; // pending + approved 만 포함
  quotas: Quota[];
}

/** submitRequest 입력 */
export interface RequestInput {
  name: string;
  date: string;
  slot: string;
  requestType: RequestType;
  supersedesId?: string;
}
