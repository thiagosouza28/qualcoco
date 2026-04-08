import {
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_ATTEMPTS,
  STORAGE_KEYS,
} from '@/core/constants';
import { formatDateTimeLabel, minutesAgo, nowIso } from '@/core/date';
import { getOrCreateDevice } from '@/core/device';
import { createEntity, repository, saveEntity } from '@/core/repositories';
import {
  getCloudSessionSafe,
  signInCloudColaborador,
  signOutCloudSession,
} from '@/core/firebaseCloud';
import { compararPin, gerarHashPin, validarPin } from '@/core/security';
import type { Colaborador, SessaoCampo } from '@/core/types';

const normalizeIdentifier = (value: string) => value.trim().toLowerCase();

const persistSession = (session: SessaoCampo) => {
  window.localStorage.setItem(STORAGE_KEYS.sessao, JSON.stringify(session));
};

export const getSessaoAtiva = () => {
  const raw = window.localStorage.getItem(STORAGE_KEYS.sessao);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SessaoCampo;
    if (!parsed?.colaboradorId) {
      window.localStorage.removeItem(STORAGE_KEYS.sessao);
      return null;
    }
    return parsed;
  } catch (_error) {
    window.localStorage.removeItem(STORAGE_KEYS.sessao);
    return null;
  }
};

export const touchSessao = () => {
  const session = getSessaoAtiva();
  if (!session) return null;

  const next = { ...session, ultimoAcessoEm: nowIso() };
  persistSession(next);
  return next;
};

export const logoutSessao = () => {
  window.localStorage.removeItem(STORAGE_KEYS.sessao);
};

export const encerrarSessaoCloud = async () => {
  await signOutCloudSession();
};

const salvarUltimoUsuario = (identifier: string) => {
  window.localStorage.setItem(STORAGE_KEYS.ultimoUsuario, identifier);
};

export const getUltimoUsuario = () =>
  window.localStorage.getItem(STORAGE_KEYS.ultimoUsuario) || '';

const registrarTentativa = async (
  colaboradorId: string | null,
  identificadorInformado: string,
  sucesso: boolean,
  motivo: string,
) => {
  const device = await getOrCreateDevice();
  return createEntity('tentativasLogin', device.id, {
    colaboradorId,
    identificadorInformado,
    sucesso,
    motivo,
    dispositivoId: device.id,
  });
};

export const listarColaboradoresAtivos = async () => {
  const colaboradores = await repository.list('colaboradores');
  return colaboradores
    .filter((item) => item.ativo && !item.deletadoEm)
    .sort((a, b) => a.nome.localeCompare(b.nome));
};

export const buscarColaboradorPorLogin = async (identifier: string) => {
  const normalized = normalizeIdentifier(identifier);
  const colaboradores = await listarColaboradoresAtivos();
  return (
    colaboradores.find(
      (item) => normalizeIdentifier(item.matricula) === normalized,
    ) ||
    colaboradores.find(
      (item) => normalizeIdentifier(item.primeiroNome) === normalized,
    ) ||
    null
  );
};

export const contarTentativasFalhasRecentes = async (identifier: string) => {
  const normalized = normalizeIdentifier(identifier);
  const threshold = minutesAgo(LOGIN_LOCK_MINUTES);
  const attempts = await repository.filter(
    'tentativasLogin',
    (item) =>
      normalizeIdentifier(item.identificadorInformado) === normalized &&
      !item.sucesso &&
      item.criadoEm >= threshold,
  );
  return attempts.length;
};

export const colaboradorBloqueado = async (identifier: string) =>
  (await contarTentativasFalhasRecentes(identifier)) >= LOGIN_MAX_ATTEMPTS;

export const cadastrarColaborador = async (input: {
  nome: string;
  primeiroNome: string;
  matricula: string;
  pin: string;
  ativo?: boolean;
}) => {
  if (!validarPin(input.pin)) {
    throw new Error('O PIN precisa ter 4 ou 6 dígitos numéricos.');
  }

  const existing = await repository.filter(
    'colaboradores',
    (item) =>
      item.matricula.trim().toLowerCase() ===
      input.matricula.trim().toLowerCase(),
  );

  if (existing.length > 0) {
    throw new Error('Já existe colaborador com essa matrícula.');
  }

  const device = await getOrCreateDevice();
  const { hash, salt } = await gerarHashPin(input.pin);
  return createEntity('colaboradores', device.id, {
    nome: input.nome.trim(),
    primeiroNome: input.primeiroNome.trim(),
    matricula: input.matricula.trim(),
    pinHash: hash,
    pinSalt: salt,
    ativo: input.ativo ?? true,
    perfil: 'colaborador',
  });
};

export const atualizarColaborador = async (
  colaborador: Colaborador,
  input: {
    nome: string;
    primeiroNome: string;
    matricula: string;
    ativo: boolean;
    pin?: string;
  },
) => {
  let next: Colaborador = {
    ...colaborador,
    nome: input.nome.trim(),
    primeiroNome: input.primeiroNome.trim(),
    matricula: input.matricula.trim(),
    ativo: input.ativo,
    perfil: colaborador.perfil || 'colaborador',
  };

  if (input.pin) {
    if (!validarPin(input.pin)) {
      throw new Error('O PIN precisa ter 4 ou 6 dígitos numéricos.');
    }

    const { hash, salt } = await gerarHashPin(input.pin);
    next = {
      ...next,
      pinHash: hash,
      pinSalt: salt,
    };
  }

  await saveEntity('colaboradores', {
    ...next,
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: next.versao + 1,
  });

  return next;
};

export const atualizarPerfilColaborador = async (
  colaborador: Colaborador,
  input: {
    nome: string;
    primeiroNome: string;
    pin?: string;
  },
) =>
  atualizarColaborador(colaborador, {
    nome: input.nome,
    primeiroNome: input.primeiroNome,
    matricula: colaborador.matricula,
    ativo: colaborador.ativo,
    pin: input.pin,
  });

export const garantirSessaoCloudColaborador = async (
  colaborador: Colaborador,
  pin: string,
) => {
  const currentSession = await getCloudSessionSafe('colaborador');
  if (currentSession?.user?.colaboradorId === colaborador.id) {
    return currentSession.user.id;
  }

  const device = await getOrCreateDevice();
  const cloudSession = await signInCloudColaborador(colaborador, pin, device);
  const authUserId = cloudSession.user?.id || null;

  if (authUserId && colaborador.authUserId !== authUserId) {
    await saveEntity('colaboradores', {
      ...colaborador,
      authUserId,
      atualizadoEm: nowIso(),
      syncStatus: 'pending_sync',
      versao: colaborador.versao + 1,
    });
  }

  return authUserId;
};

export const autenticarColaborador = async (
  identifier: string,
  pin: string,
) => {
  const cleanIdentifier = identifier.trim();
  if (!cleanIdentifier) {
    throw new Error('Informe sua matr\u00edcula.');
  }

  if (!validarPin(pin)) {
    await registrarTentativa(null, cleanIdentifier, false, 'PIN inválido');
    throw new Error('PIN inv\u00e1lido. Use 4 ou 6 d\u00edgitos num\u00e9ricos.');
  }

  if (await colaboradorBloqueado(cleanIdentifier)) {
    await registrarTentativa(
      null,
      cleanIdentifier,
      false,
      'Usuário bloqueado por tentativas',
    );
    throw new Error(
      `Acesso bloqueado temporariamente. Tente novamente em ${LOGIN_LOCK_MINUTES} minutos.`,
    );
  }

  const colaborador = await buscarColaboradorPorLogin(cleanIdentifier);
  if (!colaborador) {
    await registrarTentativa(
      null,
      cleanIdentifier,
      false,
      'Usuário não encontrado',
    );
    throw new Error('Usu\u00e1rio n\u00e3o encontrado neste aparelho.');
  }

  const pinCorreto = await compararPin(
    pin,
    colaborador.pinSalt,
    colaborador.pinHash,
  );
  if (!pinCorreto) {
    await registrarTentativa(
      colaborador.id,
      cleanIdentifier,
      false,
      'PIN incorreto',
    );
    const falhas = await contarTentativasFalhasRecentes(cleanIdentifier);
    throw new Error(
      falhas + 1 >= LOGIN_MAX_ATTEMPTS
        ? `PIN incorreto. Usuário bloqueado até ${formatDateTimeLabel(
            minutesAgo(-LOGIN_LOCK_MINUTES),
          )}.`
        : 'PIN incorreto. Confira e tente novamente.',
    );
  }

  await registrarTentativa(
    colaborador.id,
    cleanIdentifier,
    true,
    'Login offline realizado',
  );

  const session: SessaoCampo = {
    colaboradorId: colaborador.id,
    iniciadoEm: nowIso(),
    ultimoAcessoEm: nowIso(),
  };

  persistSession(session);
  salvarUltimoUsuario(cleanIdentifier);

  return {
    colaborador,
    session,
  };
};
