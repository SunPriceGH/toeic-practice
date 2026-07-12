import { isAdminPassword } from '../_shared/admin-auth.js';

const LOCK_KEY = '__lesson_locks__';
const DEFAULT_LESSON_IDS = [
  'word-form-100',
  'be-adj-v3-v-ed-prep-1',
  'be-adj-v3-v-ed-prep-2',
  'noun-prep-collocation-1',
  'noun-prep-collocation-2',
  'toeic-listening',
  'ets-summer-2021-test1-part5-6',
  'ets-summer-2021-test1-part5-6-practice',
  'ets2024-p56-practice',
  'vocabulary-box',
  'results'
];

const DEFAULT_LOCK_WHEN_MISSING_IDS = [
  'ets-summer-2021-test1-part5-6-practice',
  'ets2024-p56-practice'
];

export async function onRequestGet(context) {
  try {
    const store = getStore(context);
    const state = await readLockState(store);
    if (state.changed) await saveLockState(store, state.lockedLessonIds, state.knownLessonIds);
    return json({ ok: true, lockedLessonIds: state.lockedLessonIds, knownLessonIds: state.knownLessonIds });
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

    const state = await readLockState(store);
    let lockedLessonIds = state.lockedLessonIds;
    if (action === 'lock' && !lockedLessonIds.includes(lessonId)) {
      lockedLessonIds.push(lessonId);
    }
    if (action === 'unlock') {
      lockedLessonIds = lockedLessonIds.filter(id => id !== lessonId);
    }

    const knownLessonIds = [...DEFAULT_LESSON_IDS];
    await saveLockState(store, lockedLessonIds, knownLessonIds);
    return json({ ok: true, lockedLessonIds, knownLessonIds });
  } catch (err) {
    return json({ ok: false, error: err.message || 'Không cập nhật được trạng thái khóa bài.' }, 500);
  }
}

function getStore(context) {
  if (!context.env.STUDENT_RESULTS) throw new Error('Thiếu KV binding STUDENT_RESULTS.');
  return context.env.STUDENT_RESULTS;
}

async function readLockState(store) {
  const text = await store.get(LOCK_KEY);
  if (!text) {
    return { lockedLessonIds: [...DEFAULT_LESSON_IDS], knownLessonIds: [...DEFAULT_LESSON_IDS], changed: false };
  }

  let raw = {};
  try {
    raw = JSON.parse(text) || {};
  } catch (err) {
    return { lockedLessonIds: [...DEFAULT_LESSON_IDS], knownLessonIds: [...DEFAULT_LESSON_IDS], changed: true };
  }

  const lockedLessonIds = uniqueIds(Array.isArray(raw.lockedLessonIds) ? raw.lockedLessonIds : DEFAULT_LESSON_IDS);
  const knownLessonIds = uniqueIds(Array.isArray(raw.knownLessonIds) ? raw.knownLessonIds : []);
  let changed = false;

  DEFAULT_LOCK_WHEN_MISSING_IDS.forEach(id => {
    if (!knownLessonIds.includes(id) && !lockedLessonIds.includes(id)) {
      lockedLessonIds.push(id);
      changed = true;
    }
  });

  const finalKnownLessonIds = [...DEFAULT_LESSON_IDS];
  if (knownLessonIds.length !== finalKnownLessonIds.length || knownLessonIds.some(id => !finalKnownLessonIds.includes(id))) changed = true;

  return {
    lockedLessonIds: uniqueIds(lockedLessonIds),
    knownLessonIds: finalKnownLessonIds,
    changed
  };
}

function uniqueIds(ids) {
  return [...new Set(ids.map(id => String(id || '').trim()).filter(id => DEFAULT_LESSON_IDS.includes(id)))];
}

async function saveLockState(store, lockedLessonIds, knownLessonIds) {
  await store.put(LOCK_KEY, JSON.stringify({
    lockedLessonIds: uniqueIds(lockedLessonIds),
    knownLessonIds: uniqueIds(knownLessonIds),
    updatedAt: new Date().toISOString()
  }));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
