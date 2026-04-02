// ==========================
// HOJE (PADRÃO LOCAL)
// ==========================

export function today() {
  const now = new Date();

  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);

  return local.toISOString().slice(0, 10);
}

export function todayLocal() {
  return today();
}
