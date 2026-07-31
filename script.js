/* ============================================================
   시간외 근무 신청 시스템 - 메인 스크립트
   script.js

   주요 기능:
   1. 시간외 근무 자동 계산
   2. 폼 유효성 검증
   3. Google Apps Script 연동 (신청 / 조회)
   4. 관리자 페이지 로직
   5. CSV 다운로드
   ============================================================ */

/* ──────────────────────────────────────────
   ★ 설정값: 배포 후 여기에 GAS URL을 입력하세요 ★
   ────────────────────────────────────────── */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzJ4eXE17QwCFJY9sVj_0jlkqyODkFaXNZDNyJZcbuYVYD77G75xVAw1xHv8eUGMVqZjw/exec';

/* 관리자 비밀번호 (프론트 임시 검증 / GAS 서버 측 이중 검증) */
const ADMIN_PASSWORD = '1234'; // ← 실제 사용 시 변경 필요

/* 기본 근무 설정 (분 단위) */
const WORK_START  = timeToMin('08:30'); // 510분
const WORK_END    = timeToMin('17:30'); // 1050분
const LUNCH_START = timeToMin('12:00'); // 720분
const LUNCH_END   = timeToMin('13:00'); // 780분
const DIN_START   = timeToMin('18:00'); // 1080분
const DIN_END     = timeToMin('18:30'); // 1110분

/* ============================================================
   유틸리티 함수
   ============================================================ */

/**
 * "HH:MM" 문자열을 분(integer)으로 변환
 * @param {string} t - "HH:MM"
 * @returns {number} 분
 */
function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 분(integer)을 "H시간 M분" 형식으로 변환
 * @param {number} min
 * @returns {string}
 */
function minToLabel(min) {
  if (min <= 0) return '0시간 0분';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/**
 * 두 범위의 겹치는 분 계산
 * @param {number} s1 시작1 @param {number} e1 종료1
 * @param {number} s2 시작2 @param {number} e2 종료2
 * @returns {number} 겹치는 분
 */
function overlap(s1, e1, s2, e2) {
  return Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
}

/**
 * 오늘 날짜를 "YYYY년 MM월 DD일 (요일)" 형식으로 반환
 */
function getTodayLabel() {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

/**
 * 현재 날짜시간을 ISO 문자열로 반환 (신청일시 저장용)
 */
function getNowISO() {
  return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

/* ============================================================
   초기화
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // 오늘 날짜 표시
  document.getElementById('today-date').textContent = getTodayLabel();

  // 시간 입력값 변경 시 자동 계산
  document.getElementById('start-time').addEventListener('change', calcOvertime);
  document.getElementById('end-time').addEventListener('change', calcOvertime);
  document.getElementById('dinner').addEventListener('change', calcOvertime);

  // 사유 글자 수 카운터
  document.getElementById('reason').addEventListener('input', () => {
    const len = document.getElementById('reason').value.length;
    document.getElementById('char-count').textContent = `${len} / 500`;
  });

  // PWA 서비스워커 등록
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // 초기 계산 실행
  calcOvertime();
});

/* ============================================================
   시간외 근무 자동 계산
   ============================================================ */
/**
 * 출근~퇴근 시간을 바탕으로 시간외 근무 시간을 계산하여 화면에 표시
 *
 * 계산 방식:
 *   실근무 = 퇴근 - 출근
 *   - 기본근무 (08:30~17:30 중 실제 근무한 시간)
 *   - 점심 차감 (12:00~13:00 중 실제 근무 구간과 겹치는 시간)
 *   - 저녁 차감 (체크 시 18:00~18:30 중 겹치는 시간)
 *   = 시간외 근무
 */
function calcOvertime() {
  const startVal = document.getElementById('start-time').value; // "HH:MM"
  const endVal   = document.getElementById('end-time').value;
  const hasDinner = document.getElementById('dinner').checked;

  // 저녁 차감 행 표시/숨김
  document.getElementById('dinner-row').style.display = hasDinner ? 'flex' : 'none';

  if (!startVal || !endVal) {
    document.getElementById('overtime-display').textContent = '0시간 0분';
    return;
  }

  const s = timeToMin(startVal);
  const e = timeToMin(endVal);

  // 퇴근이 출근보다 빠른 경우 — 경고만 표시, 계산 중단
  if (e <= s) {
    document.getElementById('overtime-display').textContent = '시간 오류';
    document.getElementById('err-time').textContent = '퇴근시간은 출근시간보다 늦어야 합니다.';
    return;
  }
  document.getElementById('err-time').textContent = '';

  // 전체 근무 구간 (출근 ~ 퇴근)
  const totalWork = e - s;

  // 기본 근무에 해당하는 구간 (출근~퇴근 중 08:30~17:30 겹치는 부분)
  const baseWork = overlap(s, e, WORK_START, WORK_END);

  // 점심 차감 (출근~퇴근 중 12:00~13:00 겹치는 부분)
  const lunchDeduct = overlap(s, e, LUNCH_START, LUNCH_END);

  // 저녁 차감
  const dinnerDeduct = hasDinner ? overlap(s, e, DIN_START, DIN_END) : 0;

  // 시간외 = 전체근무 - 기본근무 - 점심차감 - 저녁차감
  // (기본근무 구간 내 점심은 이미 baseWork에서 제외됨에 유의)
  // 실제로는: 총 근무 - 점심 - 저녁 - 기본순수근무시간(점심제외)
  const basePure = baseWork - lunchDeduct; // 순수 기본 근무
  const overtime = Math.max(0, totalWork - lunchDeduct - dinnerDeduct - basePure);

  document.getElementById('overtime-display').textContent = minToLabel(overtime);

  // 계산된 값을 전역에 저장 (신청 시 사용)
  window._overtimeMin = overtime;
  window._overtimeLabel = minToLabel(overtime);
}

/* ============================================================
   페이지 전환
   ============================================================ */
/**
 * 지정한 페이지만 active 처리
 * @param {string} pageName - 'form' | 'admin-login' | 'admin'
 */
function showPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${pageName}`).classList.add('active');
  window.scrollTo(0, 0);
}

/* ============================================================
   유효성 검증
   ============================================================ */
/**
 * 신청 폼 유효성 검증
 * @returns {boolean} 유효 여부
 */
function validateForm() {
  let valid = true;

  const name = document.getElementById('name').value.trim();
  const team = document.getElementById('team').value;
  const start = document.getElementById('start-time').value;
  const end   = document.getElementById('end-time').value;
  const reason = document.getElementById('reason').value.trim();

  // 이름
  if (!name) {
    setError('err-name', '이름을 입력해 주세요.', 'name');
    valid = false;
  } else {
    clearError('err-name', 'name');
  }

  // 팀
  if (!team) {
    setError('err-team', '팀을 선택해 주세요.', 'team');
    valid = false;
  } else {
    clearError('err-team', 'team');
  }

  // 시간
  if (start && end && timeToMin(end) <= timeToMin(start)) {
    setError('err-time', '퇴근시간은 출근시간보다 늦어야 합니다.', 'start-time');
    valid = false;
  } else {
    clearError('err-time', 'start-time');
  }

  // 사유
  if (!reason) {
    setError('err-reason', '근무 사유를 입력해 주세요.', 'reason');
    valid = false;
  } else {
    clearError('err-reason', 'reason');
  }

  return valid;
}

function setError(errId, msg, inputId) {
  document.getElementById(errId).textContent = msg;
  if (inputId) document.getElementById(inputId).classList.add('error');
}
function clearError(errId, inputId) {
  document.getElementById(errId).textContent = '';
  if (inputId) document.getElementById(inputId).classList.remove('error');
}

/* ============================================================
   신청 제출
   ============================================================ */

/** 중복 제출 방지 플래그 */
let _isSubmitting = false;

/**
 * 신청 버튼 클릭 핸들러
 * 유효성 검증 → GAS 전송 → 결과 처리
 */
async function submitForm() {
  if (_isSubmitting) return; // 중복 클릭 방지
  if (!validateForm()) return;

  // 로딩 상태 진입
  setLoading(true);
  _isSubmitting = true;

  // 전송 데이터 구성
  const payload = {
    action: 'submit',
    name:     document.getElementById('name').value.trim(),
    team:     document.getElementById('team').value,
    startTime: document.getElementById('start-time').value,
    endTime:   document.getElementById('end-time').value,
    dinner:    document.getElementById('dinner').checked ? 'Y' : 'N',
    overtime:  window._overtimeLabel || '0시간 0분',
    reason:   document.getElementById('reason').value.trim(),
    appliedAt: getNowISO(),
  };

  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      // GAS CORS 제약으로 인해 no-cors 사용 → 응답 못 받음
      // 실제 응답이 필요한 경우 GAS 측에서 CORS 헤더를 설정해야 함
      // 여기서는 응답이 없어도 성공으로 처리 (GAS가 받은 것으로 간주)
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // no-cors 모드에서는 응답 타입이 'opaque' → 성공으로 처리
    showToast('✅ 신청이 완료되었습니다.', 'success');
    resetForm();

  } catch (err) {
    showToast('❌ 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
    console.error('[submitForm]', err);
  } finally {
    setLoading(false);
    _isSubmitting = false;
  }
}

/**
 * 신청 버튼 로딩 상태 전환
 */
function setLoading(isLoading) {
  const btn = document.getElementById('btn-submit');
  const txt = document.getElementById('btn-text');
  const spinner = document.getElementById('btn-spinner');
  btn.disabled = isLoading;
  txt.textContent = isLoading ? '신청 중...' : '신청하기';
  spinner.style.display = isLoading ? 'inline-block' : 'none';
}

/**
 * 폼 초기화 (신청 완료 후)
 */
function resetForm() {
  document.getElementById('name').value = '';
  document.getElementById('team').value = '';
  document.getElementById('start-time').value = '08:30';
  document.getElementById('end-time').value = '17:30';
  document.getElementById('dinner').checked = false;
  document.getElementById('reason').value = '';
  document.getElementById('char-count').textContent = '0 / 500';
  ['name','team','start-time','end-time','reason'].forEach(id => {
    document.getElementById(id).classList.remove('error');
  });
  ['err-name','err-team','err-time','err-reason'].forEach(id => {
    document.getElementById(id).textContent = '';
  });
  calcOvertime();
}

/* ============================================================
   관리자 로그인
   ============================================================ */

/** 로그인 여부 상태 */
let _adminLoggedIn = false;

/** 관리자 페이지 진입 시 불러온 전체 데이터 캐시 */
let _adminData = [];

function adminLogin() {
  const pw = document.getElementById('admin-pw').value;
  if (pw === ADMIN_PASSWORD) {
    _adminLoggedIn = true;
    document.getElementById('admin-pw').value = '';
    document.getElementById('err-admin-pw').textContent = '';
    showPage('admin');
    // 기본 조회 (오늘 날짜)
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('filter-start').value = today.slice(0, 7) + '-01'; // 이번달 1일
    document.getElementById('filter-end').value = today;
    fetchAdminData();
  } else {
    document.getElementById('err-admin-pw').textContent = '비밀번호가 올바르지 않습니다.';
  }
}

function adminLogout() {
  _adminLoggedIn = false;
  _adminData = [];
  showPage('form');
}

/* ============================================================
   관리자: 데이터 조회
   ============================================================ */
/**
 * GAS에서 데이터를 조회하여 테이블 렌더링
 */
async function fetchAdminData() {
  if (!_adminLoggedIn) return;

  const params = new URLSearchParams({
    action:    'getData',
    password:  ADMIN_PASSWORD,
    startDate: document.getElementById('filter-start').value || '',
    endDate:   document.getElementById('filter-end').value || '',
    name:      document.getElementById('filter-name').value.trim() || '',
    team:      document.getElementById('filter-team').value || '',
  });

  // 로딩 표시
  document.getElementById('admin-tbody').innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">조회 중...</td></tr>';
  document.getElementById('admin-table-wrap').style.display = 'block';
  document.getElementById('no-data').style.display = 'none';
  document.getElementById('summary-card').style.display = 'none';
  document.getElementById('btn-csv').style.display = 'none';

  try {
    const res = await fetch(`${GAS_URL}?${params.toString()}`);
    const json = await res.json();

    if (json.success && json.data.length > 0) {
      _adminData = json.data;
      renderAdminTable(json.data);
      renderSummary(json.data);
    } else {
      _adminData = [];
      document.getElementById('admin-table-wrap').style.display = 'none';
      document.getElementById('no-data').style.display = 'block';
    }
  } catch (err) {
    console.error('[fetchAdminData]', err);
    showToast('데이터 조회 중 오류가 발생했습니다.', 'error');
    document.getElementById('admin-table-wrap').style.display = 'none';
    document.getElementById('no-data').style.display = 'block';
    document.getElementById('no-data').textContent = '조회 중 오류가 발생했습니다.';
  }
}

/**
 * 조회 결과를 테이블로 렌더링
 */
function renderAdminTable(data) {
  const tbody = document.getElementById('admin-tbody');
  tbody.innerHTML = '';

  data.forEach(row => {
    const tr = document.createElement('tr');
    // 컬럼 순서: 신청일시, 이름, 팀, 출근, 퇴근, 저녁, 시간외, 사유
    tr.innerHTML = `
      <td>${row.appliedAt || ''}</td>
      <td>${row.name || ''}</td>
      <td>${row.team || ''}</td>
      <td>${row.startTime || ''}</td>
      <td>${row.endTime || ''}</td>
      <td>${row.dinner === 'Y' ? '✓' : '-'}</td>
      <td style="color:#1B6FE8;font-weight:600;">${row.overtime || ''}</td>
      <td class="reason-cell" title="${(row.reason || '').replace(/"/g,'&quot;')}">${row.reason || ''}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('admin-table-wrap').style.display = 'block';
  document.getElementById('btn-csv').style.display = 'block';
}

/**
 * 합계 카드 렌더링
 */
function renderSummary(data) {
  let totalMin = 0;

  data.forEach(row => {
    // "X시간 Y분" → 분으로 파싱
    const ot = row.overtime || '';
    const h = (ot.match(/(\d+)시간/) || [0, 0])[1];
    const m = (ot.match(/(\d+)분/)   || [0, 0])[1];
    totalMin += Number(h) * 60 + Number(m);
  });

  document.getElementById('sum-count').textContent = `${data.length}건`;
  document.getElementById('sum-hours').textContent = minToLabel(totalMin);
  document.getElementById('summary-card').style.display = 'block';
}

/* ============================================================
   CSV 다운로드
   ============================================================ */
/**
 * 현재 조회된 데이터를 CSV 파일로 다운로드
 */
function downloadCSV() {
  if (!_adminData.length) {
    showToast('다운로드할 데이터가 없습니다.', 'error');
    return;
  }

  const headers = ['신청일시','이름','팀','출근시간','퇴근시간','저녁식사','시간외근무','사유'];
  const rows = _adminData.map(r => [
    `"${r.appliedAt || ''}"`,
    `"${r.name || ''}"`,
    `"${r.team || ''}"`,
    `"${r.startTime || ''}"`,
    `"${r.endTime || ''}"`,
    `"${r.dinner === 'Y' ? '예' : '아니오'}"`,
    `"${r.overtime || ''}"`,
    `"${(r.reason || '').replace(/"/g, '""')}"`,
  ].join(','));

  // BOM 추가: 한글 깨짐 방지
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `시간외근무신청_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   토스트 메시지
   ============================================================ */
let _toastTimer = null;

/**
 * 토스트 메시지 표시
 * @param {string} msg   메시지
 * @param {string} type  'success' | 'error' | ''
 * @param {number} duration 표시 시간(ms)
 */
function showToast(msg, type = '', duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';
  // 강제 리플로우 → 애니메이션 시작
  void toast.offsetWidth;
  toast.classList.add('show');

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, duration);
}
