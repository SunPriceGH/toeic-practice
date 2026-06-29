import { isAdminPassword } from '../_shared/admin-auth.js';

const LOCK_KEY = '__lesson_locks__';
const DEFAULT_LESSON_IDS = [
  'word-form-100',
  'be-adj-v3-v-ed-prep-1',
  'be-adj-v3-v-ed-prep-2',
  'noun-prep-collocation-1',
  'noun-prep-collocation-2',
  'results'
];

export async function onRequestGet(context) {
  try {
    const store = getStore(context);
    const lockedLessonIds = await readLockedLessonIds(store);
    return json({ ok: true, lockedLessonIds });
  } catch (err) {
    return json({ ok: false, error: err.message || 'Không tải được trạng thái khóa bài.' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const store = getStore(context);
    const adminPassword = context.request.headers.get('x-admin-password') || '';
    if (!isAdminPassword(context.env, adminPassword)) {
      return json({ ok: false, error: 'Sai mật khẩu admin.' }, 401);
    }

    const body = await context.request.json();
    const lessonId = String(body.lessonId || '').trim();
    const action = String(body.action || '').trim();
    if (!DEFAULT_LESSON_IDS.includes(lessonId)) {
      return json({ ok: false, error: 'Bài học không hợp lệ.' }, 400);
    }
    if (!['lock', 'unlock'].includes(action)) {
      return json({ ok: false, error: 'Thao tác không hợp lệ.' }, 400);
    }

    let lockedLessonIds = await readLockedLessonIds(store);
    if (action === 'lock' && !lockedLessonIds.includes(lessonId)) {
      lockedLessonIds.push(lessonId);
    }
    if (action === 'unlock') {
      lockedLessonIds = lockedLessonIds.filter(id => id !== lessonId);
    }

    await store.put(LOCK_KEY, JSON.stringify({ lockedLessonIds, updatedAt: new Date().toISOString() }));
    return json({ ok: true, lockedLessonIds });
  } catch (err) {
    return json({ ok: false, error: err.message || 'Không cập nhật được trạng thái khóa bài.' }, 500);
  }
}

function getStore(context) {
  if (!context.env.STUDENT_RESULTS) throw new Error('Thiếu KV binding STUDENT_RESULTS.');
  return context.env.STUDENT_RESULTS;
}

async function readLockedLessonIds(store) {
  const text = await store.get(LOCK_KEY);
  if (!text) return [...DEFAULT_LESSON_IDS];
  try {
    const data = JSON.parse(text);
    const ids = Array.isArray(data.lockedLessonIds) ? data.lockedLessonIds : DEFAULT_LESSON_IDS;
    return ids.filter(id => DEFAULT_LESSON_IDS.includes(id));
  } catch (err) {
    return [...DEFAULT_LESSON_IDS];
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
