import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const readEnvFile = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const entries = {};

  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        return;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      entries[key] = value;
    });

  return entries;
};

const envPath = path.join(rootDir, '.env');
const env = {
  ...readEnvFile(envPath),
  ...process.env,
};

const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_PROJECT_ID',
];

for (const key of requiredKeys) {
  if (!String(env[key] || '').trim()) {
    throw new Error(`Variavel obrigatoria ausente em .env: ${key}`);
  }
}

const apiKey = String(env.VITE_FIREBASE_API_KEY).trim();
const projectId = String(env.VITE_FIREBASE_PROJECT_ID).trim();
const nowIso = new Date().toISOString();

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const parcelas = [];

for (const letter of letters) {
  for (let tens = 10; tens <= 18; tens += 1) {
    for (let unit = 1; unit <= 4; unit += 1) {
      const codigo = `${letter}-${tens}${unit}`;
      const id = `parcela_${letter.toLowerCase()}_${tens}${unit}`;

      parcelas.push({
        id,
        local_id: `seed:${id}`,
        codigo,
        descricao: `Parcela ${codigo}`,
        ativo: true,
        criado_em: nowIso,
        atualizado_em: nowIso,
        deletado_em: null,
        sync_status: 'synced',
        versao: 1,
        origem_dispositivo_id: 'firebase_seed',
      });
    }
  }
}

const configuracaoPadrao = {
  id: 'default',
  local_id: 'config:default',
  limite_cocos_chao: 19,
  limite_cachos_3_cocos: 19,
  criado_em: nowIso,
  atualizado_em: nowIso,
  deletado_em: null,
  sync_status: 'synced',
  versao: 1,
  origem_dispositivo_id: 'firebase_seed',
};

const toFirestoreValue = (value) => {
  if (value === null) {
    return { nullValue: null };
  }

  if (typeof value === 'string') {
    return { stringValue: value };
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }

    return { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    };
  }

  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)]),
        ),
      },
    };
  }

  throw new Error(`Tipo nao suportado no Firestore: ${typeof value}`);
};

const toFirestoreFields = (record) =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, toFirestoreValue(value)]),
  );

const getAnonymousSession = async () => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        returnSecureToken: true,
      }),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    const message =
      payload?.error?.message || payload?.error_description || response.statusText;
    throw new Error(`Falha ao autenticar anonimamente no Firebase: ${message}`);
  }

  if (!payload.idToken) {
    throw new Error('Firebase nao retornou idToken para a sessao anonima.');
  }

  return payload.idToken;
};

const commitWrites = async (idToken, writes) => {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    const message =
      payload?.error?.message || payload?.error_description || response.statusText;
    throw new Error(`Falha ao gravar documentos no Firestore: ${message}`);
  }

  return payload;
};

const buildWrite = (collection, record) => ({
  update: {
    name: `projects/${projectId}/databases/(default)/documents/${collection}/${record.id}`,
    fields: toFirestoreFields(record),
  },
});

const chunk = (items, size) => {
  const groups = [];

  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }

  return groups;
};

const run = async () => {
  const idToken = await getAnonymousSession();
  const configWrites = [buildWrite('configuracoes', configuracaoPadrao)];
  await commitWrites(idToken, configWrites);

  const parcelaWrites = parcelas.map((item) => buildWrite('parcelas', item));
  const groups = chunk(parcelaWrites, 400);

  for (let index = 0; index < groups.length; index += 1) {
    await commitWrites(idToken, groups[index]);
    console.log(
      `Lote ${index + 1}/${groups.length} enviado para Firestore (${groups[index].length} parcela(s)).`,
    );
  }

  console.log(
    JSON.stringify(
      {
        projectId,
        configuracoes: 1,
        parcelas: parcelas.length,
      },
      null,
      2,
    ),
  );
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
