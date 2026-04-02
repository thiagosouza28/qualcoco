const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]';

const toSnake = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([a-zA-Z])(\d)/g, '$1_$2')
    .replace(/(\d)([a-zA-Z])/g, '$1_$2')
    .toLowerCase();

const toCamel = (value: string) =>
  value.replace(/_([a-z0-9])/g, (_, part: string) =>
    /\d/.test(part) ? part : part.toUpperCase(),
  );

export const snakeifyKeys = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => snakeifyKeys(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.entries(value).reduce((acc, [key, item]) => {
    acc[toSnake(key)] = snakeifyKeys(item);
    return acc;
  }, {} as Record<string, unknown>) as T;
};

export const camelizeKeys = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => camelizeKeys(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.entries(value).reduce((acc, [key, item]) => {
    acc[toCamel(key)] = camelizeKeys(item);
    return acc;
  }, {} as Record<string, unknown>) as T;
};
