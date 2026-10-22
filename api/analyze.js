// Vercel 서버리스 함수: API 키를 브라우저에 노출하지 않고 AI 분석을 호출합니다.
// 환경변수: ANTHROPIC_API_KEY (필수), ACCESS_CODE (선택, 설정 시 코드 일치해야 사용 가능), ANTHROPIC_MODEL (선택)

const SYSTEM = `너는 한국 고3 수험생의 생활습관 코치야. 사용자의 목표와 최근 기록(기상/취침 시각, 걸음 수, 운동 분, 공부 세션별 시간·집중도·스스로 적은 부족한 점)을 보고 분석해.
규칙:
- 기록에 없는 사실을 지어내지 말고, 데이터가 부족하면 부족하다고 말해.
- 목표 달성을 가로막는 패턴을 구체적 숫자와 함께 짚어.
- 형식: 1) 한 줄 총평 2) 잘한 점 2개 이내 3) 고쳐야 할 점 3개 이내(근거 숫자 포함) 4) 내일 바로 할 행동 3개.
- 말투는 친근한 반말, 전체 600자 이내.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요.' });
  const need = process.env.ACCESS_CODE;
  if (need && req.headers['x-access-code'] !== need) {
    return res.status(401).json({ error: '접속 코드가 맞지 않아요. 설정에서 코드를 입력해주세요.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY가 설정되지 않았어요.' });
  }
  const { goal = '', days = [] } = req.body || {};
  if (!Array.isArray(days) || days.length === 0 || days.length > 31) {
    return res.status(400).json({ error: '기록이 올바르지 않아요.' });
  }
  const user = `목표: ${String(goal).slice(0, 500) || '(미입력)'}\n\n최근 기록(JSON):\n${JSON.stringify(days).slice(0, 12000)}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 1200,
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j?.error?.message || 'AI 호출에 실패했어요.' });
    const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: 'AI 서버에 연결하지 못했어요.' });
  }
}
