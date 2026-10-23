// Vercel 서버리스 함수: 무료 AI 4곳을 순서대로 시도합니다. 하나가 실패하면 다음으로 넘어가요.
// 환경변수(있는 것만 사용, 최소 1개): GEMINI_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY
// 선택: ACCESS_CODE (설정 시 코드가 맞아야 사용 가능)
// 모델 이름이 바뀌면 코드 수정 없이 GEMINI_MODEL, GROQ_MODEL, CEREBRAS_MODEL, OPENROUTER_MODEL 환경변수로 바꿀 수 있어요.

const SYSTEM = `너는 한국 고3 수험생의 생활습관 코치야. 사용자의 목표(데일리 목표, 이번 주/이번 달/6개월/올해 목표)와 최근 기록(기상/취침 시각, 걸음 수, 운동 종류와 분, 공부 세션별 과목·시간·집중도·스스로 적은 부족한 점, 날짜별 데일리 목표 달성도)을 보고 분석해.
규칙:
- 기록에 없는 사실을 지어내지 말고, 데이터가 부족하면 부족하다고 말해.
- 목표 달성을 가로막는 패턴을 구체적 숫자와 함께 짚어. 데일리 목표는 목표 시간 대비 실제 시간(doneMin/targetMin)으로, 장기 목표는 최근 생활 패턴과 연결해서 이야기해.
- 공부 과목이 한쪽으로 치우쳤는지, 집중도가 낮은 시간대·과목이 있는지도 봐.
- 형식: 1) 한 줄 총평 2) 잘한 점 2개 이내 3) 고쳐야 할 점 3개 이내(근거 숫자 포함) 4) 내일 바로 할 행동 3개.
- 말투는 친근한 반말, 전체 800자 이내.`;

const TIMEOUT_MS = 15000;

async function post(url, headers, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
    return j;
  } finally {
    clearTimeout(timer);
  }
}

// OpenAI 호환 방식(Groq, Cerebras, OpenRouter)
function openaiStyle(name, url, keyEnv, modelEnv, defaultModel) {
  return {
    name,
    key: process.env[keyEnv],
    async run(user) {
      const j = await post(url, { authorization: `Bearer ${process.env[keyEnv]}` }, {
        model: process.env[modelEnv] || defaultModel,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      });
      return j?.choices?.[0]?.message?.content;
    },
  };
}

function providers() {
  return [
    {
      name: 'Gemini',
      key: process.env.GEMINI_API_KEY,
      async run(user) {
        const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
        const j = await post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          { 'x-goog-api-key': process.env.GEMINI_API_KEY },
          {
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens: 2000 },
          },
        );
        return (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n');
      },
    },
    openaiStyle('Groq', 'https://api.groq.com/openai/v1/chat/completions', 'GROQ_API_KEY', 'GROQ_MODEL', 'openai/gpt-oss-120b'),
    openaiStyle('Cerebras', 'https://api.cerebras.ai/v1/chat/completions', 'CEREBRAS_API_KEY', 'CEREBRAS_MODEL', 'gpt-oss-120b'),
    openaiStyle('OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'google/gemma-4-31b-it:free'),
  ];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요.' });
  const need = process.env.ACCESS_CODE;
  if (need && req.headers['x-access-code'] !== need) {
    return res.status(401).json({ error: '접속 코드가 맞지 않아요. 설정에서 코드를 입력해주세요.' });
  }
  const list = providers().filter((p) => p.key);
  if (!list.length) {
    return res.status(500).json({ error: 'AI 키가 하나도 설정되지 않았어요. (GEMINI_API_KEY 등)' });
  }
  const { goal = '', days = [] } = req.body || {};
  if (!Array.isArray(days) || days.length === 0 || days.length > 31) {
    return res.status(400).json({ error: '기록이 올바르지 않아요.' });
  }
  const user = `목표: ${String(goal).slice(0, 1500) || '(미입력)'}\n\n최근 기록(JSON):\n${JSON.stringify(days).slice(0, 20000)}`;

  const errors = [];
  for (const p of list) {
    try {
      const text = String((await p.run(user)) || '').trim();
      if (!text) throw new Error('빈 답변');
      return res.status(200).json({ text, provider: p.name });
    } catch (e) {
      errors.push(`${p.name}: ${e.name === 'AbortError' ? '시간 초과' : e.message}`);
    }
  }
  return res.status(502).json({ error: `모든 AI가 실패했어요. 잠시 후 다시 시도해주세요.\n${errors.join('\n')}` });
}
