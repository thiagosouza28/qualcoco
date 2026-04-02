import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils';

function PageHeader({
  title,
  subtitle,
  onBack,
  rightContent,
  className,
  inverted = false,
}) {
  return (
    <header
      className={cn(
        'safe-page-header sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur',
        inverted && 'border-emerald-800 bg-emerald-900 text-white',
        className,
      )}
    >
      <div className="mx-auto flex max-w-lg items-start gap-3">
        {onBack ? (
          <Button
            type="button"
            size="icon"
            variant={inverted ? 'secondary' : 'ghost'}
            className={cn(
              'shrink-0',
              inverted && 'bg-white/10 text-white',
            )}
            onClick={onBack}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              'font-display text-lg font-bold text-slate-800',
              inverted && 'text-white',
            )}
          >
            {title}
          </h1>
          {subtitle ? (
            <p className={cn('mt-1 text-xs text-slate-500', inverted && 'text-emerald-100')}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {rightContent}
      </div>
    </header>
  );
}

export default PageHeader;
