import { isAdminPassword } from '../_shared/admin-auth.js';

const COMMON_KEY = '__vocabulary_common__';
const USER_PREFIX = '__vocabulary_user__';
const ALLOWED_PARTS = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun'];

export async function onRequestGet(context) {
  try {
    const store = getStore(context);
    const commonWords = await readList(store, COMMON_KEY);
    const url = new URL(context.request.url);
    const email = normalizeEmail(url.searchParams.get('email') || context.request.headers.get('x-student-email') || '');

    if (!email) {
      return json({ ok: true, commonWords, userWords: [] });
    }

    const token = context.request.headers.get('x-student-token') || '';
    if (!isStudentTokenForEmail(token, email)) {
      return json({ ok: false, error: 'Phiên đăng nhập học viên không hợp lệ.' }, 401);
    }

    const userWords = await readList(store, userKey(email));
    return json({ ok: true, commonWords, userWords });
  } catch (err) {
    return json({ ok: false, error: err.message || 'Không tải được từ vựng.' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const store = getStore(context);
    const body = await context.request.json().catch(() => ({}));
    const action = String(body.action || 'add-user').trim();

    if (action === 'add-common') {
      const adminPassword = context.request.headers.get('x-admin-password') || String(body.adminPassword || '');
      if (!isAdminPassword(context.env, adminPassword)) {
        return json({ ok: false, error: 'Sai mật khẩu admin.' }, 401);
      }
      const item = normalizeVocabItem(body.item || body);
      const commonWords = await upsertItem(store, COMMON_KEY, item, 'common');
      return json({ ok: true, commonWords });
    }

    if (action === 'copy-common-to-user') {
      const { email } = requireStudent(context, body);
      const commonId = String(body.commonId || '').trim();
      const commonWords = await readList(store, COMMON_KEY);
      const source = commonWords.find(item => item.id === commonId);
      if (!source) return json({ ok: false, error: 'Không tìm thấy từ trong kho chung.' }, 404);
      const copied = {
        word: source.word,
        parts: source.parts,
        meanings: source.meanings,
        note: source.note || '',
        source: 'common',
        commonId: source.id
      };
      const userWords = await upsertItem(store, userKey(email), copied, 'user');
      return json({ ok: true, userWords });
    }

    if (action === 'update-user') {
      const { email } = requireStudent(context, body);
      const id = String(body.id || body.item?.id || '').trim();
      if (!id) return json({ ok: false, error: 'Thiếu ID từ cần sửa.' }, 400);
      const item = normalizeVocabItem(body.item || body);
      const userWords = await replaceItem(store, userKey(email), id, item, 'user');
      return json({ ok: true, userWords });
    }

    const { email } = requireStudent(context, body);
    const item = normalizeVocabItem(body.item || body);
    const userWords = await upsertItem(store, userKey(email), item, 'user');
    return json({ ok: true, userWords });
  } catch (err) {
    return json({ ok: false, error: err.message || 'Không lưu được từ vựng.' }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const store = getStore(context);
    const url = new URL(context.request.url);
    const scope = String(url.searchParams.get('scope') || 'user').trim();
    const id = String(url.searchParams.get('id') || '').trim();
    if (!id) return json({ ok: false, error: 'Thiếu ID từ cần xóa.' }, 400);

    if (scope === 'common') {
      const adminPassword = context.request.headers.get('x-admin-password') || '';
      if (!isAdminPassword(context.env, adminPassword)) {
        return json({ ok: false, error: 'Sai mật khẩu admin.' }, 401);
      }
      const commonWords = await removeItem(store, COMMON_KEY, id);
      return json({ ok: true, commonWords });
    }

    const email = normalizeEmail(url.searchParams.get('email') || context.request.headers.get('x-student-email') || '');
    const token = context.request.headers.get('x-student-token') || '';
    if (!email || !isStudentTokenForEmail(token, email)) {
      return json({ ok: false, error: 'Phiên đăng nhập học viên không hợp lệ.' }, 401);
    }
    const userWords = await removeItem(store, userKey(email), id);
    return json({ ok: true, userWords });
  } catch (err) {
    return json({ ok: false, error: err.message || 'Không xóa được từ vựng.' }, 500);
  }
}

function getStore(context) {
  if (!context.env.STUDENT_RESULTS) throw new Error('Thiếu KV binding STUDENT_RESULTS.');
  return context.env.STUDENT_RESULTS;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function safeEmail(email) {
  return normalizeEmail(email).replace(/[^a-z0-9._-]/gi, '_');
}

function userKey(email) {
  return USER_PREFIX + safeEmail(email);
}

function requireStudent(context, body = {}) {
  const email = normalizeEmail(body.email || context.request.headers.get('x-student-email') || '');
  const token = context.request.headers.get('x-student-token') || String(body.token || '');
  if (!email || !isStudentTokenForEmail(token, email)) {
    throw new Error('Phiên đăng nhập học viên không hợp lệ.');
  }
  return { email, token };
}

function normalizeVocabItem(raw) {
  const word = String(raw.word || '').trim().replace(/\s+/g, ' ');
  const parts = Array.isArray(raw.parts) ? raw.parts.map(p => String(p).trim().toLowerCase()).filter(Boolean) : [];
  let meanings = raw.meanings;
  if (!Array.isArray(meanings)) {
    meanings = String(meanings || '')
      .split(/\n|;|\|/g)
      .map(s => s.trim())
      .filter(Boolean);
  }
  const note = String(raw.note || '').trim();
  const cleanParts = [...new Set(parts)].filter(p => ALLOWED_PARTS.includes(p));
  const cleanMeanings = [...new Set(meanings.map(m => String(m).trim()).filter(Boolean))];

  if (!word) throw new Error('Vui lòng nhập từ/cụm từ.');
  if (cleanParts.length === 0) throw new Error('Vui lòng chọn ít nhất 1 loại từ.');
  if (cleanMeanings.length === 0) throw new Error('Vui lòng nhập ít nhất 1 nghĩa.');

  return { word, parts: cleanParts, meanings: cleanMeanings, note };
}

async function readList(store, key) {
  const text = await store.get(key);
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.items)) return data.items;
    return [];
  } catch (err) {
    return [];
  }
}

async function writeList(store, key, items) {
  await store.put(key, JSON.stringify({ items, updatedAt: new Date().toISOString() }));
}

function vocabSignature(item) {
  return [
    String(item.word || '').trim().toLowerCase().replace(/\s+/g, ' '),
    (item.parts || []).slice().sort().join(','),
    (item.meanings || []).map(m => String(m).trim().toLowerCase()).sort().join('|')
  ].join('::');
}

async function upsertItem(store, key, cleanItem, owner) {
  const items = await readList(store, key);
  const sig = vocabSignature(cleanItem);
  const existingIndex = items.findIndex(item => vocabSignature(item) === sig);
  const now = new Date().toISOString();
  if (existingIndex >= 0) {
    items[existingIndex] = {
      ...items[existingIndex],
      word: cleanItem.word,
      parts: cleanItem.parts,
      meanings: cleanItem.meanings,
      note: cleanItem.note,
      updatedAt: now
    };
  } else {
    items.unshift({
      id: `${owner}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      word: cleanItem.word,
      parts: cleanItem.parts,
      meanings: cleanItem.meanings,
      note: cleanItem.note,
      source: cleanItem.source || owner,
      commonId: cleanItem.commonId || '',
      createdAt: now,
      updatedAt: now
    });
  }
  await writeList(store, key, items);
  return items;
}

async function replaceItem(store, key, id, cleanItem, owner) {
  const items = await readList(store, key);
  const index = items.findIndex(item => item.id === id);
  if (index < 0) throw new Error('Không tìm thấy từ cần sửa.');
  items[index] = {
    ...items[index],
    word: cleanItem.word,
    parts: cleanItem.parts,
    meanings: cleanItem.meanings,
    note: cleanItem.note,
    source: items[index].source || owner,
    updatedAt: new Date().toISOString()
  };
  await writeList(store, key, items);
  return items;
}

async function removeItem(store, key, id) {
  const items = await readList(store, key);
  const next = items.filter(item => item.id !== id);
  await writeList(store, key, next);
  return next;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function isStudentTokenForEmail(token, email) {
  try {
    const decoded = atob(String(token || ''));
    const parts = decoded.split('|');
    return parts[0] === 'student' && String(parts[1] || '').trim().toLowerCase() === normalizeEmail(email);
  } catch (err) {
    return false;
  }
}
