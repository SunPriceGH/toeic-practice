const ADMIN_EMAIL = 'sunprice@sp.ik';
const CANONICAL_KEY = '__lesson_locks__';
const LEGACY_KEYS = [
  CANONICAL_KEY,
  'lesson-locks',
  'lesson_locks',
  'lessonLocks',
  'lockedLessonIds'
];

export async function onRequestGet(context) {
  try {
    const store = getStore(context.env);
    const lockedLessonIds = await readLocks(store);
    return json({ ok: true, lockedLessonIds });
  } catch (err) {
    return json({ ok: false, error: err?.message || 'Không tải được trạng thái khóa bài.' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const store = getStore(context.env);
    const auth = getStudentAuth(context.request);

    if (!auth.ok) {
      return json({ ok: false, error: auth.error }, 401);
    }
    if (auth.email !== ADMIN_EMAIL) {
      return json({ ok: false, error: 'Tài khoản này không có quyền quản lý đề.' }, 403);
    }

    const body = await context.request.json().catch(() => ({}));
    const lessonId = String(body.lessonId || '').trim();
    const action = String(body.action || '').trim().toLowerCase();

    if (!lessonId) {
      return json({ ok: false, error: 'Thiếu mã đề cần cập nhật.' }, 400);
    }
    if (action !== 'lock' && action !== 'unlock') {
      return json({ ok: false, error: 'Thao tác khóa/mở khóa không hợp lệ.' }, 400);
    }

    const current = await readLocks(store);
    const nextSet = new Set(current);
    if (action === 'lock') nextSet.add(lessonId);
    else nextSet.delete(lessonId);

    const lockedLessonIds = [...nextSet].sort();
    await writeLocks(store, lockedLessonIds);

    return json({ ok: true, lockedLessonIds });
  } catch (err) {
    return json({ ok: false, error: publicError(err, 'Không cập nhật được trạng thái đề.') }, isKvLimit(err) ? 429 : 500);
  }
}

function getStore(env) {
  const store = env.STUDENT_RESULTS || env.LESSON_LOCKS || null;
  if (!store) throw new Error('Thiếu KV binding STUDENT_RESULTS.');
  return store;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getStudentAuth(request) {
  const email = normalizeEmail(request.headers.get('x-student-email') || '');
  const token = request.headers.get('x-student-token') || '';
  if (!email || !isStudentTokenForEmail(token, email)) {
    return { ok: false, email, error: 'Phiên đăng nhập học viên không hợp lệ.' };
  }
  return { ok: true, email };
}

function isStudentTokenForEmail(token, email) {
  try {
    const decoded = atob(String(token || ''));
    const parts = decoded.split('|');
    const role = String(parts[0] || '').trim().toLowerCase();
    const tokenEmail = normalizeEmail(parts[1]);
    return (role === 'student' || role === 'admin') && tokenEmail === normalizeEmail(email);
  } catch (err) {
    return false;
  }
}

async function readLocks(store) {
  for (const key of LEGACY_KEYS) {
    const raw = await store.get(key);
    if (!raw) continue;
    const parsed = parseLocks(raw);
    if (parsed) return parsed;
  }
  return [];
}

function parseLocks(raw) {
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return uniqueStrings(data);
    if (Array.isArray(data.lockedLessonIds)) return uniqueStrings(data.lockedLessonIds);
    if (Array.isArray(data.items)) return uniqueStrings(data.items);
  } catch (err) {
    return null;
  }
  return null;
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

async function writeLocks(store, lockedLessonIds) {
  const payload = JSON.stringify({
    lockedLessonIds,
    updatedAt: new Date().toISOString(),
    updatedBy: ADMIN_EMAIL
  });

  // Ghi khóa chuẩn và các khóa cũ thường gặp để không làm hỏng trang cũ.
  for (const key of LEGACY_KEYS) {
    await putWithRetry(store, key, payload);
  }
}

async function putWithRetry(store, key, value) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await store.put(key, value);
      return;
    } catch (err) {
      lastError = err;
      if (!isKvLimit(err) || attempt === 3) break;
      await new Promise(resolve => setTimeout(resolve, 1200 + attempt * 500));
    }
  }
  throw lastError;
}

function isKvLimit(err) {
  const message = String(err?.message || err || '').toLowerCase();
  return message.includes('kv') && (
    message.includes('limit') ||
    message.includes('rate') ||
    message.includes('quota') ||
    message.includes('exceed')
  );
}

function publicError(err, fallback) {
  if (isKvLimit(err)) return 'Bạn thao tác hơi nhanh. Vui lòng thử lại sau 1-2 giây.';
  return err?.message || fallback;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
