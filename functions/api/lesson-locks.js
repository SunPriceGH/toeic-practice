const ADMIN_EMAIL = 'sunprice@sp.ik';
const CANONICAL_KEY = '__lesson_locks__';
const LEGACY_KEYS = [
  'lesson-locks',
  'lesson_locks',
  'lessonLocks',
  'lockedLessonIds'
];

export async function onRequestGet(context) {
  try {
    const stores = getStores(context.env);
    const lockedLessonIds = await readLocksFromStores(stores);
    return json({ ok: true, lockedLessonIds });
  } catch (err) {
    return json({
      ok: false,
      error: err?.message || 'Không tải được trạng thái khóa bài.'
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const stores = getStores(context.env);
    const auth = getStudentAuth(context.request);

    if (!auth.ok) {
      return json({ ok: false, error: auth.error }, 401);
    }
    if (auth.email !== ADMIN_EMAIL) {
      return json({
        ok: false,
        error: 'Tài khoản này không có quyền quản lý đề.'
      }, 403);
    }

    const body = await context.request.json().catch(() => ({}));
    const lessonId = String(body.lessonId || '').trim();
    const action = String(body.action || '').trim().toLowerCase();

    if (!lessonId) {
      return json({ ok: false, error: 'Thiếu mã đề cần cập nhật.' }, 400);
    }
    if (action !== 'lock' && action !== 'unlock') {
      return json({
        ok: false,
        error: 'Thao tác khóa/mở khóa không hợp lệ.'
      }, 400);
    }

    const current = await readLocksFromStores(stores);
    const nextSet = new Set(current);

    if (action === 'lock') nextSet.add(lessonId);
    else nextSet.delete(lessonId);

    const lockedLessonIds = [...nextSet].sort();

    // Chỉ ghi đúng MỘT record chuẩn.
    await putWithRetry(
      stores.primary,
      CANONICAL_KEY,
      JSON.stringify({
        lockedLessonIds,
        updatedAt: new Date().toISOString(),
        updatedBy: ADMIN_EMAIL
      })
    );

    // Xóa 4 key cũ từng làm xuất hiện record rỗng trong trang kết quả.
    await cleanupLegacyKeys(stores);

    return json({ ok: true, lockedLessonIds });
  } catch (err) {
    return json({
      ok: false,
      error: publicError(err, 'Không cập nhật được trạng thái đề.')
    }, isKvLimit(err) ? 429 : 500);
  }
}

function getStores(env) {
  // Nếu có KV riêng cho khóa bài thì luôn ưu tiên nó.
  const primary = env.LESSON_LOCKS || env.STUDENT_RESULTS || null;
  if (!primary) {
    throw new Error('Thiếu KV binding LESSON_LOCKS hoặc STUDENT_RESULTS.');
  }

  return {
    primary,
    // Dùng để đọc/xóa dữ liệu cũ nếu trước đây khóa bài lưu nhầm trong STUDENT_RESULTS.
    studentResults:
      env.STUDENT_RESULTS && env.STUDENT_RESULTS !== primary
        ? env.STUDENT_RESULTS
        : null
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getStudentAuth(request) {
  const email = normalizeEmail(request.headers.get('x-student-email') || '');
  const token = request.headers.get('x-student-token') || '';

  if (!email || !isStudentTokenForEmail(token, email)) {
    return {
      ok: false,
      email,
      error: 'Phiên đăng nhập học viên không hợp lệ.'
    };
  }

  return { ok: true, email };
}

function isStudentTokenForEmail(token, email) {
  try {
    const decoded = atob(String(token || ''));
    const parts = decoded.split('|');
    const role = String(parts[0] || '').trim().toLowerCase();
    const tokenEmail = normalizeEmail(parts[1]);

    return (
      (role === 'student' || role === 'admin') &&
      tokenEmail === normalizeEmail(email)
    );
  } catch (err) {
    return false;
  }
}

async function readLocksFromStores(stores) {
  const primaryLocks = await readLocks(stores.primary);
  if (primaryLocks.found) return primaryLocks.items;

  if (stores.studentResults) {
    const oldLocks = await readLocks(stores.studentResults);
    if (oldLocks.found) return oldLocks.items;
  }

  return [];
}

async function readLocks(store) {
  const keys = [CANONICAL_KEY, ...LEGACY_KEYS];

  for (const key of keys) {
    const raw = await store.get(key);
    if (!raw) continue;

    const parsed = parseLocks(raw);
    if (parsed) return { found: true, items: parsed };
  }

  return { found: false, items: [] };
}

function parseLocks(raw) {
  try {
    const data = JSON.parse(raw);

    if (Array.isArray(data)) return uniqueStrings(data);
    if (Array.isArray(data.lockedLessonIds)) {
      return uniqueStrings(data.lockedLessonIds);
    }
    if (Array.isArray(data.items)) return uniqueStrings(data.items);
  } catch (err) {
    return null;
  }

  return null;
}

function uniqueStrings(values) {
  return [
    ...new Set(
      values
        .map(value => String(value || '').trim())
        .filter(Boolean)
    )
  ];
}

async function cleanupLegacyKeys(stores) {
  const targets = [stores.primary, stores.studentResults].filter(Boolean);

  for (const store of targets) {
    for (const key of LEGACY_KEYS) {
      await deleteWithRetry(store, key);
    }
  }

  // Nếu đã có KV LESSON_LOCKS riêng, xóa luôn record chuẩn cũ
  // từng nằm nhầm trong STUDENT_RESULTS để KV kết quả sạch hoàn toàn.
  if (stores.studentResults) {
    await deleteWithRetry(stores.studentResults, CANONICAL_KEY);
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
      await wait(1200 + attempt * 500);
    }
  }

  throw lastError;
}

async function deleteWithRetry(store, key) {
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await store.delete(key);
      return;
    } catch (err) {
      lastError = err;
      if (!isKvLimit(err) || attempt === 3) break;
      await wait(1200 + attempt * 500);
    }
  }

  throw lastError;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  if (isKvLimit(err)) {
    return 'Bạn thao tác hơi nhanh. Vui lòng thử lại sau 1-2 giây.';
  }
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
