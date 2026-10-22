const KEY = 'lifestyle-v1';
const $ = (id) => document.getElementById(id);
const p2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 저장 데이터 정리: 예전 방식(목표 글 하나)은 체크리스트 첫 항목으로 옮김
function normalize(o) {
  const x = Object.assign({ goal: '', goals: [], code: '', days: {}, active: {} }, o);
  if (!Array.isArray(x.goals)) x.goals = [];
  if (x.goal && !x.goals.length) x.goals.push({ id: 'g' + Date.now().toString(36), text: String(x.goal), done: false });
  x.goal = '';
  return x;
}
function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch { return normalize({}); }
}
let S = load();
let pending = null; // 끝난 공부 세션 (자가진단 대기)
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

// 새벽 4시 전에 누르는 기록은 전날로 취급
function dayKey(t = Date.now()) {
  const d = new Date(t - 4 * 3600e3);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
function day(k) {
  if (!S.days[k]) S.days[k] = { wake: null, sleep: null, steps: null, exercise: [], study: [] };
  return S.days[k];
}
const fmtT = (t) => (t ? new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '–');
const dur = (a) => a.end - a.start;
const mins = (a) => Math.round(dur(a) / 60000);
// 1분 미만도 "–"가 아니라 초 단위로 보여줌
function fmtD(ms) {
  if (!ms || ms <= 0) return '–';
  if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))}초`;
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}
const sumMs = (arr) => arr.reduce((s, a) => s + dur(a), 0);

function toggle(kind) {
  if (S.active[kind]) {
    const sess = { start: S.active[kind], end: Date.now() };
    delete S.active[kind];
    const d = day(dayKey(sess.start));
    if (kind === 'study') {
      pending = { sess, key: dayKey(sess.start) };
      $('dlgInfo').textContent = `공부 시간: ${fmtD(dur(sess))}`;
      $('focus').value = 70; $('fv').textContent = 70; $('note').value = '';
      $('dlg').showModal();
    } else {
      d.exercise.push(sess);
    }
  } else {
    S.active[kind] = Date.now();
  }
  save(); render();
}

$('bWake').onclick = () => { day(dayKey()).wake = Date.now(); save(); render(); };
$('bSleep').onclick = () => { day(dayKey()).sleep = Date.now(); save(); render(); };
$('bEx').onclick = () => toggle('exercise');
$('bStudy').onclick = () => toggle('study');
$('bSteps').onclick = () => {
  const v = parseInt($('steps').value, 10);
  if (!isNaN(v)) { day(dayKey()).steps = v; save(); render(); }
};
$('focus').oninput = (e) => ($('fv').textContent = e.target.value);
function finishStudy(withData) {
  if (!pending) return;
  const s = pending.sess;
  if (withData) { s.focus = parseInt($('focus').value, 10); s.note = $('note').value.trim(); }
  day(pending.key).study.push(s);
  pending = null; $('dlg').close(); save(); render();
}
$('dSave').onclick = () => finishStudy(true);
$('dSkip').onclick = () => finishStudy(false);
$('dlg').addEventListener('cancel', (e) => { e.preventDefault(); finishStudy(false); });

// 목표 체크리스트
function renderGoals() {
  const done = S.goals.filter((g) => g.done).length;
  $('goalCount').textContent = S.goals.length ? `${done}/${S.goals.length} 완료` : '';
  $('goalList').innerHTML = S.goals.length
    ? S.goals.map((g) =>
        `<li class="${g.done ? 'done' : ''}"><input type="checkbox" data-id="${g.id}" ${g.done ? 'checked' : ''}>` +
        `<span class="t">${esc(g.text)}</span><button class="x" data-del="${g.id}" aria-label="삭제">✕</button></li>`).join('')
    : '<li class="sub">아직 목표가 없어요. 아래에서 추가해보세요.</li>';
}
function addGoal() {
  const t = $('goalInput').value.trim();
  if (!t) return;
  S.goals.push({ id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text: t, done: false });
  $('goalInput').value = ''; save(); renderGoals();
}
$('bGoalAdd').onclick = addGoal;
$('goalInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addGoal(); } });
$('goalList').addEventListener('change', (e) => {
  const id = e.target.dataset && e.target.dataset.id; if (!id) return;
  const g = S.goals.find((x) => x.id === id); if (g) { g.done = e.target.checked; save(); renderGoals(); }
});
$('goalList').addEventListener('click', (e) => {
  const id = e.target.dataset && e.target.dataset.del; if (!id) return;
  S.goals = S.goals.filter((x) => x.id !== id); save(); renderGoals();
});
$('bGoalClear').onclick = () => {
  const n = S.goals.filter((g) => g.done).length;
  if (!n) { alert('완료 표시한 목표가 없어요.'); return; }
  if (confirm(`완료한 목표 ${n}개를 목록에서 지울까요?`)) { S.goals = S.goals.filter((g) => !g.done); save(); renderGoals(); }
};
const goalsText = () => S.goals.map((g) => `${g.done ? '[완료]' : '[미완료]'} ${g.text}`).join('\n').slice(0, 480);

$('code').oninput = (e) => { S.code = e.target.value.trim(); save(); };

function avgFocus(d) {
  const f = d.study.filter((x) => typeof x.focus === 'number');
  return f.length ? Math.round(f.reduce((s, x) => s + x.focus, 0) / f.length) : null;
}

function sessList(d) {
  const rows = [];
  d.exercise.forEach((s) => rows.push(`<div class="sess">🏃 ${fmtT(s.start)} ~ ${fmtT(s.end)} · ${fmtD(dur(s))}</div>`));
  d.study.forEach((s) => {
    const f = typeof s.focus === 'number' ? ` · 집중 ${s.focus}%` : '';
    rows.push(`<div class="sess">📚 ${fmtT(s.start)} ~ ${fmtT(s.end)} · ${fmtD(dur(s))}${f}` +
      (s.note ? `<br><span class="note">↳ ${esc(s.note)}</span>` : '') + '</div>');
  });
  return rows.join('');
}

function render() {
  const k = dayKey(), d = day(k);
  $('today').textContent = k.slice(5).replace('-', '/');
  renderGoals();
  $('code').value = S.code;
  $('bEx').textContent = S.active.exercise ? `⏹ 운동 끝 (${fmtT(S.active.exercise)}~)` : '🏃 운동 시작';
  $('bEx').className = S.active.exercise ? 'on' : 'alt';
  $('bStudy').textContent = S.active.study ? `⏹ 공부 끝 (${fmtT(S.active.study)}~)` : '📚 공부 시작';
  $('bStudy').className = S.active.study ? 'on' : 'alt';
  const f = avgFocus(d);
  $('summary').innerHTML =
    `<div class="stat"><span>기상</span><span>${fmtT(d.wake)}</span></div>` +
    `<div class="stat"><span>취침</span><span>${fmtT(d.sleep)}</span></div>` +
    `<div class="stat"><span>공부 합계</span><span>${fmtD(sumMs(d.study))} (${d.study.length}회)</span></div>` +
    `<div class="stat"><span>평균 집중도</span><span>${f === null ? '–' : f + '%'}</span></div>` +
    `<div class="stat"><span>운동 합계</span><span>${fmtD(sumMs(d.exercise))} (${d.exercise.length}회)</span></div>` +
    `<div class="stat"><span>걸음 수</span><span>${d.steps ?? '–'}</span></div>` +
    (d.exercise.length || d.study.length ? `<div class="sessbox">${sessList(d)}</div>` : '');
  const keys = Object.keys(S.days).sort().reverse().slice(0, 14);
  $('hist').innerHTML = keys.map((key) => {
    const x = S.days[key], af = avgFocus(x);
    return `<tr><td>${key.slice(5)}${x.sample ? '*' : ''}</td><td>${fmtT(x.wake)}</td><td>${fmtT(x.sleep)}</td>` +
      `<td>${fmtD(sumMs(x.study))}</td><td>${af === null ? '–' : af + '%'}</td><td>${fmtD(sumMs(x.exercise))}</td><td>${x.steps ?? '–'}</td></tr>`;
  }).join('');
  const nSample = Object.values(S.days).filter((x) => x.sample).length;
  $('sampleInfo').textContent = nSample ? `테스트 샘플 ${nSample}일이 들어 있어요 (기록표에서 * 표시)` : '';
}

// AI 분석
function compact() {
  return Object.keys(S.days).sort().slice(-14).map((key) => {
    const x = S.days[key];
    return {
      date: key, wake: x.wake ? fmtT(x.wake) : null, sleep: x.sleep ? fmtT(x.sleep) : null,
      steps: x.steps, exerciseMin: Math.round(sumMs(x.exercise) / 60000),
      study: x.study.map((s) => ({ min: mins(s), focus: s.focus ?? null, weakness: s.note || '' })),
    };
  });
}
$('bAI').onclick = async () => {
  const days = compact();
  if (!days.length) { $('result').textContent = '먼저 기록을 조금 쌓아주세요.'; return; }
  $('bAI').disabled = true; $('result').textContent = '분석 중...';
  try {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-access-code': (S.code || '').trim() },
      body: JSON.stringify({ goal: goalsText(), days }),
    });
    const j = await r.json();
    $('result').style.color = 'var(--tx)';
    $('result').textContent = r.ok ? j.text
      : r.status === 401 ? '접속 코드가 맞지 않아요. 맨 아래 "설정·백업"의 접속 코드 칸에, Vercel에 넣은 ACCESS_CODE와 똑같이(띄어쓰기·대소문자까지) 입력해주세요.'
      : (j.error || '오류가 났어요.');
  } catch (e) {
    $('result').textContent = '서버에 연결하지 못했어요. 배포된 주소에서 사용해주세요.';
  }
  $('bAI').disabled = false;
};

// 테스트용 샘플 14일 (진짜 기록은 건드리지 않고, 비어 있는 과거 날짜에만 채움)
function makeSamples() {
  const r = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const notes = ['폰을 자꾸 봄', '졸림', '시작이 늦음', '집중이 오래 안 감', '', ''];
  const now = new Date();
  const todayKey = dayKey();
  let added = 0;
  for (let i = 14; i >= 1; i--) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dayKey(base.getTime() + 12 * 3600e3);
    if (S.days[k] || k === todayKey) continue;
    const at = (h, m) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m).getTime();
    const d = { wake: at(r(6, 8), r(0, 59)), sleep: at(r(23, 25), r(0, 59)), steps: r(3000, 12000), exercise: [], study: [], sample: true };
    [[9, 10], [14, 15], [19, 20]].slice(0, r(2, 3)).forEach(([h1, h2]) => {
      const start = at(r(h1, h2), r(0, 59));
      d.study.push({ start, end: start + r(60, 150) * 60000, focus: r(8, 19) * 5, note: notes[r(0, notes.length - 1)] });
    });
    if (Math.random() < 0.6) {
      const start = at(17, r(0, 59));
      d.exercise.push({ start, end: start + r(30, 60) * 60000 });
    }
    S.days[k] = d; added++;
  }
  return added;
}
$('bSample').onclick = () => {
  if (!confirm('테스트용 가짜 기록을 지난 14일에 넣을까요? (이미 기록이 있는 날은 건드리지 않아요. 나중에 "샘플 지우기"로 지울 수 있어요)')) return;
  const n = makeSamples(); save(); render();
  alert(n ? `${n}일치 샘플을 넣었어요.` : '넣을 수 있는 빈 날짜가 없어요.');
};
$('bUnsample').onclick = () => {
  const keys = Object.keys(S.days).filter((k) => S.days[k].sample);
  if (!keys.length) { alert('지울 샘플이 없어요.'); return; }
  if (!confirm(`샘플 ${keys.length}일을 지울까요? (내가 직접 남긴 기록은 그대로 남아요)`)) return;
  keys.forEach((k) => delete S.days[k]); save(); render();
};

// 백업
$('bExport').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
  a.download = `lifestyle-${dayKey()}.json`; a.click();
};
$('bImport').onclick = () => $('file').click();
$('file').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { S = normalize(JSON.parse(await f.text())); save(); render(); }
  catch { alert('파일을 읽지 못했어요.'); }
};

render();
