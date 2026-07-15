const KEY_PREFIX = '__vocab_progress__:';
const DEFAULT_ADMIN_EMAIL = 'sunprice@sp.ik';

export async function onRequestPost(context) {
  try {
    const binding = getBinding(context.env);
    if (!binding) return json({ ok:false, error:'Thiếu KV binding STUDENT_RESULTS.' }, 500);

    const auth = getStudentAuth(context.request);
    if (!auth.ok) return json({ ok:false, error:auth.error }, 401);

    const body = await context.request.json().catch(() => ({}));
    const email = normalizeEmail(body.email || auth.email);
    if (!email || email !== auth.email) return json({ ok:false, error:'Email đồng bộ không khớp phiên đăng nhập.' }, 403);

    const snapshot = sanitizeSnapshot(body.snapshot, email);
    const key = progressKey(email);
    await binding.put(key, JSON.stringify(snapshot), {
      metadata: {
        type: 'vocabulary-progress',
        email,
        updatedAt: snapshot.updatedAt,
        rankName: String(snapshot.summary.rankName || 'Egg'),
        rankIndex: Number(snapshot.summary.rankIndex || 0),
        masteredWords: Number(snapshot.summary.masteredWords || 0),
        totalWords: Number(snapshot.summary.totalWords || 0),
        enabledWords: Number(snapshot.summary.enabledWords || 0),
        totalSessions: Number(snapshot.summary.totalSessions || 0),
        totalCorrect: Number(snapshot.summary.totalCorrect || 0),
        totalWrong: Number(snapshot.summary.totalWrong || 0),
        lastPracticeAt: String(snapshot.summary.lastPracticeAt || '')
      }
    });
    return json({ ok:true, email, updatedAt:snapshot.updatedAt });
  } catch (err) {
    return json({ ok:false, error:err?.message || 'Không lưu được tiến độ từ vựng.' }, 500);
  }
}

export async function onRequestGet(context) {
  try {
    const binding = getBinding(context.env);
    if (!binding) return json({ ok:false, error:'Thiếu KV binding STUDENT_RESULTS.' }, 500);

    const url = new URL(context.request.url);
    const auth = getStudentAuth(context.request);
    if (!auth.ok) return json({ ok:false, error:auth.error }, 401);

    const wantsAll = url.searchParams.get('all') === '1';
    const requestedEmail = normalizeEmail(url.searchParams.get('email') || '');
    const isAdmin = isAdminAccount(context.env, auth.email);

    if (wantsAll) {
      if (!isAdmin) return json({ ok:false, error:'Tài khoản không có quyền xem tiến độ học viên.' }, 403);
      const listed = await listAll(binding, KEY_PREFIX);
      const students = listed.keys.map(key => summaryFromKey(key)).filter(Boolean)
        .sort((a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      return json({ ok:true, students });
    }

    if (requestedEmail) {
      if (!isAdmin && requestedEmail !== auth.email) return json({ ok:false, error:'Không có quyền xem tài khoản này.' }, 403);
      const snapshot = await readSnapshot(binding, requestedEmail);
      if (!snapshot) return json({ ok:false, empty:true, error:'Chưa có dữ liệu tiến độ.' }, 404);
      return json({ ok:true, snapshot });
    }

    const snapshot = await readSnapshot(binding, auth.email);
    if (!snapshot) return json({ ok:true, empty:true, snapshot:null });
    return json({ ok:true, snapshot });
  } catch (err) {
    return json({ ok:false, error:err?.message || 'Không tải được tiến độ từ vựng.' }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const binding = getBinding(context.env);
    if (!binding) return json({ ok:false, error:'Thiếu KV binding STUDENT_RESULTS.' }, 500);

    const auth = getStudentAuth(context.request);
    if (!auth.ok) return json({ ok:false, error:auth.error }, 401);

    const url = new URL(context.request.url);
    const requestedEmail = normalizeEmail(url.searchParams.get('email') || auth.email);
    const isAdmin = isAdminAccount(context.env, auth.email);
    if (requestedEmail !== auth.email && !isAdmin) return json({ ok:false, error:'Không có quyền xóa tài khoản này.' }, 403);

    const key = progressKey(requestedEmail);
    const existing = await binding.get(key);
    if (!existing) return json({ ok:true, empty:true });
    await binding.delete(key);
    return json({ ok:true, deletedEmail:requestedEmail });
  } catch (err) {
    return json({ ok:false, error:err?.message || 'Không xóa được tiến độ từ vựng.' }, 500);
  }
}

function getBinding(env) {
  return env.STUDENT_RESULTS || env.VOCABULARY_PROGRESS || null;
}

function getStudentAuth(request) {
  const email = normalizeEmail(request.headers.get('x-student-email') || '');
  const token = request.headers.get('x-student-token') || '';
  if (!email || !isStudentTokenForEmail(token, email)) {
    return { ok:false, email, error:'Phiên đăng nhập học viên không hợp lệ.' };
  }
  return { ok:true, email };
}

function isAdminAccount(env, email) {
  const expected = normalizeEmail(env.VOCAB_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL);
  return normalizeEmail(email) === expected;
}

function isStudentTokenForEmail(token, email) {
  try {
    const decoded = atob(String(token || ''));
    const parts = decoded.split('|');
    return parts[0] === 'student' && normalizeEmail(parts[1]) === normalizeEmail(email);
  } catch (err) {
    return false;
  }
}

function sanitizeSnapshot(raw, email) {
  const snapshot = raw && typeof raw === 'object' ? raw : {};
  const history = snapshot.history && typeof snapshot.history === 'object' ? snapshot.history : {};
  const sessions = Array.isArray(history.sessions) ? history.sessions.slice(0, 500) : [];
  const words = Array.isArray(snapshot.words) ? snapshot.words.slice(0, 5000) : [];
  const summary = snapshot.summary && typeof snapshot.summary === 'object' ? snapshot.summary : {};
  const updatedAt = new Date().toISOString();

  return {
    version: 2,
    email,
    updatedAt,
    summary: {
      rankName: cleanString(summary.rankName || 'Egg', 80),
      rankIndex: safeNumber(summary.rankIndex),
      masteredWords: safeNumber(summary.masteredWords),
      totalWords: safeNumber(summary.totalWords),
      enabledWords: safeNumber(summary.enabledWords),
      totalProgress: safeNumber(summary.totalProgress),
      totalSessions: safeNumber(summary.totalSessions),
      totalCorrect: safeNumber(summary.totalCorrect),
      totalWrong: safeNumber(summary.totalWrong),
      lastPracticeAt: cleanString(summary.lastPracticeAt || '', 80)
    },
    history: {
      sessions: sessions.map(sanitizeSession),
      words: sanitizeWordStats(history.words)
    },
    words: words.map(sanitizeWord)
  };
}

function sanitizeSession(item) {
  const s = item && typeof item === 'object' ? item : {};
  return {
    id: cleanString(s.id || '', 120),
    at: cleanString(s.at || '', 80),
    mode: cleanString(s.mode || '', 40),
    modeTitle: cleanString(s.modeTitle || '', 100),
    score: safeNumber(s.score),
    total: safeNumber(s.total),
    percent: safeNumber(s.percent),
    completed: s.completed !== false,
    wrongs: Array.isArray(s.wrongs) ? s.wrongs.slice(0, 20).map(w => ({
      game: cleanString(w?.game || '', 50),
      meaning: cleanString(w?.meaning || '', 500),
      correct: cleanString(w?.correct || '', 200),
      answer: cleanString(w?.answer || '', 200)
    })) : [],
    answers: Array.isArray(s.answers) ? s.answers.slice(0, 20).map(a => ({
      word: cleanString(a?.word || '', 200),
      meaning: cleanString(a?.meaning || '', 500),
      correct: !!a?.correct,
      answer: cleanString(a?.answer || '', 200),
      game: cleanString(a?.game || '', 50),
      parts: cleanStringArray(a?.parts, 20, 60),
      meanings: cleanStringArray(a?.meanings, 30, 500)
    })) : []
  };
}

function sanitizeWord(item) {
  const w = item && typeof item === 'object' ? item : {};
  return {
    id: cleanString(w.id || '', 160),
    word: cleanString(w.word || '', 200),
    parts: cleanStringArray(w.parts, 20, 60),
    meanings: cleanStringArray(w.meanings, 30, 500),
    useInGame: w.useInGame !== false,
    progress: Math.max(0, Math.min(10, safeNumber(w.progress))),
    correct: safeNumber(w.correct),
    wrong: safeNumber(w.wrong),
    total: safeNumber(w.total),
    latest: cleanString(w.latest || '', 80)
  };
}

function sanitizeWordStats(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).slice(0, 5000).forEach(key => {
    const item = raw[key] && typeof raw[key] === 'object' ? raw[key] : {};
    const safeKey = cleanString(key, 240);
    if (!safeKey) return;
    out[safeKey] = {
      word: cleanString(item.word || key, 200),
      correct: safeNumber(item.correct),
      wrong: safeNumber(item.wrong),
      total: safeNumber(item.total),
      latest: cleanString(item.latest || '', 80)
    };
  });
  return out;
}

async function readSnapshot(binding, email) {
  const text = await binding.get(progressKey(email));
  if (!text) return null;
  try { return JSON.parse(text); } catch (err) { return null; }
}

async function listAll(binding, prefix) {
  let cursor;
  const keys = [];
  do {
    const page = await binding.list({ prefix, limit:1000, cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return { keys };
}

function summaryFromKey(key) {
  const metadata = key?.metadata || {};
  const email = normalizeEmail(metadata.email || String(key?.name || '').slice(KEY_PREFIX.length));
  if (!email) return null;
  return {
    email,
    updatedAt: String(metadata.updatedAt || ''),
    summary: {
      rankName: String(metadata.rankName || 'Egg'),
      rankIndex: safeNumber(metadata.rankIndex),
      masteredWords: safeNumber(metadata.masteredWords),
      totalWords: safeNumber(metadata.totalWords),
      enabledWords: safeNumber(metadata.enabledWords),
      totalSessions: safeNumber(metadata.totalSessions),
      totalCorrect: safeNumber(metadata.totalCorrect),
      totalWrong: safeNumber(metadata.totalWrong),
      lastPracticeAt: String(metadata.lastPracticeAt || '')
    }
  };
}

function progressKey(email) {
  return KEY_PREFIX + normalizeEmail(email).replace(/[^a-z0-9._-]/g, '_');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function cleanString(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanStringArray(value, maxItems, maxLength) {
  return (Array.isArray(value) ? value : []).slice(0, maxItems).map(v => cleanString(v, maxLength)).filter(Boolean);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store'
    }
  });
}
