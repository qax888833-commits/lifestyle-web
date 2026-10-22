const KEY = 'lifestyle-v1';
const $ = (id) => document.getElementById(id);
const p2 = (n) => String(n).padStart(2, '0');

function load() {
  const base = { goal: '', code: '', days: {}, active: {} };
  try { return Object.assign(base, JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch { return base; }
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
const mins = (a) => Math.round((a.end - a.start) / 60000);
const fmtM = (m) => (m ? (m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`) : '–');
const sum = (arr) => arr.reduce((s, a) => s + mins(a), 0);

function toggle(kind) {
  if (S.active[kind]) {
    const sess = { start: S.active[kind], end: Date.now() };
    delete S.active[kind];
    const d = day(dayKey(sess.start));
    if (kind === 'study') {
      pending = { sess, key: dayKey(sess.start) };
      $('dlgInfo').textContent = `공부 시간: ${fmtM(mins(sess))}`;
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

$('goal').oninput = (e) => { S.goal = e.target.value; save(); };
$('code').oninput = (e) => { S.code = e.target.value; save(); };

function avgFocus(d) {
  const f = d.study.filter((x) => typeof x.focus === 'number');
  return f.length ? Math.round(f.reduce((s, x) => s + x.focus, 0) / f.length) : null;
}

function render() {
  const k = dayKey(), d = day(k);
  $('today').textContent = k.slice(5).replace('-', '/');
  if (document.activeElement !== $('goal')) $('goal').value = S.goal;
  $('code').value = S.code;
  $('bEx').textContent = S.active.exercise ? `⏹ 운동 끝 (${fmtT(S.active.exercise)}~)` : '🏃 운동 시작';
  $('bEx').className = S.active.exercise ? 'on' : 'alt';
  $('bStudy').textContent = S.active.study ? `⏹ 공부 끝 (${fmtT(S.active.study)}~)` : '📚 공부 시작';
  $('bStudy').className = S.active.study ? 'on' : 'alt';
  const f = avgFocus(d);
  $('summary').innerHTML =
    `<div class="stat"><span>기상</span><span>${fmtT(d.wake)}</span></div>` +
    `<div class="stat"><span>취침</span><span>${fmtT(d.sleep)}</span></div>` +
    `<div class="stat"><span>공부</span><span>${fmtM(sum(d.study))} (${d.study.length}회)</span></div>` +
    `<div class="stat"><span>평균 집중도</span><span>${f === null ? '–' : f + '%'}</span></div>` +
    `<div class="stat"><span>운동</span><span>${fmtM(sum(d.exercise))}</span></div>` +
    `<div class="stat"><span>걸음 수</span><span>${d.steps ?? '–'}</span></div>`;
  const keys = Object.keys(S.days).sort().reverse().slice(0, 14);
  $('hist').innerHTML = keys.map((key) => {
    const x = S.days[key], af = avgFocus(x);
    return `<tr><td>${key.slice(5)}</td><td>${fmtT(x.wake)}</td><td>${fmtT(x.sleep)}</td>` +
      `<td>${fmtM(sum(x.study))}</td><td>${af === null ? '–' : af + '%'}</td><td>${fmtM(sum(x.exercise))}</td><td>${x.steps ?? '–'}</td></tr>`;
  }).join('');
}

// AI 분석
function compact() {
  return Object.keys(S.days).sort().slice(-14).map((key) => {
    const x = S.days[key];
    return {
      date: key, wake: x.wake ? fmtT(x.wake) : null, sleep: x.sleep ? fmtT(x.sleep) : null,
      steps: x.steps, exerciseMin: sum(x.exercise),
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
      headers: { 'content-type': 'application/json', 'x-access-code': S.code || '' },
      body: JSON.stringify({ goal: S.goal, days }),
    });
    const j = await r.json();
    $('result').style.color = 'var(--tx)';
    $('result').textContent = r.ok ? j.text : (j.error || '오류가 났어요.');
  } catch (e) {
    $('result').textContent = '서버에 연결하지 못했어요. 배포 후 사용할 수 있어요.';
  }
  $('bAI').disabled = false;
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
  try { S = Object.assign({ goal: '', code: '', days: {}, active: {} }, JSON.parse(await f.text())); save(); render(); }
  catch { alert('파일을 읽지 못했어요.'); }
};

render();
