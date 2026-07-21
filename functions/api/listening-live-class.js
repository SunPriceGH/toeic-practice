const PREFIX = '__listening_live__:';
const TEACHER_EMAIL = 'sunprice@sp.ik';
const RECORD_TTL_SECONDS = 6 * 60 * 60;
const MAX_CHECKS_PER_STUDENT = 160;

export async function onRequestPost(context) {
  try {
    const store = getStore(context);
    const email = normalizeEmail(context.request.headers.get('x-student-email'));
    const token = context.request.headers.get('x-student-token') || '';

    if (!email || !email.includes('@')) return json({ ok:false, error:'Thiếu email học viên.' }, 400);
    if (!isSessionTokenForEmail(token, email)) return json({ ok:false, error:'Phiên đăng nhập không hợp lệ.' }, 401);

    // Tài khoản giáo viên có thể mở bài luyện nhưng không được tính vào danh sách học viên.
    if (email === TEACHER_EMAIL) return json({ ok:true, teacher:true });

    const body = await context.request.json();
    const check = normalizeCheck(body);
    const validationError = validateCheck(check);
    if (validationError) return json({ ok:false, error:validationError }, 400);

    const key = PREFIX + safeEmail(email);
    const existingText = await store.get(key);
    let record = existingText ? safeParse(existingText) : null;
    if (!record || typeof record !== 'object') record = { email, createdAt:new Date().toISOString(), checks:{} };
    if (!record.checks || typeof record.checks !== 'object') record.checks = {};

    const checkKey = `${check.year}-${check.test}-${check.question}`;
    record.email = email;
    record.updatedAt = check.checkedAt;
    record.current = {
      year: check.year,
      test: check.test,
      part: check.part,
      question: check.question
    };
    record.lastCheck = check;
    record.checks[checkKey] = check;
    record.checks = trimChecks(record.checks, MAX_CHECKS_PER_STUDENT);
    record.stats = summarizeChecks(record.checks);

    await store.put(key, JSON.stringify(record), {
      expirationTtl: RECORD_TTL_SECONDS,
      metadata: {
        email,
        updatedAt: record.updatedAt,
        year: String(check.year),
        test: String(check.test),
        part: String(check.part),
        question: String(check.question),
        correct: String(record.stats.correct),
        wrong: String(record.stats.wrong)
      }
    });

    return json({ ok:true, record:{ email:record.email, updatedAt:record.updatedAt, current:record.current, stats:record.stats } });
  } catch (err) {
    return json({ ok:false, error:err.message || 'Không lưu được kết quả trực tiếp.' }, 500);
  }
}

export async function onRequestGet(context) {
  try {
    const store = getStore(context);
    const teacherEmail = normalizeEmail(context.request.headers.get('x-teacher-email'));
    const token = context.request.headers.get('x-student-token') || '';
    if (teacherEmail !== TEACHER_EMAIL) return json({ ok:false, error:'Chỉ tài khoản giáo viên được xem panel này.' }, 403);
    if (!isSessionTokenForEmail(token, teacherEmail)) return json({ ok:false, error:'Phiên giáo viên không hợp lệ.' }, 401);

    const url = new URL(context.request.url);
    const activeMinutes = clampNumber(url.searchParams.get('activeMinutes'), 1, 720, 360);
    const cutoff = Date.now() - activeMinutes * 60 * 1000;
    const list = await store.list({ prefix:PREFIX, limit:1000 });
    const students = [];

    for (const key of list.keys) {
      const text = await store.get(key.name);
      if (!text) continue;
      const record = safeParse(text);
      if (!record || normalizeEmail(record.email) === TEACHER_EMAIL) continue;
      const updatedAt = new Date(record.updatedAt || 0).getTime();
      if (!Number.isFinite(updatedAt) || updatedAt < cutoff) continue;
      students.push(record);
    }

    students.sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    return json({ ok:true, students, generatedAt:new Date().toISOString(), activeMinutes });
  } catch (err) {
    return json({ ok:false, error:err.message || 'Không tải được dữ liệu trực tiếp.' }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const store = getStore(context);
    const teacherEmail = normalizeEmail(context.request.headers.get('x-teacher-email'));
    const token = context.request.headers.get('x-student-token') || '';
    if (teacherEmail !== TEACHER_EMAIL) return json({ ok:false, error:'Chỉ tài khoản giáo viên được xóa phiên lớp.' }, 403);
    if (!isSessionTokenForEmail(token, teacherEmail)) return json({ ok:false, error:'Phiên giáo viên không hợp lệ.' }, 401);

    let cursor;
    let deleted = 0;
    do {
      const list = await store.list({ prefix:PREFIX, limit:1000, cursor });
      await Promise.all(list.keys.map(async key => {
        await store.delete(key.name);
        deleted++;
      }));
      cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);

    return json({ ok:true, deleted });
  } catch (err) {
    return json({ ok:false, error:err.message || 'Không xóa được phiên lớp.' }, 500);
  }
}

function getStore(context) {
  if (!context.env.STUDENT_RESULTS) throw new Error('Thiếu KV binding STUDENT_RESULTS.');
  return context.env.STUDENT_RESULTS;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function safeEmail(email) {
  return normalizeEmail(email).replace(/[^a-z0-9._-]/g, '_');
}

function normalizeCheck(body) {
  return {
    year: Number(body?.year),
    test: Number(body?.test),
    part: Number(body?.part),
    question: Number(body?.question),
    selected: String(body?.selected || '').trim().toUpperCase(),
    correctAnswer: String(body?.correctAnswer || '').trim().toUpperCase(),
    isCorrect: Boolean(body?.isCorrect),
    checkedAt: isValidDate(body?.checkedAt) ? new Date(body.checkedAt).toISOString() : new Date().toISOString()
  };
}

function validateCheck(check) {
  if (![2023, 2024].includes(check.year)) return 'Năm đề không hợp lệ.';
  if (!Number.isInteger(check.test) || check.test < 1 || check.test > 10) return 'Số đề không hợp lệ.';
  if (![1, 2].includes(check.part)) return 'Phiên bản hiện tại chỉ nhận Part 1 và Part 2.';
  if (!Number.isInteger(check.question) || check.question < 1 || check.question > 31) return 'Số câu không hợp lệ.';
  if (check.part === 1 && check.question > 6) return 'Câu không thuộc Part 1.';
  if (check.part === 2 && (check.question < 7 || check.question > 31)) return 'Câu không thuộc Part 2.';
  const allowed = check.part === 1 ? ['A','B','C','D'] : ['A','B','C'];
  if (!allowed.includes(check.selected)) return 'Option học viên chọn không hợp lệ.';
  if (!allowed.includes(check.correctAnswer)) return 'Đáp án đúng không hợp lệ.';
  check.isCorrect = check.selected === check.correctAnswer;
  return '';
}

function trimChecks(checks, maxItems) {
  const entries = Object.entries(checks || {}).sort((a,b) => new Date(b[1]?.checkedAt || 0) - new Date(a[1]?.checkedAt || 0));
  return Object.fromEntries(entries.slice(0, maxItems));
}

function summarizeChecks(checks) {
  const values = Object.values(checks || {});
  const correct = values.filter(item => item?.isCorrect).length;
  return { total:values.length, correct, wrong:values.length - correct };
}

function isSessionTokenForEmail(token, email) {
  try {
    const decoded = atob(String(token || ''));
    const parts = decoded.split('|');
    return ['student','admin'].includes(parts[0]) && normalizeEmail(parts[1]) === normalizeEmail(email);
  } catch (err) {
    return false;
  }
}

function isValidDate(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time > 0;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function safeParse(text) {
  try { return JSON.parse(text); } catch (err) { return null; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store'
    }
  });
}
