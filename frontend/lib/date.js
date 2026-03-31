export function parseLocalDate(value) {
  if (!value) return null;

  const raw = String(value).slice(0, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [ano, mes, dia] = raw.split("-").map(Number);
    return new Date(ano, mes - 1, dia);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toDateInputLocal(value) {
  if (!value) return "";

  const raw = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const date = parseLocalDate(value);
  if (!date) return "";

  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

export function formatDateBR(value) {
  const date = parseLocalDate(value);
  if (!date) return "—";

  const dia = String(date.getDate()).padStart(2, "0");
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const ano = date.getFullYear();

  return `${dia}/${mes}/${ano}`;
}

export function compareLocalDates(a, b) {
  const dateA = parseLocalDate(a);
  const dateB = parseLocalDate(b);

  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;
  if (dateA > dateB) return 1;
  if (dateA < dateB) return -1;
  return 0;
}

export function compareLocalDatesAsc(a, b) {
  return compareLocalDates(a, b);
}

export function compareLocalDatesDesc(a, b) {
  return compareLocalDates(b, a);
}
