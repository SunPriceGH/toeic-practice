const PREFIX = '__live_lesson__:';
const TEACHER_EMAIL = 'sunprice@sp.ik';
const RECORD_TTL_SECONDS = 8 * 60 * 60;
const TEACHER_ONLINE_SECONDS = 45;
const MAX_ANSWERS_PER_STUDENT = 200;

export async function onRequestGet(context) {
  try {
    const store = getStore(context);
    const session = requireSession(context.request);
    if (!session.ok) return json({ ok:false, error:session.error }, session.status);

    const url = new URL(context.request.url);
    const mode = String(url.searchParams.get('mode') || 'state').trim().toLowerCase();
    const lessonId = normalizeLessonId(url.searchParams.get('lessonId'));
    if (!lessonId) return json({ ok:false, error:'Thiếu mã bài học.' }, 400);

    if (mode === 'students') {
      if (!isTeacher(session.email)) return json({ ok:false, error:'Chỉ giáo viên được xem kết quả lớp.' }, 403);
      return getStudents(store, lessonId);
    }

    const state = await readClassState(store, lessonId);
    return json({
      ok:true,
      lessonId,
      teacher:isTeacher(session.email),
      teacherOnline:isTeacherOnline(state),
      activeSlide:Number.isInteger(state?.activeSlide) ? state.activeSlide : 0,
      slideCount:Number.isInteger(state?.slideCount) ? state.slideCount : 0,
      updatedAt:state?.updatedAt || null,
      teacherLastSeen:state?.teacherLastSeen || null,
      sessionId:state?.sessionId || null
    });
  } catch (err) {
    return json({ ok:false, error:err.message || 'Không tải được trạng thái lớp.' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const store = getStore(context);
    const session = requireSession(context.request);
    if (!session.ok) return json({ ok:false, error:session.error }, session.status);

    const body = await context.request.json().catch(() => ({}));
    const action = String(body?.action || '').trim().toLowerCase();
    const lessonId = normalizeLessonId(body?.lessonId);
    if (!lessonId) return json({ ok:false, error:'Thiếu mã bài học.' }, 400);

    if (action === 'teacher-sync' || action === 'teacher-heartbeat') {
      if (!isTeacher(session.email)) return json({ ok:false, error:'Chỉ giáo viên được điều khiển slide.' }, 403);
      return updateTeacherState(store, lessonId, body, action);
    }

    if (action === 'student-heartbeat') {
      if (isTeacher(session.email)) return json({ ok:true, teacher:true });
      return updateStudentHeartbeat(store, lessonId, session.email, body);
    }

    if (action === 'answer') {
      if (isTeacher(session.email)) return json({ ok:true, teacher:true, ignored:true });
      return saveStudentAnswer(store, lessonId, session.email, body);
    }

    return json({ ok:false, error:'Hành động không hợp lệ.' }, 400);
  } catch (err) {
    return json({ ok:false, error:err.message || 'Không xử lý được dữ liệu lớp.' }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const store = getStore(context);
    const session = requireSession(context.request);
    if (!session.ok) return json({ ok:false, error:session.error }, session.status);
    if (!isTeacher(session.email)) return json({ ok:false, error:'Chỉ giáo viên được xóa phiên lớp.' }, 403);

    const url = new URL(context.request.url);
    const lessonId = normalizeLessonId(url.searchParams.get('lessonId'));
    if (!lessonId) return json({ ok:false, error:'Thiếu mã bài học.' }, 400);

    const prefix = lessonPrefix(lessonId);
    let cursor;
    let deleted = 0;
    do {
      const list = await store.list({ prefix, limit:1000, cursor });
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

async function updateTeacherState(store, lessonId, body, action) {
  const current = await readClassState(store, lessonId) || {};
  const slideCount = clampInteger(body?.slideCount, 1, 300, current.slideCount || 1);
  const activeSlide = action === 'teacher-sync'
    ? clampInteger(body?.activeSlide, 0, Math.max(0, slideCount - 1), current.activeSlide || 0)
    : clampInteger(current.activeSlide, 0, Math.max(0, slideCount - 1), 0);
  const now = new Date().toISOString();
  const state = {
    lessonId,
    activeSlide,
    slideCount,
    teacherEmail:TEACHER_EMAIL,
    teacherLastSeen:now,
    updatedAt:action === 'teacher-sync' ? now : (current.updatedAt || now),
    openedAt:current.openedAt || now,
    sessionId:current.sessionId || createSessionId()
  };
  await store.put(stateKey(lessonId), JSON.stringify(state), { expirationTtl:RECORD_TTL_SECONDS });
  return json({ ok:true, state, teacherOnline:true });
}

async function updateStudentHeartbeat(store, lessonId, email, body) {
  const state = await readClassState(store, lessonId);
  const now = new Date().toISOString();
  const key = studentKey(lessonId, email);
  const existing = safeParse(await store.get(key)) || {};
  const record = normalizeStudentRecord(existing, email, lessonId);
  if (state?.sessionId && record.sessionId && record.sessionId !== state.sessionId) {
    record.answers = {};
    record.lastAnswer = null;
  }
  record.sessionId = state?.sessionId || record.sessionId || null;
  record.updatedAt = now;
  record.currentSlide = clampInteger(body?.currentSlide, 0, 299, 0);
  record.lastSeenAt = now;
  record.stats = summarizeAnswers(record.answers);
  await putStudent(store, key, record);
  return json({
    ok:true,
    teacherOnline:isTeacherOnline(state),
    activeSlide:Number.isInteger(state?.activeSlide) ? state.activeSlide : 0
  });
}

async function saveStudentAnswer(store, lessonId, email, body) {
  const state = await readClassState(store, lessonId);
  if (!isTeacherOnline(state)) return json({ ok:false, error:'Giáo viên chưa mở lớp hoặc đã rời lớp.' }, 409);

  const answer = normalizeAnswer(body);
  const validationError = validateAnswer(answer, state);
  if (validationError) return json({ ok:false, error:validationError }, 400);

  const key = studentKey(lessonId, email);
  const existing = safeParse(await store.get(key)) || {};
  const record = normalizeStudentRecord(existing, email, lessonId);
  if (state?.sessionId && record.sessionId && record.sessionId !== state.sessionId) {
    record.answers = {};
    record.lastAnswer = null;
  }
  record.sessionId = state?.sessionId || record.sessionId || null;
  const answerKey = `${answer.slideId}::${answer.exerciseId}`;

  if (record.answers[answerKey]) {
    return json({ ok:true, alreadySubmitted:true, answer:record.answers[answerKey], stats:summarizeAnswers(record.answers) });
  }

  const now = new Date().toISOString();
  record.answers[answerKey] = answer;
  record.answers = trimAnswers(record.answers, MAX_ANSWERS_PER_STUDENT);
  record.updatedAt = now;
  record.lastSeenAt = now;
  record.sessionId = state?.sessionId || record.sessionId || null;
  record.currentSlide = answer.slideIndex;
  record.lastAnswer = answer;
  record.stats = summarizeAnswers(record.answers);
  await putStudent(store, key, record);

  return json({ ok:true, answer, stats:record.stats });
}

async function getStudents(store, lessonId) {
  const prefix = `${lessonPrefix(lessonId)}student:`;
  const list = await store.list({ prefix, limit:1000 });
  const students = [];
  for (const item of list.keys) {
    const record = safeParse(await store.get(item.name));
    if (!record || isTeacher(record.email)) continue;
    record.stats = summarizeAnswers(record.answers);
    students.push(record);
  }
  students.sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  const state = await readClassState(store, lessonId);
  return json({
    ok:true,
    students,
    teacherOnline:isTeacherOnline(state),
    activeSlide:Number.isInteger(state?.activeSlide) ? state.activeSlide : 0,
    sessionId:state?.sessionId || null,
    generatedAt:new Date().toISOString()
  });
}

function normalizeStudentRecord(record, email, lessonId) {
  return {
    lessonId,
    email:normalizeEmail(email),
    createdAt:record.createdAt || new Date().toISOString(),
    updatedAt:record.updatedAt || new Date().toISOString(),
    lastSeenAt:record.lastSeenAt || null,
    currentSlide:Number.isInteger(record.currentSlide) ? record.currentSlide : 0,
    answers:record.answers && typeof record.answers === 'object' ? record.answers : {},
    lastAnswer:record.lastAnswer || null,
    stats:record.stats || { total:0, correct:0, wrong:0, submitted:0 },
    sessionId:record.sessionId || null
  };
}

function normalizeAnswer(body) {
  const selected = String(body?.selected ?? '').trim().slice(0, 1000);
  const correctAnswer = body?.correctAnswer == null ? null : String(body.correctAnswer).trim().slice(0, 1000);
  const scored = typeof body?.isCorrect === 'boolean' && correctAnswer !== null;
  return {
    slideIndex:clampInteger(body?.slideIndex, 0, 299, 0),
    slideId:safeId(body?.slideId, 80),
    slideTitle:String(body?.slideTitle || '').trim().slice(0, 180),
    exerciseId:safeId(body?.exerciseId, 80),
    exerciseType:String(body?.exerciseType || 'single-choice').trim().slice(0, 40),
    question:String(body?.question || '').trim().slice(0, 1000),
    selected,
    selectedText:String(body?.selectedText || selected).trim().slice(0, 1000),
    correctAnswer,
    isCorrect:scored ? Boolean(body.isCorrect) : null,
    checkedAt:isValidDate(body?.checkedAt) ? new Date(body.checkedAt).toISOString() : new Date().toISOString()
  };
}

function validateAnswer(answer, state) {
  if (!answer.slideId || !answer.exerciseId) return 'Thiếu mã slide hoặc mã bài tập.';
  if (!answer.question) return 'Thiếu nội dung câu hỏi.';
  if (!answer.selected) return 'Học viên chưa nhập/chọn đáp án.';
  if (!Number.isInteger(answer.slideIndex) || answer.slideIndex < 0) return 'Vị trí slide không hợp lệ.';
  if (Number.isInteger(state?.activeSlide) && answer.slideIndex !== state.activeSlide) {
    return 'Slide này hiện không được giáo viên mở.';
  }
  return '';
}

function summarizeAnswers(answers) {
  const values = Object.values(answers || {});
  const correct = values.filter(item => item?.isCorrect === true).length;
  const wrong = values.filter(item => item?.isCorrect === false).length;
  const submitted = values.filter(item => item?.isCorrect == null).length;
  return { total:values.length, correct, wrong, submitted };
}

function trimAnswers(answers, maxItems) {
  const entries = Object.entries(answers || {}).sort((a,b) => new Date(b[1]?.checkedAt || 0) - new Date(a[1]?.checkedAt || 0));
  return Object.fromEntries(entries.slice(0, maxItems));
}


function createSessionId() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch (err) {}
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isTeacherOnline(state) {
  const time = new Date(state?.teacherLastSeen || 0).getTime();
  return Number.isFinite(time) && Date.now() - time <= TEACHER_ONLINE_SECONDS * 1000;
}

async function readClassState(store, lessonId) {
  return safeParse(await store.get(stateKey(lessonId)));
}

async function putStudent(store, key, record) {
  await store.put(key, JSON.stringify(record), {
    expirationTtl:RECORD_TTL_SECONDS,
    metadata:{
      email:record.email,
      lessonId:record.lessonId,
      updatedAt:record.updatedAt,
      currentSlide:String(record.currentSlide),
      total:String(record.stats?.total || 0),
      correct:String(record.stats?.correct || 0),
      wrong:String(record.stats?.wrong || 0)
    }
  });
}

function requireSession(request) {
  const email = normalizeEmail(request.headers.get('x-student-email') || request.headers.get('x-teacher-email'));
  const token = request.headers.get('x-student-token') || '';
  if (!email || !email.includes('@')) return { ok:false, status:400, error:'Thiếu email đăng nhập.' };
  if (!isSessionTokenForEmail(token, email)) return { ok:false, status:401, error:'Phiên đăng nhập không hợp lệ.' };
  return { ok:true, email };
}

function getStore(context) {
  if (!context.env.STUDENT_RESULTS) throw new Error('Thiếu KV binding STUDENT_RESULTS.');
  return context.env.STUDENT_RESULTS;
}

function lessonPrefix(lessonId) {
  return `${PREFIX}${lessonId}:`;
}

function stateKey(lessonId) {
  return `${lessonPrefix(lessonId)}state`;
}

function studentKey(lessonId, email) {
  return `${lessonPrefix(lessonId)}student:${safeEmail(email)}`;
}

function normalizeLessonId(value) {
  return safeId(value, 80);
}

function safeId(value, maxLength) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, maxLength || 80);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function safeEmail(email) {
  return normalizeEmail(email).replace(/[^a-z0-9._-]/g, '_');
}

function isTeacher(email) {
  return normalizeEmail(email) === TEACHER_EMAIL;
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

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function isValidDate(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time > 0;
}

function safeParse(text) {
  try { return text ? JSON.parse(text) : null; } catch (err) { return null; }
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
