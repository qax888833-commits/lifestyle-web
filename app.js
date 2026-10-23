const KEY = 'lifestyle-v1';
const $ = (id) => document.getElementById(id);
const p2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const PERIODS = [['week', '이번 주'], ['month', '이번 달'], ['half', '6개월'], ['year', '올해']];
const newDay = () => ({ wake: null, sleep: null, steps: null, exercise: [], study: [], checks: {} });

// 새벽 4시 전에 누르는 기록은 전날로 취급
function dayKey(t = Date.now()) {
  const d = new Date(t - 4 * 3600e3);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

// 저장 데이터 정리 (예전 버전의 목표는 데일리 체크 목표로 옮김)
function normalize(o) {
  o = o || {};
  const x = Object.assign({ code: '', days: {}, active: {}, dailyGoals: [], long: {} }, o);
  if (!Array.isArray(x.dailyGoals)) x.dailyGoals = [];
  if (!x.long || typeof x.long !== 'object') x.long = {};
  PERIODS.forEach(([p]) => { if (!Array.isArray(x.long[p])) x.long[p] = []; });
  const old = Array.isArray(o.goals) ? o.goals.slice() : [];
  if (o.goal && !old.length) old.push({ text: String(o.goal), done: false });
  if (old.length && !x.dailyGoals.length) {
    const dk = dayKey();
    old.forEach((g) => {
      const id = g.id || uid();
      x.dailyGoals.push({ id, text: g.text, targetMin: null });
      if (g.done) { x.days[dk] = x.days[dk] || newDay(); x.days[dk].checks = x.days[dk].checks || {}; x.days[dk].checks[id] = true; }
    });
  }
  delete x.goal; delete x.goals;
  return x;
}
function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch { return normalize({}); }
}
let S = load();
let pending = null; // 끝난 공부 세션 (자가진단 대기)
let startKind = null; // 시작 창이 열려 있는 종류
let longTab = 'week';
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

function day(k) {
  let d = S.days[k];
  if (!d) d = S.days[k] = newDay();
  if (!d.checks) d.checks = {};
  return d;
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
const act = (k) => { const a = S.active[k]; return a ? (typeof a === 'number' ? { start: a } : a) : null; };
const goalById = (id) => S.dailyGoals.find((g) => g.id === id);
const timeGoals = () => S.dailyGoals.filter((g) => g.targetMin > 0);

// 한 데일리 목표에 쌓인 시간 (진행 중인 세션도 포함)
function goalMs(g, k, d) {
  let ms = 0;
  d.study.concat(d.exercise).forEach((s) => { if (s.goalId === g.id) ms += dur(s); });
  if (k === dayKey()) {
    ['study', 'exercise'].forEach((kind) => {
      const a = act(kind);
      if (a && a.goalId === g.id && dayKey(a.start) === k) ms += Date.now() - a.start;
    });
  }
  return ms;
}
const goalPct = (g, ms) => Math.min(100, Math.round(ms / 60000 / g.targetMin * 100));

// ---------- 시작 / 끝 ----------
function openStart(kind) {
  startKind = kind;
  $('dsTitle').textContent = kind === 'study' ? '📚 무엇을 공부할까요?' : '🏃 어떤 운동을 할까요?';
  $('dsTopic').value = '';
  $('dsTopic').placeholder = kind === 'study' ? '예: 국어 비문학, 수학 확통' : '예: 러닝, 스쿼트, 걷기';
  const used = [];
  Object.values(S.days).forEach((d) => d[kind].forEach((s) => { if (s.topic && !used.includes(s.topic)) used.push(s.topic); }));
  $('topicList').innerHTML = used.slice(-12).map((t) => `<option value="${esc(t)}">`).join('');
  const tg = timeGoals();
  $('dsGoal').innerHTML = '<option value="">연결 안 함</option>' +
    tg.map((g) => `<option value="${g.id}">${esc(g.text)} (${g.targetMin}분)</option>`).join('');
  $('dsHint').textContent = tg.length ? '' : '오늘의 목표에 시간(분)을 넣어 추가하면, 여기서 연결할 수 있어요.';
  $('dlgStart').showModal();
}
$('dsCancel').onclick = () => $('dlgStart').close();
$('dsGo').onclick = () => {
  const topic = $('dsTopic').value.trim();
  const goalId = $('dsGoal').value || null;
  S.active[startKind] = { start: Date.now(), topic, goalId };
  $('dlgStart').close(); save(); render();
};

function endSession(kind) {
  const a = act(kind);
  const sess = { start: a.start, end: Date.now() };
  if (a.topic) sess.topic = a.topic;
  if (a.goalId) sess.goalId = a.goalId;
  delete S.active[kind];
  const key = dayKey(sess.start);
  if (kind === 'study') {
    pending = { sess, key };
    $('dlgInfo').textContent = `${sess.topic ? sess.topic + ' · ' : ''}공부 시간: ${fmtD(dur(sess))}`;
    $('focus').value = 70; $('fv').textContent = 70; $('note').value = '';
    $('dlg').showModal();
  } else {
    day(key).exercise.push(sess);
  }
  save(); render();
}

$('bWake').onclick = () => { day(dayKey()).wake = Date.now(); save(); render(); };
$('bSleep').onclick = () => { day(dayKey()).sleep = Date.now(); save(); render(); };
$('bEx').onclick = () => (act('exercise') ? endSession('exercise') : openStart('exercise'));
$('bStudy').onclick = () => (act('study') ? endSession('study') : openStart('study'));
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

// ---------- 데일리 목표 ----------
function renderDaily(d, k) {
  let achieved = 0;
  const items = S.dailyGoals.map((g) => {
    if (g.targetMin > 0) {
      const ms = goalMs(g, k, d), pct = goalPct(g, ms), full = pct >= 100;
      if (full) achieved++;
      return `<li class="dg"><div class="dg-top"><span class="t">${esc(g.text)}</span>` +
        `<span class="dg-val${full ? ' ok' : ''}">${full ? '✓ ' : ''}${ms > 0 ? fmtD(ms) : '0분'} / ${g.targetMin}분</span>` +
        `<button class="x" data-del="${g.id}" aria-label="삭제">✕</button></div>` +
        `<div class="bar${full ? ' full' : ''}"><i style="width:${pct}%"></i></div></li>`;
    }
    const on = !!d.checks[g.id];
    if (on) achieved++;
    return `<li class="dg ${on ? 'done' : ''}"><div class="dg-top"><label class="chk"><input type="checkbox" data-chk="${g.id}" ${on ? 'checked' : ''}>` +
      `<span class="t">${esc(g.text)}</span></label><button class="x" data-del="${g.id}" aria-label="삭제">✕</button></div></li>`;
  });
  $('dailyCount').textContent = S.dailyGoals.length ? `${achieved}/${S.dailyGoals.length} 달성` : '';
  $('dailyList').innerHTML = items.length ? items.join('') : '<li class="sub">아직 데일리 목표가 없어요. 아래에서 추가해보세요.</li>';
}
function addDaily() {
  const text = $('dgText').value.trim();
  if (!text) return;
  const n = parseInt($('dgMin').value, 10);
  S.dailyGoals.push({ id: uid(), text, targetMin: n > 0 ? n : null });
  $('dgText').value = ''; $('dgMin').value = ''; save(); render();
}
$('bDgAdd').onclick = addDaily;
$('dgText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addDaily(); } });
$('dailyList').addEventListener('change', (e) => {
  const id = e.target.dataset && e.target.dataset.chk; if (!id) return;
  const d = day(dayKey());
  if (e.target.checked) d.checks[id] = true; else delete d.checks[id];
  save(); render();
});
$('dailyList').addEventListener('click', (e) => {
  const id = e.target.dataset && e.target.dataset.del; if (!id) return;
  if (!confirm('이 데일리 목표를 지울까요? (지난 기록은 그대로 남아요)')) return;
  S.dailyGoals = S.dailyGoals.filter((g) => g.id !== id); save(); render();
});

// ---------- 장기 목표 ----------
function renderLong() {
  $('longTabs').innerHTML = PERIODS.map(([p, label]) => {
    const list = S.long[p], done = list.filter((g) => g.done).length;
    return `<button class="chip${p === longTab ? ' act' : ''}" data-p="${p}">${label}${list.length ? ` ${done}/${list.length}` : ''}</button>`;
  }).join('');
  const list = S.long[longTab];
  $('longList').innerHTML = list.length
    ? list.map((g) =>
        `<li class="${g.done ? 'done' : ''}"><input type="checkbox" data-id="${g.id}" ${g.done ? 'checked' : ''}>` +
        `<span class="t">${esc(g.text)}</span><button class="x" data-del="${g.id}" aria-label="삭제">✕</button></li>`).join('')
    : '<li class="sub">아직 목표가 없어요.</li>';
  $('longInput').placeholder = `${PERIODS.find((x) => x[0] === longTab)[1]} 목표 추가`;
}
function addLong() {
  const t = $('longInput').value.trim();
  if (!t) return;
  S.long[longTab].push({ id: uid(), text: t, done: false });
  $('longInput').value = ''; save(); renderLong();
}
$('bLongAdd').onclick = addLong;
$('longInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLong(); } });
$('longTabs').addEventListener('click', (e) => {
  const p = e.target.dataset && e.target.dataset.p; if (!p) return;
  longTab = p; renderLong();
});
$('longList').addEventListener('change', (e) => {
  const id = e.target.dataset && e.target.dataset.id; if (!id) return;
  const g = S.long[longTab].find((x) => x.id === id); if (g) { g.done = e.target.checked; save(); renderLong(); }
});
$('longList').addEventListener('click', (e) => {
  const id = e.target.dataset && e.target.dataset.del; if (!id) return;
  S.long[longTab] = S.long[longTab].filter((x) => x.id !== id); save(); renderLong();
});
$('bLongClear').onclick = () => {
  const n = S.long[longTab].filter((g) => g.done).length;
  if (!n) { alert('완료 표시한 목표가 없어요.'); return; }
  if (confirm(`완료한 목표 ${n}개를 지울까요?`)) { S.long[longTab] = S.long[longTab].filter((g) => !g.done); save(); renderLong(); }
};

$('code').oninput = (e) => { S.code = e.target.value.trim(); save(); };

function avgFocus(d) {
  const f = d.study.filter((x) => typeof x.focus === 'number');
  return f.length ? Math.round(f.reduce((s, x) => s + x.focus, 0) / f.length) : null;
}

function sessList(d) {
  const rows = [];
  d.exercise.forEach((s) => rows.push(`<div class="sess">🏃 ${fmtT(s.start)} ~ ${fmtT(s.end)} · ${fmtD(dur(s))}` +
    (s.topic ? ` · ${esc(s.topic)}` : '') + '</div>'));
  d.study.forEach((s) => {
    const f = typeof s.focus === 'number' ? ` · 집중 ${s.focus}%` : '';
    rows.push(`<div class="sess">📚 ${fmtT(s.start)} ~ ${fmtT(s.end)} · ${fmtD(dur(s))}` +
      (s.topic ? ` · ${esc(s.topic)}` : '') + f +
      (s.note ? `<br><span class="note">↳ ${esc(s.note)}</span>` : '') + '</div>');
  });
  return rows.join('');
}

function render() {
  const k = dayKey(), d = day(k);
  $('today').textContent = k.slice(5).replace('-', '/');
  renderDaily(d, k);
  renderLong();
  $('code').value = S.code;
  const ae = act('exercise'), as = act('study');
  $('bEx').textContent = ae ? `⏹ 운동 끝 (${fmtT(ae.start)}~${ae.topic ? ' ' + ae.topic : ''})` : '🏃 운동 시작';
  $('bEx').className = ae ? 'on' : 'alt';
  $('bStudy').textContent = as ? `⏹ 공부 끝 (${fmtT(as.start)}~${as.topic ? ' ' + as.topic : ''})` : '📚 공부 시작';
  $('bStudy').className = as ? 'on' : 'alt';
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
// 진행 중인 공부/운동이 있으면 게이지가 저절로 차오르도록 30초마다 갱신
setInterval(() => { if (act('study') || act('exercise')) render(); }, 30000);

// ---------- AI 분석 ----------
function dayGoals(x, key) {
  return S.dailyGoals.map((g) => {
    if (g.targetMin > 0) return { goal: g.text, targetMin: g.targetMin, doneMin: Math.round(goalMs(g, key, x) / 60000) };
    return { goal: g.text, checked: !!(x.checks && x.checks[g.id]) };
  });
}
function compact() {
  return Object.keys(S.days).sort().slice(-14).map((key) => {
    const x = S.days[key];
    const gl = (s) => { const g = s.goalId && goalById(s.goalId); return g ? g.text : undefined; };
    return {
      date: key, wake: x.wake ? fmtT(x.wake) : null, sleep: x.sleep ? fmtT(x.sleep) : null,
      steps: x.steps, exerciseMin: Math.round(sumMs(x.exercise) / 60000),
      exercise: x.exercise.map((s) => ({ min: mins(s), type: s.topic || '' })),
      study: x.study.map((s) => ({ min: mins(s), subject: s.topic || '', goal: gl(s), focus: s.focus ?? null, weakness: s.note || '' })),
      dailyGoals: dayGoals(x, key),
    };
  });
}
function goalsText() {
  const lines = [];
  if (S.dailyGoals.length) {
    lines.push('[데일리 목표]');
    S.dailyGoals.forEach((g) => lines.push(g.targetMin > 0 ? `- ${g.text} (하루 ${g.targetMin}분)` : `- ${g.text} (체크형)`));
  }
  PERIODS.forEach(([p, label]) => {
    if (S.long[p].length) lines.push(`[${label} 목표] ` + S.long[p].map((g) => `${g.text}${g.done ? '(완료)' : ''}`).join(', '));
  });
  return lines.join('\n').slice(0, 1400);
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

// ---------- 테스트용 샘플 14일 ----------
function makeSamples() {
  const r = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const pick = (arr) => arr[r(0, arr.length - 1)];
  const notes = ['폰을 자꾸 봄', '졸림', '시작이 늦음', '집중이 오래 안 감', '', ''];
  const subjects = ['국어 비문학', '수학 확통', '영어 단어', '수학 미적분'];
  const sports = ['러닝', '스쿼트', '걷기'];
  const tg = timeGoals();
  const now = new Date();
  const todayKey = dayKey();
  let added = 0;
  for (let i = 14; i >= 1; i--) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dayKey(base.getTime() + 12 * 3600e3);
    if (S.days[k] || k === todayKey) continue;
    const at = (h, m) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m).getTime();
    const d = newDay();
    Object.assign(d, { wake: at(r(6, 8), r(0, 59)), sleep: at(r(23, 25), r(0, 59)), steps: r(3000, 12000), sample: true });
    [[9, 10], [14, 15], [19, 20]].slice(0, r(2, 3)).forEach(([h1, h2]) => {
      const start = at(r(h1, h2), r(0, 59));
      const s = { start, end: start + r(60, 150) * 60000, focus: r(8, 19) * 5, note: pick(notes), topic: pick(subjects) };
      if (tg.length && Math.random() < 0.7) s.goalId = pick(tg).id;
      d.study.push(s);
    });
    if (Math.random() < 0.6) {
      const start = at(17, r(0, 59));
      d.exercise.push({ start, end: start + r(30, 60) * 60000, topic: pick(sports) });
    }
    S.dailyGoals.filter((g) => !(g.targetMin > 0)).forEach((g) => { if (Math.random() < 0.6) d.checks[g.id] = true; });
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

// ---------- 백업 ----------
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
