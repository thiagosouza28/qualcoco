const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (value: number) => String(value).padStart(2, '0');

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const parseDateValue = (value?: string | null) => {
  if (!value) return null;

  if (DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const nowIso = () => new Date().toISOString();

export const todayIso = () => toLocalDateKey(new Date());

export const normalizeDateKey = (value?: string | null) => {
  if (!value) return '';
  if (DATE_ONLY_PATTERN.test(value)) return value;

  const parsed = parseDateValue(value);
  return parsed ? toLocalDateKey(parsed) : '';
};

export const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

export const isAfter = (left?: string | null, right?: string | null) => {
  if (!left) return false;
  if (!right) return true;
  return new Date(left).getTime() > new Date(right).getTime();
};

export const formatDateLabel = (value?: string | null) => {
  const date = parseDateValue(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const formatDateTimeLabel = (value?: string | null) => {
  const date = parseDateValue(value);
  if (!date) return '-';

  const data = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);

  if (value && DATE_ONLY_PATTERN.test(value)) {
    return data;
  }

  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  return `${data} ${hora}`;
};
