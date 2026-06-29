export function getAdminPassword(env) {
  return env.ADMIN_PASSWORD || 'admin123';
}

export function isAdminPassword(env, password) {
  return String(password || '') === getAdminPassword(env);
}
