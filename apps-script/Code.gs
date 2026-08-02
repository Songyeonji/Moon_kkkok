/**
 * 레슨 예약 백엔드 (Google Apps Script + Google 스프레드시트 DB)
 * 프론트(React)에서 fetch 로 호출:
 *   - 읽기: GET  ?action=getState
 *   - 쓰기: POST (Content-Type: text/plain) body = JSON { action, ... }
 *
 * ✅ 최초 1회: 상단 메뉴 [실행] → initSpreadsheet 실행(시트/헤더/기본설정 생성)
 * ✅ 관리자 비밀번호: [프로젝트 설정] → 스크립트 속성에 ADMIN_PASSWORD 추가
 */

var TZ = 'Asia/Seoul';
var SH = { MEMBERS: 'Members', BLACKOUTS: 'Blackouts', BOOKINGS: 'Bookings', SETTINGS: 'Settings', QUOTAS: 'Quotas' };

var H_MEMBERS = ['name', 'active'];
// Blackouts: 사용불가(레슨 없는) 날짜
var H_BLACKOUTS = ['date'];
var H_BOOKINGS = ['id', 'name', 'date', 'slot', 'status', 'requestType', 'supersedesId', 'createdAt', 'decidedAt', 'note'];
// availableWeekdays: 신청 가능 요일 (일=0..토=6) 콤마문자열. 기본 "1,2,4,5" = 월화목금
var H_SETTINGS = ['startTime', 'endTime', 'slotMinutes', 'capacityPerSlot', 'availableWeekdays'];
// Quotas: 달마다 회원별 신청 가능 횟수(학교 일정에 따라 4/8/10 등으로 다름)
// paid: 그 달 레슨비 입금 여부 (관리자만 변경)
var H_QUOTAS = ['month', 'name', 'quota', 'paid'];
// 그 달 Quotas 에 행이 없으면 '그 달 참여 대상 아님'(0회). 매월 명단·횟수가 다름.
var DEFAULT_QUOTA = 0;
var DEFAULT_WEEKDAYS = [1, 2, 4, 5]; // 월화목금

// ────────────────────────────── 엔트리포인트 ──────────────────────────────
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'getState') {
      return ContentService.createTextOutput(cachedStateJson()).setMimeType(ContentService.MimeType.JSON);
    }
    return json({ ok: false, error: '알 수 없는 action: ' + action });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  var body, action;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    action = body.action;
  } catch (err) {
    return json({ ok: false, error: '잘못된 요청입니다.' });
  }

  // 읽기 전용 action 은 락을 걸지 않는다(다른 요청을 기다리느라 느려지지 않도록).
  var isRead = action === 'adminLogin' || action === 'getPending' || action === 'getAdminState';
  var lock = null;
  if (!isRead) {
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    invalidateStateCache(); // 상태가 바뀌므로 캐시 비움
  }

  try {
    switch (action) {
      case 'submitRequest':
        return json({ ok: true, data: submitRequest(body) });
      case 'adminLogin':
        requireAdmin(body.token);
        return json({ ok: true, data: { ok: true } });
      case 'getPending':
        requireAdmin(body.token);
        return json({ ok: true, data: getPending() });
      case 'getAdminState':
        requireAdmin(body.token);
        return json({ ok: true, data: getAdminState() });
      case 'decide':
        requireAdmin(body.token);
        return json({ ok: true, data: decide(body.id, body.approve) });
      case 'addMember':
        requireAdmin(body.token);
        return json({ ok: true, data: addMember(body.name) });
      case 'toggleMember':
        requireAdmin(body.token);
        return json({ ok: true, data: toggleMember(body.name, body.active) });
      case 'saveBlackouts':
        requireAdmin(body.token);
        return json({ ok: true, data: saveBlackouts(body.blackouts) });
      case 'updateSettings':
        requireAdmin(body.token);
        return json({ ok: true, data: updateSettings(body.settings) });
      case 'saveQuotas':
        requireAdmin(body.token);
        return json({ ok: true, data: saveQuotas(body.month, body.entries) });
      case 'setPaid':
        requireAdmin(body.token);
        return json({ ok: true, data: setPaid(body.month, body.name, body.paid) });
      default:
        return json({ ok: false, error: '알 수 없는 action: ' + action });
    }
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ────────────────────────────── 응답 캐시 ──────────────────────────────
// 시트 읽기(RPC)가 느려서 getState 결과를 짧게 캐싱한다.
// 쓰기(예약/설정 변경) 시 즉시 무효화하므로 사용자는 항상 최신 상태를 본다.
var STATE_CACHE_KEY = 'state_v1';
var STATE_CACHE_SEC = 60;

function cachedStateJson() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(STATE_CACHE_KEY);
  if (hit) return hit;
  var payload = JSON.stringify({ ok: true, data: getState() });
  // 100KB 초과분은 캐시 불가 → 그냥 건너뜀
  if (payload.length < 95000) cache.put(STATE_CACHE_KEY, payload, STATE_CACHE_SEC);
  return payload;
}

function invalidateStateCache() {
  try {
    CacheService.getScriptCache().remove(STATE_CACHE_KEY);
  } catch (e) {
    // 캐시 삭제 실패는 무시 (다음 만료 때 갱신됨)
  }
}

// ────────────────────────────── 관리자 인증 ──────────────────────────────
function requireAdmin(token) {
  var pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!pw) throw new Error('서버에 ADMIN_PASSWORD 가 설정되지 않았습니다.');
  if (String(token) !== String(pw)) throw new Error('비밀번호가 올바르지 않습니다.');
}

// ────────────────────────────── 시트 유틸 ──────────────────────────────
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet(name) { return ss().getSheetByName(name); }
function truthy(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function fmtDate(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || '').trim(); }
function fmtTime(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'HH:mm') : String(v || '').trim(); }
function todayStr() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function nowIso() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function uid() { return Utilities.getUuid(); }

/** 시트별 기대 헤더 — 헤더 칸이 비어 있어도 값을 제대로 읽기 위한 안전장치 */
function expectedHeaders(name) {
  if (name === SH.SETTINGS) return H_SETTINGS;
  if (name === SH.MEMBERS) return H_MEMBERS;
  if (name === SH.BLACKOUTS) return H_BLACKOUTS;
  if (name === SH.BOOKINGS) return H_BOOKINGS;
  if (name === SH.QUOTAS) return H_QUOTAS;
  return null;
}

function readRows(name) {
  var sh = sheet(name);
  if (!sh) throw new Error('시트가 없습니다: ' + name + ' (initSpreadsheet 를 먼저 실행하세요)');
  var values = sh.getDataRange().getValues();
  var headers = values.shift();
  // 헤더 칸이 비어 있으면(나중에 컬럼을 추가했는데 헤더를 안 넣은 경우)
  // 기대하는 헤더 이름으로 채워, 값이 있어도 못 읽는 상황을 막는다.
  var expected = expectedHeaders(name);
  if (expected) {
    for (var i = 0; i < expected.length; i++) {
      if (!String(headers[i] == null ? '' : headers[i]).trim()) headers[i] = expected[i];
    }
  }
  return values
    .filter(function (r) { return r.join('') !== ''; })
    .map(function (r) {
      var o = {};
      headers.forEach(function (h, i) { o[h] = r[i]; });
      return o;
    });
}

function writeRows(name, headers, objRows) {
  var sh = sheet(name);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, headers.length).clearContent();
  if (objRows.length) {
    var matrix = objRows.map(function (o) {
      return headers.map(function (h) { return o[h] === undefined || o[h] === null ? '' : o[h]; });
    });
    sh.getRange(2, 1, matrix.length, headers.length).setValues(matrix);
  }
}

// ────────────────────────────── 도메인 read ──────────────────────────────
function readSettings() {
  var rows = readRows(SH.SETTINGS);
  var r = rows[0] || {};
  return {
    startTime: fmtTime(r.startTime) || '19:00',
    endTime: fmtTime(r.endTime) || '20:40',
    slotMinutes: Number(r.slotMinutes) || 10,
    capacityPerSlot: Number(r.capacityPerSlot) || 1,
    availableWeekdays: parseWeekdays(r.availableWeekdays),
  };
}

function parseWeekdays(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return DEFAULT_WEEKDAYS.slice();
  var arr = s.split(',').map(function (x) { return Number(String(x).trim()); }).filter(function (n) {
    return !isNaN(n) && n >= 0 && n <= 6;
  });
  return arr.length ? arr : DEFAULT_WEEKDAYS.slice();
}

/** "2026-08-05" 의 요일(일=0..토=6) — 타임존 무관 */
function weekdayOf(date) {
  var p = String(date).split('-');
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay();
}

function readMembers() {
  return readRows(SH.MEMBERS).map(function (r) {
    return { name: String(r.name).trim(), active: truthy(r.active) };
  }).filter(function (m) { return m.name; });
}

function readBlackouts() {
  return readRows(SH.BLACKOUTS)
    .map(function (r) { return fmtDate(r.date); })
    .filter(function (d) { return d; });
}

function readQuotas() {
  return readRows(SH.QUOTAS).map(function (r) {
    return { month: String(r.month).trim(), name: String(r.name).trim(), quota: Number(r.quota) || 0, paid: truthy(r.paid) };
  }).filter(function (q) { return q.month && q.name; });
}

function monthOf(date) { return String(date).slice(0, 7); }

function quotaFor(quotas, name, month) {
  var found = quotas.filter(function (q) { return q.name === name && q.month === month; })[0];
  return found ? found.quota : DEFAULT_QUOTA;
}

function readBookings() {
  return readRows(SH.BOOKINGS).map(function (r) {
    return {
      id: String(r.id),
      name: String(r.name),
      date: fmtDate(r.date),
      slot: fmtTime(r.slot),
      status: String(r.status),
      requestType: String(r.requestType),
      supersedesId: r.supersedesId ? String(r.supersedesId) : '',
      createdAt: String(r.createdAt),
      decidedAt: r.decidedAt ? String(r.decidedAt) : '',
      note: r.note ? String(r.note) : '',
    };
  }).filter(function (b) { return b.id; });
}

// ────────────────────────────── 슬롯 계산 ──────────────────────────────
function toMin(hhmm) { var p = hhmm.split(':'); return Number(p[0]) * 60 + Number(p[1]); }
function toHHMM(t) { var h = Math.floor(t / 60), m = t % 60; return pad(h) + ':' + pad(m); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function genSlots(start, end, step) {
  var out = [];
  if (!start || !end || !step) return out;
  var e = toMin(end);
  for (var c = toMin(start); c + step <= e; c += step) out.push(toHHMM(c));
  return out;
}

// ────────────────────────────── 공개 API ──────────────────────────────
function getState() {
  var bookings = readBookings().filter(function (b) { return b.status === 'pending' || b.status === 'approved'; });
  return {
    settings: readSettings(),
    members: readMembers().filter(function (m) { return m.active; }),
    blackouts: readBlackouts(),
    bookings: bookings,
    quotas: readQuotas(),
  };
}

function submitRequest(input) {
  var settings = readSettings();
  var members = readMembers();
  var blackouts = readBlackouts();
  var bookings = readBookings();

  var member = members.filter(function (m) { return m.name === input.name && m.active; })[0];
  if (!member) throw new Error('등록된 회원이 아닙니다. 관리자에게 문의하세요.');
  if (input.date < todayStr()) throw new Error('지난 날짜는 신청할 수 없습니다.');
  if (settings.availableWeekdays.indexOf(weekdayOf(input.date)) < 0) {
    throw new Error('신청 가능한 요일이 아닙니다.');
  }
  if (blackouts.indexOf(input.date) >= 0) throw new Error('사용불가로 지정된 날짜입니다.');

  if (input.requestType !== 'cancel') {
    var slots = genSlots(settings.startTime, settings.endTime, settings.slotMinutes);
    if (slots.indexOf(input.slot) < 0) throw new Error('유효한 시간대가 아닙니다.');
    var approved = bookings.filter(function (b) {
      return b.date === input.date && b.slot === input.slot && b.status === 'approved';
    }).length;
    if (approved >= settings.capacityPerSlot) throw new Error('이미 마감된 시간대입니다. 다른 시간을 선택하세요.');
  }

  // 월별 신청 횟수 제한(신규만): 하루 1레슨 기준, 다른 날짜에 이미 쓴 횟수로 판단
  if (input.requestType === 'new') {
    var month = monthOf(input.date);
    var quota = quotaFor(readQuotas(), input.name, month);
    if (quota <= 0) {
      throw new Error(Number(month.slice(5, 7)) + '월 신청 대상 명단에 없습니다. 관리자에게 문의하세요.');
    }
    var usedMap = {};
    bookings.forEach(function (b) {
      if (b.name === input.name && monthOf(b.date) === month && b.date !== input.date &&
          (b.status === 'approved' || (b.status === 'pending' && b.requestType === 'new'))) {
        usedMap[b.date] = true;
      }
    });
    if (Object.keys(usedMap).length >= quota) {
      throw new Error('이번 달 신청 가능 횟수(' + quota + '회)를 모두 사용했어요.');
    }
  }

  // 같은 회원의 같은 날짜 기존 '대기' 신청은 자동 철회 (해당 행만 수정)
  var withdrew = false;
  bookings.forEach(function (b) {
    if (b.name === input.name && b.date === input.date && b.status === 'pending') {
      b.status = 'cancelled';
      b.decidedAt = nowIso();
      withdrew = true;
    }
  });
  if (withdrew) writeRows(SH.BOOKINGS, H_BOOKINGS, bookings);

  // 신규 신청은 즉시 확정. 변경/취소만 관리자 승인 대기.
  var isNew = input.requestType === 'new';
  var createdAt = nowIso();
  var booking = {
    id: uid(),
    name: input.name,
    date: input.date,
    slot: input.slot || '',
    status: isNew ? 'approved' : 'pending',
    requestType: input.requestType,
    supersedesId: input.supersedesId || '',
    createdAt: createdAt,
    decidedAt: isNew ? createdAt : '',
    note: '',
  };
  // 전체 재작성 대신 한 줄만 추가 → 예약이 쌓여도 저장 속도가 일정하다.
  appendRow(SH.BOOKINGS, H_BOOKINGS, booking);
  return booking;
}

function appendRow(name, headers, obj) {
  var sh = sheet(name);
  sh.appendRow(headers.map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : obj[h]; }));
}

// ────────────────────────────── 관리자 API ──────────────────────────────
function getPending() {
  return readBookings().filter(function (b) { return b.status === 'pending'; })
    .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
}

function getAdminState() {
  var all = readBookings();
  return {
    settings: readSettings(),
    members: readMembers(),
    blackouts: readBlackouts(),
    bookings: all.filter(function (b) { return b.status === 'pending' || b.status === 'approved'; }),
    quotas: readQuotas(),
    allBookings: all,
  };
}

function decide(id, approve) {
  var bookings = readBookings();
  var b = bookings.filter(function (x) { return x.id === id; })[0];
  if (!b || b.status !== 'pending') throw new Error('이미 처리된 신청이거나 존재하지 않습니다.');
  var now = nowIso();
  var target = b.supersedesId ? bookings.filter(function (x) { return x.id === b.supersedesId; })[0] : null;

  if (!approve) {
    b.status = 'rejected';
    b.decidedAt = now;
  } else if (b.requestType === 'cancel') {
    b.status = 'cancelled';
    b.decidedAt = now;
    if (target && target.status === 'approved') { target.status = 'cancelled'; target.decidedAt = now; }
  } else {
    b.status = 'approved';
    b.decidedAt = now;
    if (target && target.status === 'approved') { target.status = 'cancelled'; target.decidedAt = now; }
  }
  writeRows(SH.BOOKINGS, H_BOOKINGS, bookings);
  return { ok: true };
}

function addMember(name) {
  var clean = String(name || '').trim();
  if (!clean) throw new Error('이름을 입력하세요.');
  var members = readMembers();
  var ex = members.filter(function (m) { return m.name === clean; })[0];
  if (ex) ex.active = true;
  else members.push({ name: clean, active: true });
  writeRows(SH.MEMBERS, H_MEMBERS, members);
  return { ok: true };
}

function toggleMember(name, active) {
  var members = readMembers();
  members.forEach(function (m) { if (m.name === name) m.active = !!active; });
  writeRows(SH.MEMBERS, H_MEMBERS, members);
  return { ok: true };
}

function saveBlackouts(blackouts) {
  var seen = {};
  var clean = (blackouts || []).map(function (d) { return fmtDate(d); }).filter(function (d) {
    if (!d || seen[d]) return false;
    seen[d] = true;
    return true;
  }).sort().map(function (d) { return { date: d }; });
  writeRows(SH.BLACKOUTS, H_BLACKOUTS, clean);
  return { ok: true };
}

function saveQuotas(month, entries) {
  var m = String(month).slice(0, 7);
  if (!m) throw new Error('월(month)이 필요합니다.');
  var all = readQuotas();
  // 명단을 다시 저장해도 기존 입금 상태는 유지한다.
  var paidMap = {};
  all.forEach(function (q) { if (q.month === m) paidMap[q.name] = q.paid; });
  var others = all.filter(function (q) { return q.month !== m; });
  var next = others.concat((entries || []).map(function (e) {
    var nm = String(e.name).trim();
    return { month: m, name: nm, quota: Number(e.quota) || 0, paid: !!paidMap[nm] };
  }).filter(function (e) { return e.name; }));
  writeRows(SH.QUOTAS, H_QUOTAS, next);
  return { ok: true };
}

/** 그 달 레슨비 입금 여부 변경 */
function setPaid(month, name, paid) {
  var m = String(month).slice(0, 7);
  var nm = String(name || '').trim();
  var all = readQuotas();
  var found = false;
  all.forEach(function (q) {
    if (q.month === m && q.name === nm) { q.paid = !!paid; found = true; }
  });
  if (!found) throw new Error('그 달 명단에 없는 회원입니다.');
  writeRows(SH.QUOTAS, H_QUOTAS, all);
  return { ok: true };
}

function updateSettings(s) {
  var wd = (s.availableWeekdays && s.availableWeekdays.length ? s.availableWeekdays : DEFAULT_WEEKDAYS);
  var row = {
    startTime: s.startTime,
    endTime: s.endTime,
    slotMinutes: Number(s.slotMinutes) || 10,
    capacityPerSlot: Number(s.capacityPerSlot) || 1,
    availableWeekdays: wd.join(','),
  };
  writeRows(SH.SETTINGS, H_SETTINGS, [row]);
  return { ok: true };
}

// ────────────────────────────── 최초 설정 ──────────────────────────────
function initSpreadsheet() {
  ensureSheet(SH.SETTINGS, H_SETTINGS);
  ensureSheet(SH.MEMBERS, H_MEMBERS);
  ensureSheet(SH.BLACKOUTS, H_BLACKOUTS);
  ensureSheet(SH.BOOKINGS, H_BOOKINGS);
  ensureSheet(SH.QUOTAS, H_QUOTAS);

  // 기본 설정이 비어 있으면 시드
  if (readRows(SH.SETTINGS).length === 0) {
    writeRows(SH.SETTINGS, H_SETTINGS, [
      { startTime: '19:00', endTime: '20:40', slotMinutes: 10, capacityPerSlot: 1, availableWeekdays: '1,2,4,5' },
    ]);
  }
  SpreadsheetApp.getUi && SpreadsheetApp.getActiveSpreadsheet().toast('초기화 완료!', 'moon lesson', 5);
}

function ensureSheet(name, headers) {
  var sh = sheet(name);
  if (!sh) sh = ss().insertSheet(name);
  var first = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  // 컬럼이 추가된 경우에도 헤더를 갱신하도록 전체 비교
  var needHeader = first.join('|') !== headers.join('|');
  if (needHeader) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  // 날짜/시간/월 컬럼을 텍스트로 고정해 자동 변환 방지
  if (name === SH.BLACKOUTS) sh.getRange('A2:A').setNumberFormat('@');
  if (name === SH.BOOKINGS) sh.getRange('C2:D').setNumberFormat('@');
  if (name === SH.QUOTAS) sh.getRange('A2:A').setNumberFormat('@');
  if (name === SH.SETTINGS) sh.getRange('E2:E').setNumberFormat('@'); // availableWeekdays 콤마문자열
}
