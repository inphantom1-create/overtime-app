/* ============================================================
   시간외 근무 신청 시스템 - script.js
   조회: JSONP 방식 (CORS 완전 우회)
   저장/삭제: no-cors POST 방식
   ============================================================ */

/* ★ 배포 후 반드시 수정 ★ */
const GAS_URL = 'https://script.google.com/macros/s/여기에_배포된_URL_입력/exec';
const ADMIN_PASSWORD = '1234';

/* 기본 근무 시간 (분) */
const WORK_START  = timeToMin('08:30');
const WORK_END    = timeToMin('17:30');
const LUNCH_START = timeToMin('12:00');
const LUNCH_END   = timeToMin('13:00');
const DIN_START   = timeToMin('18:00');
const DIN_END     = timeToMin('18:30');

/* 기본 신청인 목록 */
const DEFAULT_MEMBERS = [
  '하정열','강경민','오근탁','김지필','김민수','김동영','조재선','조웅제',
  '조성훈','오석순','김희원','양지유','배경순','김향란','진종민','박채영',
  '전지민','김기태','김재룡','배성준','임현준','김태양','이정찬'
];

/* ============================================================
   유틸리티
   ============================================================ */
function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minToLabel(min) {
  if (min <= 0) return '0시간 0분';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}
function overlap(s1, e1, s2, e2) {
  return Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
}
function getTodayLabel() {
  const days = ['일','월','화','수','목','금','토'];
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}
function getNowISO() {
  return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

/* ============================================================
   JSONP 조회 함수 (CORS 완전 우회)
   ============================================================ */
function fetchWithJsonp(params) {
  return new Promise((resolve, reject) => {
    // 고유 콜백 이름 생성
    const cbName = 'jsonp_cb_' + Date.now();

    // 타임아웃 10초
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('요청 시간 초과'));
    }, 10000);

    // 콜백 함수 등록
    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      const el = document.getElementById('jsonp-script-' + cbName);
      if (el) el.remove();
    }

    // script 태그로 요청
    const qs = new URLSearchParams({ ...params, callback: cbName }).toString();
    const script = document.createElement('script');
    script.id  = 'jsonp-script-' + cbName;
    script.src = `${GAS_URL}?${qs}`;
    script.onerror = () => { cleanup(); reject(new Error('네트워크 오류')); };
    document.body.appendChild(script);
  });
}

/* ============================================================
   신청인 목록 관리 (localStorage)
   ============================================================ */
function getMembers() {
  try {
    const saved = localStorage.getItem('overtime_members');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return [...DEFAULT_MEMBERS];
}
function saveMembers(list) {
  try { localStorage.setItem('overtime_members', JSON.stringify(list)); } catch(e) {}
}
function refreshNameSelect() {
  const members = getMembers();
  const sel = document.getElementById('name');
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- 이름 선택 --</option>';
  members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    sel.appendChild(opt);
  });
  sel.value = cur;

  const filterSel = document.getElementById('filter-name');
  if (filterSel) {
    const curF = filterSel.value;
    filterSel.innerHTML = '<option value="">전체</option>';
    members.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      filterSel.appendChild(opt);
    });
    filterSel.value = curF;
  }
}
function renderMemberList() {
  const members = getMembers();
  const wrap = document.getElementById('member-list');
  if (!wrap) return;
  if (members.length === 0) {
    wrap.innerHTML = '<div class="no-data" style="border:none;padding:20px 0;">등록된 신청인이 없습니다.</div>';
    return;
  }
  wrap.innerHTML = members.map((m, i) => `
    <div class="member-item">
      <span class="member-name">${i + 1}. ${m}</span>
      <button class="btn-delete-member" onclick="deleteMember(${i})">삭제</button>
    </div>
  `).join('');
}
function addMember() {
  const input = document.getElementById('new-member');
  const errEl = document.getElementById('err-member');
  const name  = input.value.trim();
  if (!name) { errEl.textContent = '이름을 입력해 주세요.'; return; }
  const members = getMembers();
  if (members.includes(name)) { errEl.textContent = '이미 등록된 이름입니다.'; return; }
  members.push(name);
  saveMembers(members);
  input.value = ''; errEl.textContent = '';
  renderMemberList(); refreshNameSelect();
  showToast(`✅ "${name}" 추가되었습니다.`, 'success');
}
function deleteMember(index) {
  const members = getMembers();
  const name = members[index];
  if (!confirm(`"${name}"을(를) 삭제할까요?`)) return;
  members.splice(index, 1);
  saveMembers(members);
  renderMemberList(); refreshNameSelect();
  showToast(`🗑️ "${name}" 삭제되었습니다.`, '');
}

/* ============================================================
   초기화
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('today-date').textContent = getTodayLabel();
  document.getElementById('work-date').value = new Date().toISOString().split('T')[0];
  refreshNameSelect();
  document.getElementById('start-time').addEventListener('change', calcOvertime);
  document.getElementById('end-time').addEventListener('change', calcOvertime);
  document.getElementById('dinner').addEventListener('change', calcOvertime);
  document.getElementById('reason').addEventListener('input', () => {
    const len = document.getElementById('reason').value.length;
    document.getElementById('char-count').textContent = `${len} / 500`;
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  calcOvertime();
});

/* ============================================================
   시간외 근무 자동 계산
   ============================================================ */
function calcOvertime() {
  const startVal  = document.getElementById('start-time').value;
  const endVal    = document.getElementById('end-time').value;
  const hasDinner = document.getElementById('dinner').checked;
  document.getElementById('dinner-row').style.display = hasDinner ? 'flex' : 'none';
  if (!startVal || !endVal) {
    document.getElementById('overtime-display').textContent = '0시간 0분';
    return;
  }
  const s = timeToMin(startVal);
  const e = timeToMin(endVal);
  if (e <= s) {
    document.getElementById('overtime-display').textContent = '시간 오류';
    document.getElementById('err-time').textContent = '퇴근시간은 출근시간보다 늦어야 합니다.';
    return;
  }
  document.getElementById('err-time').textContent = '';
  const totalWork    = e - s;
  const baseWork     = overlap(s, e, WORK_START, WORK_END);
  const lunchDeduct  = overlap(s, e, LUNCH_START, LUNCH_END);
  const dinnerDeduct = hasDinner ? overlap(s, e, DIN_START, DIN_END) : 0;
  const basePure     = baseWork - lunchDeduct;
  const overtime     = Math.max(0, totalWork - lunchDeduct - dinnerDeduct - basePure);
  document.getElementById('overtime-display').textContent = minToLabel(overtime);
  window._overtimeLabel = minToLabel(overtime);
}

/* ============================================================
   페이지 / 탭 전환
   ============================================================ */
function showPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${pageName}`).classList.add('active');
  window.scrollTo(0, 0);
}
function switchTab(tab) {
  document.getElementById('tab-data').classList.toggle('active', tab === 'data');
  document.getElementById('tab-member').classList.toggle('active', tab === 'member');
  document.getElementById('panel-data').style.display   = tab === 'data'   ? 'block' : 'none';
  document.getElementById('panel-member').style.display = tab === 'member' ? 'block' : 'none';
  if (tab === 'member') renderMemberList();
}

/* ============================================================
   유효성 검증
   ============================================================ */
function validateForm() {
  let valid = true;
  const name    = document.getElementById('name').value;
  const job     = document.getElementById('job').value;
  const workDate = document.getElementById('work-date').value;
  const start   = document.getElementById('start-time').value;
  const end     = document.getElementById('end-time').value;
  const reason  = document.getElementById('reason').value.trim();

  if (!name)    { setError('err-name', '이름을 선택해 주세요.', 'name');       valid = false; }
  else            clearError('err-name', 'name');
  if (!job)     { setError('err-job',  '직무를 선택해 주세요.', 'job');        valid = false; }
  else            clearError('err-job', 'job');
  if (!workDate){ setError('err-date', '근무 날짜를 선택해 주세요.', 'work-date'); valid = false; }
  else            clearError('err-date', 'work-date');
  if (start && end && timeToMin(end) <= timeToMin(start)) {
    setError('err-time', '퇴근시간은 출근시간보다 늦어야 합니다.', 'start-time'); valid = false;
  } else          clearError('err-time', 'start-time');
  if (!reason)  { setError('err-reason', '근무 사유를 입력해 주세요.', 'reason'); valid = false; }
  else            clearError('err-reason', 'reason');
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
   신청 제출 (no-cors POST)
   ============================================================ */
let _isSubmitting = false;
async function submitForm() {
  if (_isSubmitting) return;
  if (!validateForm()) return;
  setLoading(true); _isSubmitting = true;
  const payload = {
    action:    'submit',
    name:      document.getElementById('name').value,
    job:       document.getElementById('job').value,
    workDate:  document.getElementById('work-date').value,
    startTime: document.getElementById('start-time').value,
    endTime:   document.getElementById('end-time').value,
    dinner:    document.getElementById('dinner').checked ? 'Y' : 'N',
    overtime:  window._overtimeLabel || '0시간 0분',
    reason:    document.getElementById('reason').value.trim(),
    appliedAt: getNowISO(),
  };
  try {
    await fetch(GAS_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showToast('✅ 신청이 완료되었습니다.', 'success');
    resetForm();
  } catch(err) {
    showToast('❌ 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
  } finally {
    setLoading(false); _isSubmitting = false;
  }
}
function setLoading(isLoading) {
  document.getElementById('btn-text').textContent = isLoading ? '신청 중...' : '신청하기';
  document.getElementById('btn-spinner').style.display = isLoading ? 'inline-block' : 'none';
  document.getElementById('btn-submit').disabled = isLoading;
}
function resetForm() {
  ['name','job'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('work-date').value  = new Date().toISOString().split('T')[0];
  document.getElementById('start-time').value = '08:30';
  document.getElementById('end-time').value   = '17:30';
  document.getElementById('dinner').checked   = false;
  document.getElementById('reason').value     = '';
  document.getElementById('char-count').textContent = '0 / 500';
  ['name','job','work-date','start-time','end-time','reason'].forEach(id =>
    document.getElementById(id).classList.remove('error'));
  ['err-name','err-job','err-date','err-time','err-reason'].forEach(id =>
    document.getElementById(id).textContent = '');
  calcOvertime();
}

/* ============================================================
   관리자 로그인 / 로그아웃
   ============================================================ */
let _adminLoggedIn = false;
let _adminData = [];
function adminLogin() {
  const pw = document.getElementById('admin-pw').value;
  if (pw === ADMIN_PASSWORD) {
    _adminLoggedIn = true;
    document.getElementById('admin-pw').value = '';
    document.getElementById('err-admin-pw').textContent = '';
    showPage('admin');
    refreshNameSelect();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('filter-start').value = today.slice(0,7) + '-01';
    document.getElementById('filter-end').value   = today;
    fetchAdminData();
  } else {
    document.getElementById('err-admin-pw').textContent = '비밀번호가 올바르지 않습니다.';
  }
}
function adminLogout() {
  _adminLoggedIn = false; _adminData = [];
  showPage('form');
}

/* ============================================================
   관리자: 데이터 조회 (JSONP 방식)
   ============================================================ */
async function fetchAdminData() {
  if (!_adminLoggedIn) return;

  document.getElementById('admin-tbody').innerHTML =
    '<tr><td colspan="10" style="text-align:center;padding:20px;">조회 중...</td></tr>';
  document.getElementById('admin-table-wrap').style.display = 'block';
  document.getElementById('no-data').style.display   = 'none';
  document.getElementById('summary-card').style.display = 'none';
  document.getElementById('btn-csv').style.display   = 'none';

  try {
    // JSONP 방식으로 GAS에 조회 요청
    const json = await fetchWithJsonp({
      action:    'getData',
      password:  ADMIN_PASSWORD,
      startDate: document.getElementById('filter-start').value || '',
      endDate:   document.getElementById('filter-end').value   || '',
      name:      document.getElementById('filter-name').value  || '',
      job:       document.getElementById('filter-job').value   || '',
    });

    if (json.success && json.data && json.data.length > 0) {
      _adminData = json.data;
      renderAdminTable(json.data);
      renderSummary(json.data);
    } else {
      _adminData = [];
      document.getElementById('admin-table-wrap').style.display = 'none';
      document.getElementById('no-data').style.display = 'block';
      document.getElementById('no-data').textContent = '조회된 데이터가 없습니다.';
    }
  } catch(err) {
    showToast('데이터 조회 중 오류가 발생했습니다.', 'error');
    document.getElementById('admin-table-wrap').style.display = 'none';
    document.getElementById('no-data').style.display = 'block';
    document.getElementById('no-data').textContent = '조회 중 오류가 발생했습니다.';
  }
}

function renderAdminTable(data) {
  const tbody = document.getElementById('admin-tbody');
  tbody.innerHTML = '';
  data.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><button class="btn-delete-row" onclick="openDeleteModal(${idx})">🗑 삭제</button></td>
      <td>${row.appliedAt || ''}</td>
      <td>${row.name || ''}</td>
      <td>${row.job || ''}</td>
      <td>${row.workDate || ''}</td>
      <td>${row.startTime || ''}</td>
      <td>${row.endTime || ''}</td>
      <td>${row.dinner === 'Y' ? '✓' : '-'}</td>
      <td style="color:#1B6FE8;font-weight:600;">${row.overtime || ''}</td>
      <td class="reason-cell" title="${(row.reason||'').replace(/"/g,'&quot;')}">${row.reason||''}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('admin-table-wrap').style.display = 'block';
  document.getElementById('btn-csv').style.display = 'block';
}

function renderSummary(data) {
  let totalMin = 0;
  data.forEach(row => {
    const ot = row.overtime || '';
    const h = (ot.match(/(\d+)시간/) || [0,0])[1];
    const m = (ot.match(/(\d+)분/)   || [0,0])[1];
    totalMin += Number(h)*60 + Number(m);
  });
  document.getElementById('sum-count').textContent = `${data.length}건`;
  document.getElementById('sum-hours').textContent = minToLabel(totalMin);
  document.getElementById('summary-card').style.display = 'block';
}

/* ============================================================
   삭제 모달
   ============================================================ */
let _deleteTargetIdx = null;
function openDeleteModal(idx) {
  _deleteTargetIdx = idx;
  const row = _adminData[idx];
  document.getElementById('modal-desc').textContent =
    `${row.name} · ${row.workDate} · ${row.overtime} 내역을 삭제할까요?`;
  document.getElementById('modal-overlay').style.display = 'flex';
}
function closeModal() {
  _deleteTargetIdx = null;
  document.getElementById('modal-overlay').style.display = 'none';
}
async function confirmDelete() {
  if (_deleteTargetIdx === null) return;
  const row = _adminData[_deleteTargetIdx];
  closeModal();
  try {
    await fetch(GAS_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteRow', password: ADMIN_PASSWORD, appliedAt: row.appliedAt, name: row.name }),
    });
    showToast('🗑️ 삭제되었습니다.', '');
    _adminData.splice(_deleteTargetIdx, 1);
    if (_adminData.length > 0) {
      renderAdminTable(_adminData);
      renderSummary(_adminData);
    } else {
      document.getElementById('admin-table-wrap').style.display = 'none';
      document.getElementById('no-data').style.display = 'block';
      document.getElementById('no-data').textContent = '조회된 데이터가 없습니다.';
      document.getElementById('summary-card').style.display = 'none';
      document.getElementById('btn-csv').style.display = 'none';
    }
  } catch(err) {
    showToast('삭제 중 오류가 발생했습니다.', 'error');
  }
}

/* ============================================================
   CSV 다운로드
   ============================================================ */
function downloadCSV() {
  if (!_adminData.length) { showToast('다운로드할 데이터가 없습니다.', 'error'); return; }
  const headers = ['신청일시','이름','직무','근무날짜','출근시간','퇴근시간','저녁식사','시간외근무','사유'];
  const rows = _adminData.map(r => [
    `"${r.appliedAt||''}"`, `"${r.name||''}"`, `"${r.job||''}"`,
    `"${r.workDate||''}"`, `"${r.startTime||''}"`, `"${r.endTime||''}"`,
    `"${r.dinner==='Y'?'예':'아니오'}"`, `"${r.overtime||''}"`,
    `"${(r.reason||'').replace(/"/g,'""')}"`,
  ].join(','));
  const csv  = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `시간외근무신청_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ============================================================
   토스트
   ============================================================ */
let _toastTimer = null;
function showToast(msg, type='', duration=3000) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type}`;
  t.style.display = 'block'; void t.offsetWidth; t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.style.display = 'none'; }, 300);
  }, duration);
}
