import { BarChart3, Home, Settings, Users } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useCampoApp } from '@/core/AppProvider';
import { canManageTeams } from '@/core/permissions';
import { useRolePermissions } from '@/core/useRolePermissions';
import { cn } from '@/utils';

const items = [
  {
    label: 'INICIO',
    to: '/dashboard',
    match: (pathname: string) => pathname === '/dashboard',
    icon: Home,
  },
  {
    label: 'RELATORIOS',
    to: '/relatorios',
    match: (pathname: string) => pathname.startsWith('/relatorios'),
    icon: BarChart3,
    permissionKey: 'verRelatorios',
  },
  {
    label: 'EQUIPES',
    to: '/equipes',
    match: (pathname: string) => pathname.startsWith('/equipes'),
    icon: Users,
    adminOnly: true,
  },
  {
    label: 'AJUSTES',
    to: '/configuracoes',
    match: (pathname: string) => pathname.startsWith('/configuracoes'),
    icon: Settings,
  },
] as const;

export function AppBottomNav() {
  const { pathname } = useLocation();
  const { usuarioAtual } = useCampoApp();
  const { permissions } = useRolePermissions(usuarioAtual?.perfil);
  const visibleItems = items.filter((item) => {
    if (item.adminOnly) {
      return canManageTeams(usuarioAtual?.perfil);
    }

    if (!item.permissionKey) {
      return true;
    }

    return permissions[item.permissionKey];
  });
  const compactClass =
    visibleItems.length <= 3 ? 'app-bottom-nav__grid--compact' : null;

  return (
    <nav className="app-bottom-nav" aria-label="Navegacao principal">
      <div className={cn('app-bottom-nav__grid', compactClass)}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);

          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn('app-bottom-nav__item', active && 'is-active')}
            >
              <span className="app-bottom-nav__icon">
                <Icon className="h-5 w-5" />
              </span>
              <span className="app-bottom-nav__label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
