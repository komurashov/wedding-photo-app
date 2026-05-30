// Проверка пароля админа. Пароль задаётся переменной ADMIN_PASSWORD.
// Сравнение в постоянное время, чтобы не подбирали по таймингу.
export function checkAdminPassword(provided) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return false; // пароль не задан -> админка закрыта
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
