import { BarChart3, Home, Settings, Users } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/utils';

const items = [
  {
    label: 'INÍCIO',
    to: '/dashboard',
    match: (pathname: string) => pathname === '/dashboard',
    icon: Home,
  },
  {
    label: 'RELATÓRIOS',
    to: '/relatorios',
    match: (pathname: string) => pathname.startsWith('/relatorios'),
    icon: BarChart3,
  },
  {
    label: 'EQUIPES',
    to: '/equipes',
    match: (pathname: string) => pathname.startsWith('/equipes'),
    icon: Users,
  },
  {
    label: 'AJUSTES',
    to: '/configuracoes',
    match: (pathname: string) => pathname.startsWith('/configuracoes'),
    icon: Settings,
  },
];

export function AppBottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="app-bottom-nav" aria-label="Navegação principal">
      <div className="app-bottom-nav__grid">
        {items.map((item) => {
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
