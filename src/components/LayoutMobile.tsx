import { ChevronLeft } from 'lucide-react';
import { AppBottomNav } from '@/components/AppBottomNav';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils';

type LayoutMobileProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  onBack?: () => void;
  hideHeader?: boolean;
  headerVariant?: 'plain' | 'brand';
  contentClassName?: string;
  showBottomNav?: boolean;
  children: React.ReactNode;
};

export function LayoutMobile({
  title,
  subtitle,
  action,
  onBack,
  hideHeader = false,
  headerVariant = 'plain',
  contentClassName,
  showBottomNav = false,
  children,
}: LayoutMobileProps) {
  return (
    <main
      className={cn(
        'app-shell',
        hideHeader && 'app-shell--no-header',
        showBottomNav && 'app-shell--with-nav',
      )}
    >
      {!hideHeader ? (
        <header
          className={cn(
            'app-page-header',
            headerVariant === 'brand' && 'app-page-header--brand',
          )}
        >
          <div className="app-page-header__inner">
            {onBack ? (
              <Button
                type="button"
                variant={headerVariant === 'brand' ? 'secondary' : 'ghost'}
                size="icon"
                className={cn(
                  'mt-0.5 shrink-0',
                  headerVariant === 'brand' &&
                    'bg-white/12 text-white',
                )}
                onClick={onBack}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            ) : null}

            <div className="app-page-header__title-wrap">
              <h1 className="app-page-header__title">{title}</h1>
              {subtitle ? (
                <p className="app-page-header__subtitle">{subtitle}</p>
              ) : null}
            </div>

            {action ? <div className="app-page-header__action">{action}</div> : null}
          </div>
        </header>
      ) : null}

      <section className={cn('app-scroll overflow-x-hidden', contentClassName)}>
        <div className="mx-auto flex w-full min-w-0 max-w-lg flex-col gap-4 overflow-x-hidden">
          {children}
        </div>
      </section>

      {showBottomNav ? <AppBottomNav /> : null}
    </main>
  );
}
