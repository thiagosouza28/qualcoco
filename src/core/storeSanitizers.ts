import type { StoreName } from '@/core/types';

const STRIPPED_FIELDS_BY_STORE: Partial<Record<StoreName, string[]>> = {
  avaliacoes: ['inicioEm', 'fimEm'],
  avaliacaoRetoques: ['dataInicio', 'dataFim'],
};

export const sanitizeStoreRecord = <T>(storeName: StoreName, record: T): T => {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const fields = STRIPPED_FIELDS_BY_STORE[storeName];
  if (!fields?.length) {
    return record;
  }

  let changed = false;
  const next = { ...(record as Record<string, unknown>) };

  fields.forEach((field) => {
    if (!(field in next)) {
      return;
    }

    delete next[field];
    changed = true;
  });

  return (changed ? next : record) as T;
};
