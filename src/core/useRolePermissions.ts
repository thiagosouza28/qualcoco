import { useQuery } from '@tanstack/react-query';
import { obterConfiguracaoAtual } from '@/core/appConfig';
import {
  listarPermissoesLiberadas,
  obterPermissoesPerfil,
  normalizePermissoesPerfisConfig,
} from '@/core/permissions';
import type { Configuracao } from '@/core/types';

export const useConfiguracaoAtual = () =>
  useQuery({
    queryKey: ['configuracoes', 'atual'],
    queryFn: obterConfiguracaoAtual,
    staleTime: 30_000,
  });

export const useRolePermissions = (perfil?: string | null) => {
  const query = useConfiguracaoAtual();
  const config = (query.data as Configuracao | undefined) || null;
  const permissionMatrix = normalizePermissoesPerfisConfig(
    config?.permissoesPerfis || null,
  );
  const permissions = obterPermissoesPerfil(perfil, permissionMatrix);
  const grantedPermissions = listarPermissoesLiberadas(perfil, permissionMatrix);

  return {
    ...query,
    config,
    permissionMatrix,
    permissions,
    grantedPermissions,
  };
};
