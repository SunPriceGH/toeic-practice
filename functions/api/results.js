export async function onRequestPost(context) {
  try {
    if (!context.env.STUDENT_RESULTS) return json({ ok:false, error:'Thiếu KV binding STUDENT_RESULTS.' }, 500);
    const payload = await context.request.json();
    const email = String(payload?.student?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return json({ ok:false, error:'Thiếu email học viên.' }, 400);
    const safeEmail = email.replace(/[^a-z0-9._-]/gi, '_');
    const id = `${Date.now()}_${safeEmail}`;
    const filename = `student_result/${id}.json`;
    const record = {
      id,
      filename,
      email,
      submittedAt: payload.submittedAt || new Date().toISOString(),
      score: Number(payload.score || 0),
      total: Number(payload.total || 0),
      percent: Number(payload.percent || 0),
      payload
    };
    await context.env.STUDENT_RESULTS.put(id, JSON.stringify(record), {
      metadata: { email, submittedAt: record.submittedAt, score: String(record.score), total: String(record.total), percent: String(record.percent), filename }
    });
    return json({ ok:true, id, filename });
  } catch (err) {
    return json({ ok:false, error: err.message || 'Không lưu được kết quả.' }, 500);
  }
}

export async function onRequestGet(context) {
  try {
    if (!context.env.STUDENT_RESULTS) return json({ ok:false, error:'Thiếu KV binding STUDENT_RESULTS.' }, 500);
    const adminPassword = context.request.headers.get('x-admin-password') || '';
    const expected = context.env.ADMIN_PASSWORD || 'admin123';
    if (adminPassword !== expected) return json({ ok:false, error:'Sai mật khẩu giáo viên.' }, 401);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id');
    if (id) {
      const text = await context.env.STUDENT_RESULTS.get(id);
      if (!text) return json({ ok:false, error:'Không tìm thấy kết quả.' }, 404);
      return json({ ok:true, result: JSON.parse(text) });
    }
    const list = await context.env.STUDENT_RESULTS.list({ limit: 1000 });
    const results = [];
    for (const key of list.keys.sort((a,b)=>String(b.name).localeCompare(String(a.name)))) {
      const text = await context.env.STUDENT_RESULTS.get(key.name);
      if (text) results.push(JSON.parse(text));
    }
    return json({ ok:true, results });
  } catch (err) {
    return json({ ok:false, error: err.message || 'Không tải được kết quả.' }, 500);
  }
}


export async function onRequestDelete(context) {
  try {
    if (!context.env.STUDENT_RESULTS) return json({ ok:false, error:'Thiếu KV binding STUDENT_RESULTS.' }, 500);
    const adminPassword = context.request.headers.get('x-admin-password') || '';
    const expected = context.env.ADMIN_PASSWORD || 'admin123';
    if (adminPassword !== expected) return json({ ok:false, error:'Sai mật khẩu giáo viên.' }, 401);

    const url = new URL(context.request.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ ok:false, error:'Thiếu ID record cần xóa.' }, 400);

    const existing = await context.env.STUDENT_RESULTS.get(id);
    if (!existing) return json({ ok:false, error:'Không tìm thấy record cần xóa.' }, 404);

    await context.env.STUDENT_RESULTS.delete(id);
    return json({ ok:true, deletedId:id });
  } catch (err) {
    return json({ ok:false, error: err.message || 'Không xóa được kết quả.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type':'application/json; charset=utf-8' } });
}
