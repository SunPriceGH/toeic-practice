function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function parseAllowedEmails(value) {
  return String(value || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();

    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    const studentPassword = env.STUDENT_PASSWORD || 'toeic123';
    const adminPassword = env.ADMIN_PASSWORD || 'admin123';
    const allowedEmails = parseAllowedEmails(env.ALLOWED_STUDENT_EMAILS || '');

    if (!email || !email.includes('@')) {
      return json({ ok: false, error: 'Email không hợp lệ.' }, 400);
    }

    // Admin login is allowed for teacher/admin tools if needed.
    if (password === adminPassword) {
      return json({
        ok: true,
        role: 'admin',
        email,
        token: btoa(`admin|${email}|${Date.now()}`)
      });
    }

    if (password !== studentPassword) {
      return json({ ok: false, error: 'Sai mật khẩu.' }, 401);
    }

    // If ALLOWED_STUDENT_EMAILS is set, only emails in that list can enter.
    // If it is empty, every valid email can enter with the student password.
    if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
      return json({
        ok: false,
        error: 'Email này chưa được cấp quyền vào bài.'
      }, 403);
    }

    return json({
      ok: true,
      role: 'student',
      email,
      token: btoa(`student|${email}|${Date.now()}`)
    });
  } catch (err) {
    return json({
      ok: false,
      error: 'Không xử lý được đăng nhập.'
    }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
