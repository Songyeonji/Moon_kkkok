// ── API 레이어 ──
// 실제 모드: Google Apps Script 웹앱과 통신 (읽기 GET / 쓰기 text-plain POST 로 CORS preflight 회피)
// 목업 모드: 브라우저 메모리(localStorage)로 동작 → Apps Script 없이 UI 전체 검증 가능
//
// 두 모드가 "동일한 승인 로직"을 따르도록 맞춰, 목업에서 확인한 동작이 실서버에서도 그대로 재현됩니다.

import type { AppState, Booking, Member, Quota, RequestInput, Settings } from './types';
import { dayjs, generateSlots, isPast } from './time';
import { availableDatesOf, isAvailableWeekday } from './dates';
import { monthOf, quotaFor } from './progress';

/**
 * Apps Script 웹앱 주소.
 * 이 주소는 비밀이 아니다(어차피 클라이언트 번들에 그대로 들어간다).
 * 환경변수가 비어 있거나 배포 과정에서 `[SENSITIVE]` 같은 placeholder 로 치환돼도
 * 앱이 죽지 않도록 기본값을 코드에 둔다.
 */
const FALLBACK_API_URL =
  'https://script.google.com/macros/s/AKfycbzTNQ9XG2wcnjddhJ70HeEDFaVxZrp4KgdLTufZzsaucCMY8QoTa4DaXYCyF21UUyXx/exec';

function resolveApiUrl(): string {
  const raw = (import.meta.env.VITE_API_URL ?? '').trim();
  // 정상적인 Apps Script /exec 주소일 때만 사용한다.
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(raw) ? raw : FALLBACK_API_URL;
}

const API_URL = resolveApiUrl();
export const IS_MOCK = (import.meta.env.VITE_MOCK ?? '').trim() === '1' || !API_URL;

/** 목업 모드 관리자 비밀번호 (실서버에서는 Apps Script Script Property 로 관리) */
export const MOCK_ADMIN_PASSWORD = 'admin1234';

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class ApiError extends Error {}

// ────────────────────────────────────────────────────────────
// 실서버 통신 helpers
// ────────────────────────────────────────────────────────────
/**
 * Apps Script 응답 파싱.
 * /exec 는 googleusercontent.com 의 **일회성 URL** 로 302 리다이렉트되는데,
 * 그 URL 이 만료되면 404(HTML) 가 돌아온다. JSON 이 아닐 때 친절한 에러로 바꿔준다.
 */
async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: { ok?: boolean; data?: T; error?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(
      res.ok ? '서버 응답을 읽지 못했어요. 잠시 후 다시 시도해주세요.' : `서버 연결 실패 (${res.status})`,
    );
  }
  if (!json.ok) throw new ApiError(json.error ?? '요청 실패');
  return json.data as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST 가 서버에 GET 으로 전달되면 doPost 대신 doGet 이 응답한다.
 * 이때 본문(action 포함)이 통째로 사라져 "알 수 없는 action: " (이름이 빈 값) 이 돌아온다.
 * → 요청이 실행되지 **않은** 상태이므로 어떤 action 이든 다시 보내도 안전하다.
 */
const LOST_BODY = /알 수 없는 action:\s*$/;
/** 구글 콜드스타트·만료된 리다이렉트 등 네트워크성 실패 */
const TRANSIENT = /서버 연결 실패|응답을 읽지 못했어요/;

function isLostBody(e: unknown) {
  return e instanceof ApiError && LOST_BODY.test(e.message);
}
function isTransient(e: unknown) {
  return e instanceof ApiError && TRANSIENT.test(e.message);
}

/** 일시적인 실패면 잠시 뒤 다시 시도 */
async function withRetry<T>(fn: () => Promise<T>, tries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // 서버가 명확히 거부한 요청(정원 초과 등)은 재시도하지 않는다
      if (!isTransient(e) && !isLostBody(e)) throw e;
      if (i < tries) await sleep(600 * (i + 1));
    }
  }
  throw lastErr;
}

async function realGet<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  return withRetry(async () => {
    // new URL() 은 주소가 조금이라도 이상하면 예외를 던져 화면에 알 수 없는 에러가 뜬다.
    // 문자열로 직접 조립해 그런 상황을 만들지 않는다.
    const qs = new URLSearchParams({ ...params, action, _: String(Date.now()) }).toString();
    const res = await fetch(`${API_URL}?${qs}`, { method: 'GET', redirect: 'follow', cache: 'no-store' });
    return parseResponse<T>(res);
  });
}

/**
 * 재시도해도 안전한(멱등) action 만 자동 재시도한다.
 * submitRequest/decide 는 두 번 보내면 예약이 중복되거나 혼란스러운 에러가 나므로 제외.
 */
const RETRYABLE_ACTIONS = new Set([
  'adminLogin',
  'getPending',
  'getAdminState',
  'setPaid',
  'saveQuotas',
  'saveBlackouts',
  'updateSettings',
  'toggleMember',
  'addMember',
]);

async function realPost<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const run = async () => {
    const res = await fetch(API_URL, {
      method: 'POST',
      // text/plain → 브라우저가 preflight(OPTIONS) 를 보내지 않음 (Apps Script CORS 대응)
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      cache: 'no-store',
      body: JSON.stringify({ action, ...payload }),
    });
    return parseResponse<T>(res);
  };

  // 멱등 action 은 네트워크성 실패에도 재시도한다.
  if (RETRYABLE_ACTIONS.has(action)) return withRetry(run);

  // 그 외(submitRequest/decide)는 중복 실행 위험이 있어 재시도하지 않지만,
  // '본문이 사라진' 경우만은 아직 아무것도 실행되지 않았으므로 안전하게 다시 보낸다.
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await run();
    } catch (e) {
      lastErr = e;
      if (!isLostBody(e)) throw e;
      await sleep(600 * (i + 1));
    }
  }
  throw lastErr;
}

// ────────────────────────────────────────────────────────────
// 목업 저장소
// ────────────────────────────────────────────────────────────
const MOCK_KEY = 'moon_lesson_mock_v1';
const STATE_CACHE_KEY = 'moon_lesson_state_v1';
const STATE_CACHE_TTL_MS = 60 * 60 * 1000;

interface StateCache {
  cachedAt: number;
  data: AppState;
}

export function getCachedState(): AppState | null {
  if (IS_MOCK) return null;
  try {
    const raw = localStorage.getItem(STATE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as StateCache;
    if (!cached.data || Date.now() - cached.cachedAt > STATE_CACHE_TTL_MS) {
      localStorage.removeItem(STATE_CACHE_KEY);
      return null;
    }
    return cached.data;
  } catch {
    localStorage.removeItem(STATE_CACHE_KEY);
    return null;
  }
}

function cacheState(data: AppState) {
  try {
    localStorage.setItem(STATE_CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), data } satisfies StateCache));
  } catch {
    // 저장 공간 제한이나 비공개 모드에서는 캐시 없이 동작합니다.
  }
}

function clearCachedState() {
  try {
    localStorage.removeItem(STATE_CACHE_KEY);
  } catch {
    // localStorage를 사용할 수 없어도 API 요청은 계속 진행합니다.
  }
}

interface MockDB {
  settings: Settings;
  members: Member[];
  blackouts: string[];
  bookings: Booking[];
  quotas: Quota[];
}

function seed(): MockDB {
  const settings: Settings = {
    startTime: '19:00',
    endTime: '20:40',
    slotMinutes: 10,
    capacityPerSlot: 1,
    availableWeekdays: [1, 2, 4, 5], // 월화목금
  };
  // 실제 8월 명단(회원별 월 횟수는 매월 달라짐)
  const roster: { name: string; quota: number }[] = [
    { name: '박종용', quota: 4 },
    { name: '정예인', quota: 4 },
    { name: '홍석봉', quota: 4 },
    { name: '김서형', quota: 4 },
    { name: '이명훈', quota: 8 },
    { name: '전영주', quota: 8 },
    { name: '박준혁', quota: 8 },
    { name: '김보람', quota: 8 },
    { name: '이중걸', quota: 8 },
    { name: '황동하', quota: 8 },
    { name: '서영미', quota: 8 },
    { name: '이은규', quota: 10 },
    { name: '최유진', quota: 10 },
    { name: '정일준', quota: 10 },
    { name: '이해란', quota: 10 },
  ];
  const members: Member[] = roster.map((r) => ({ name: r.name, active: true }));
  const base = dayjs().tz('Asia/Seoul');

  const blackouts: string[] = [];
  // 데모 시드 예약은 앞으로의 신청 가능 날짜 중 처음 두 개에 배치
  const days = availableDatesOf(settings, blackouts);
  const d0 = days[0] ?? base.add(1, 'day').format('YYYY-MM-DD');

  const now = new Date().toISOString();
  // 신규 신청은 즉시 확정 → 시드도 approved. 승인 큐 데모용으로 '변경 신청' 1건만 대기 상태로 둠.
  const parkId = uid();
  const bookings: Booking[] = [
    { id: uid(), name: '박종용', date: d0, slot: '19:00', status: 'approved', requestType: 'new', createdAt: now },
    { id: uid(), name: '이명훈', date: d0, slot: '19:20', status: 'approved', requestType: 'new', createdAt: now },
    { id: parkId, name: '이은규', date: d0, slot: '19:40', status: 'approved', requestType: 'new', createdAt: now },
    {
      id: uid(),
      name: '이은규',
      date: d0,
      slot: '20:00',
      status: 'pending',
      requestType: 'change',
      supersedesId: parkId,
      createdAt: now,
    },
  ];

  // 그 달 명단 = Quotas 의 그 달 행 (매월 회원/횟수가 달라짐)
  const month = base.format('YYYY-MM');
  const quotas: Quota[] = roster.map((r) => ({ month, name: r.name, quota: r.quota }));

  return { settings, members, blackouts, bookings, quotas };
}

function loadMock(): MockDB {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (raw) return JSON.parse(raw) as MockDB;
  } catch {
    /* ignore */
  }
  const fresh = seed();
  saveMock(fresh);
  return fresh;
}

function saveMock(db: MockDB) {
  localStorage.setItem(MOCK_KEY, JSON.stringify(db));
}

/** 목업 데이터 초기화(테스트용) */
export function resetMock() {
  localStorage.removeItem(MOCK_KEY);
}

// ────────────────────────────────────────────────────────────
// 공용 도메인 로직 (목업에서 사용, 실서버는 동일 로직을 Code.gs 에 구현)
// ────────────────────────────────────────────────────────────
function isBookableDate(db: MockDB, date: string): boolean {
  return (
    isAvailableWeekday(db.settings.availableWeekdays, date) &&
    !db.blackouts.includes(date) &&
    !isPast(date)
  );
}

function validSlotsFor(db: MockDB, date: string): string[] {
  if (!isBookableDate(db, date)) return [];
  return generateSlots(db.settings.startTime, db.settings.endTime, db.settings.slotMinutes);
}

function capacityFor(db: MockDB): number {
  return db.settings.capacityPerSlot;
}

function approvedCount(db: MockDB, date: string, slot: string): number {
  return db.bookings.filter((b) => b.date === date && b.slot === slot && b.status === 'approved').length;
}

function assertRequestValid(db: MockDB, input: RequestInput) {
  const member = db.members.find((m) => m.name === input.name && m.active);
  if (!member) throw new ApiError('등록된 회원이 아닙니다. 관리자에게 문의하세요.');
  if (isPast(input.date)) throw new ApiError('지난 날짜는 신청할 수 없습니다.');
  if (!isAvailableWeekday(db.settings.availableWeekdays, input.date)) {
    throw new ApiError('신청 가능한 요일이 아닙니다.');
  }
  if (db.blackouts.includes(input.date)) throw new ApiError('사용불가로 지정된 날짜입니다.');
  if (input.requestType !== 'cancel') {
    const slots = validSlotsFor(db, input.date);
    if (!slots.includes(input.slot)) throw new ApiError('유효한 시간대가 아닙니다.');
    if (approvedCount(db, input.date, input.slot) >= capacityFor(db)) {
      throw new ApiError('이미 마감된 시간대입니다. 다른 시간을 선택하세요.');
    }
  }
  // 월별 신청 횟수 제한 (신규 신청만): 하루 1레슨 기준, 다른 날짜에 이미 쓴 횟수로 판단
  if (input.requestType === 'new') {
    const month = monthOf(input.date);
    const quota = quotaFor(db.quotas, input.name, month);
    const usedDates = new Set(
      db.bookings
        .filter(
          (b) =>
            b.name === input.name &&
            monthOf(b.date) === month &&
            b.date !== input.date &&
            (b.status === 'approved' || (b.status === 'pending' && b.requestType === 'new')),
        )
        .map((b) => b.date),
    );
    if (usedDates.size >= quota) {
      throw new ApiError(`이번 달 신청 가능 횟수(${quota}회)를 모두 사용했어요.`);
    }
  }
}

// ────────────────────────────────────────────────────────────
// 공개 API (회원/현황판)
// ────────────────────────────────────────────────────────────
export async function getState(): Promise<AppState> {
  if (!IS_MOCK) {
    const state = await realGet<AppState>('getState');
    cacheState(state);
    return state;
  }
  const db = loadMock();
  return {
    settings: db.settings,
    members: db.members.filter((m) => m.active),
    blackouts: db.blackouts,
    // 공개 상태에는 pending + approved 만 노출
    bookings: db.bookings.filter((b) => b.status === 'pending' || b.status === 'approved'),
    quotas: db.quotas,
  };
}

export async function submitRequest(input: RequestInput): Promise<Booking> {
  if (!IS_MOCK) {
    const booking = await realPost<Booking>('submitRequest', { ...input });
    clearCachedState();
    return booking;
  }
  const db = loadMock();
  assertRequestValid(db, input);

  // 같은 회원의 같은 날짜에 대한 기존 '대기' 신청은 자동 철회(중복 방지)
  db.bookings.forEach((b) => {
    if (b.name === input.name && b.date === input.date && b.status === 'pending') {
      b.status = 'cancelled';
      b.decidedAt = new Date().toISOString();
    }
  });

  // 신규 신청은 즉시 확정. 변경/취소만 관리자 승인 대기.
  const now = new Date().toISOString();
  const isNew = input.requestType === 'new';
  const booking: Booking = {
    id: uid(),
    name: input.name,
    date: input.date,
    slot: input.slot,
    status: isNew ? 'approved' : 'pending',
    requestType: input.requestType,
    supersedesId: input.supersedesId,
    createdAt: now,
    decidedAt: isNew ? now : undefined,
  };
  db.bookings.push(booking);
  saveMock(db);
  return booking;
}

// ────────────────────────────────────────────────────────────
// 관리자 API (요청마다 token=비밀번호 검증)
// ────────────────────────────────────────────────────────────
function assertAdmin(token: string) {
  if (token !== MOCK_ADMIN_PASSWORD) throw new ApiError('비밀번호가 올바르지 않습니다.');
}

export async function adminLogin(password: string): Promise<boolean> {
  if (!IS_MOCK) {
    await realPost<{ ok: true }>('adminLogin', { token: password });
    return true;
  }
  assertAdmin(password);
  return true;
}

export async function getPending(token: string): Promise<Booking[]> {
  if (!IS_MOCK) return realPost<Booking[]>('getPending', { token });
  assertAdmin(token);
  const db = loadMock();
  return db.bookings
    .filter((b) => b.status === 'pending')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** 승인/반려. approve=true 승인, false 반려(이전 예약 유지) */
export async function decide(token: string, id: string, approve: boolean): Promise<void> {
  if (!IS_MOCK) {
    await realPost<{ ok: true }>('decide', { token, id, approve });
    return;
  }
  assertAdmin(token);
  const db = loadMock();
  const b = db.bookings.find((x) => x.id === id);
  if (!b || b.status !== 'pending') throw new ApiError('이미 처리된 신청이거나 존재하지 않습니다.');
  const now = new Date().toISOString();

  if (!approve) {
    // 반려 → 신청만 반려 처리, supersedes 대상(이전 예약)은 그대로 유지
    b.status = 'rejected';
    b.decidedAt = now;
    saveMock(db);
    return;
  }

  // 승인
  const target = b.supersedesId ? db.bookings.find((x) => x.id === b.supersedesId) : undefined;
  if (b.requestType === 'cancel') {
    b.status = 'cancelled'; // 취소 신청 자체는 현황판에 남기지 않음
    b.decidedAt = now;
    if (target && target.status === 'approved') {
      target.status = 'cancelled';
      target.decidedAt = now;
    }
  } else {
    // new / change 승인 → 확정. 변경이면 이전 예약을 취소 처리(대체)
    b.status = 'approved';
    b.decidedAt = now;
    if (target && target.status === 'approved') {
      target.status = 'cancelled';
      target.decidedAt = now;
    }
  }
  saveMock(db);
}

export async function addMember(token: string, name: string): Promise<void> {
  if (!IS_MOCK) return void (await realPost('addMember', { token, name }));
  assertAdmin(token);
  const db = loadMock();
  const clean = name.trim();
  if (!clean) throw new ApiError('이름을 입력하세요.');
  const existing = db.members.find((m) => m.name === clean);
  if (existing) existing.active = true;
  else db.members.push({ name: clean, active: true });
  saveMock(db);
}

export async function toggleMember(token: string, name: string, active: boolean): Promise<void> {
  if (!IS_MOCK) return void (await realPost('toggleMember', { token, name, active }));
  assertAdmin(token);
  const db = loadMock();
  const m = db.members.find((x) => x.name === name);
  if (m) m.active = active;
  saveMock(db);
}

export async function saveBlackouts(token: string, blackouts: string[]): Promise<void> {
  if (!IS_MOCK) return void (await realPost('saveBlackouts', { token, blackouts }));
  assertAdmin(token);
  const db = loadMock();
  db.blackouts = Array.from(new Set(blackouts)).sort();
  saveMock(db);
}

export async function updateSettings(token: string, settings: Settings): Promise<void> {
  if (!IS_MOCK) return void (await realPost('updateSettings', { token, settings }));
  assertAdmin(token);
  const db = loadMock();
  db.settings = settings;
  saveMock(db);
}

/** 특정 월의 회원별 신청 횟수 일괄 저장(그 달 quota 전체 교체) — 입금 상태는 유지 */
export async function saveQuotas(
  token: string,
  month: string,
  entries: { name: string; quota: number }[],
): Promise<void> {
  if (!IS_MOCK) return void (await realPost('saveQuotas', { token, month, entries }));
  assertAdmin(token);
  const db = loadMock();
  const prevPaid = new Map(db.quotas.filter((q) => q.month === month).map((q) => [q.name, !!q.paid]));
  db.quotas = db.quotas
    .filter((q) => q.month !== month)
    .concat(entries.map((e) => ({ month, name: e.name, quota: e.quota, paid: prevPaid.get(e.name) ?? false })));
  saveMock(db);
}

/** 그 달 레슨비 입금 여부 변경 (관리자 전용) */
export async function setPaid(token: string, month: string, name: string, paid: boolean): Promise<void> {
  if (!IS_MOCK) return void (await realPost('setPaid', { token, month, name, paid }));
  assertAdmin(token);
  const db = loadMock();
  const row = db.quotas.find((q) => q.month === month && q.name === name);
  if (!row) throw new ApiError('그 달 명단에 없는 회원입니다.');
  row.paid = paid;
  saveMock(db);
}

/** 관리자용 전체 상태(반려/취소 포함) — 관리자 대시보드 통계용 */
export async function getAdminState(token: string): Promise<AppState & { allBookings: Booking[] }> {
  if (!IS_MOCK) return realPost('getAdminState', { token });
  assertAdmin(token);
  const db = loadMock();
  return {
    settings: db.settings,
    members: db.members,
    blackouts: db.blackouts,
    bookings: db.bookings.filter((b) => b.status === 'pending' || b.status === 'approved'),
    quotas: db.quotas,
    allBookings: db.bookings,
  };
}
