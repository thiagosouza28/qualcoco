import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils';

const tones = {
  amber: 'from-[#fbf5e8] to-white text-[#7f6b2b] ring-[#eadfbe]',
  emerald:
    'from-[rgba(210,231,211,0.9)] to-white text-[var(--qc-primary)] ring-[var(--qc-border-strong)]',
  slate:
    'from-[rgba(93,98,78,0.08)] to-white text-[var(--qc-secondary)] ring-[rgba(93,98,78,0.12)]',
};

const feedbackTones = {
  low: 'from-[rgba(31,97,164,0.14)] to-white text-[#1f61a4] ring-[rgba(31,97,164,0.24)]',
  medium:
    'from-[rgba(236,181,43,0.2)] to-white text-[#8a6a08] ring-[rgba(236,181,43,0.34)]',
  high: 'from-[rgba(197,58,53,0.18)] to-white text-[var(--qc-danger)] ring-[rgba(197,58,53,0.32)]',
};

const feedbackButtonTones = {
  low: 'bg-[#1f61a4]',
  medium: 'bg-[#8a6a08]',
  high: 'bg-[var(--qc-danger)]',
};

type RgbColor = readonly [number, number, number];

const FEEDBACK_COLOR_STOPS = [
  { stop: 0, color: [0, 200, 83] as RgbColor },
  { stop: 0.58, color: [255, 235, 59] as RgbColor },
  { stop: 1, color: [255, 82, 82] as RgbColor },
] as const;

const clampProgress = (value: number) => Math.max(0, Math.min(value, 1));

const mixRgb = (from: RgbColor, to: RgbColor, ratio: number): RgbColor => {
  const safeRatio = clampProgress(ratio);
  return [
    Math.round(from[0] + (to[0] - from[0]) * safeRatio),
    Math.round(from[1] + (to[1] - from[1]) * safeRatio),
    Math.round(from[2] + (to[2] - from[2]) * safeRatio),
  ];
};

const formatRgb = (color: RgbColor, alpha?: number) =>
  typeof alpha === 'number'
    ? `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`
    : `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const interpolateFeedbackColor = (progress: number): RgbColor => {
  const safeProgress = clampProgress(progress);

  for (let index = 1; index < FEEDBACK_COLOR_STOPS.length; index += 1) {
    const previous = FEEDBACK_COLOR_STOPS[index - 1];
    const current = FEEDBACK_COLOR_STOPS[index];

    if (safeProgress <= current.stop) {
      const span = current.stop - previous.stop || 1;
      const ratio = (safeProgress - previous.stop) / span;
      return mixRgb(previous.color, current.color, ratio);
    }
  }

  return FEEDBACK_COLOR_STOPS[FEEDBACK_COLOR_STOPS.length - 1].color;
};

const buildDynamicCounterStyles = (progress: number) => {
  const accent = interpolateFeedbackColor(progress);
  const cardBase = mixRgb(accent, [255, 255, 255], 0.78);
  const cardBorder = mixRgb(accent, [255, 255, 255], 0.46);
  const minusBase = mixRgb(accent, [255, 255, 255], 0.86);
  const minusBorder = mixRgb(accent, [255, 255, 255], 0.52);
  const emphasis = mixRgb(accent, [35, 38, 29], 0.38);

  return {
    cardStyle: {
      backgroundColor: formatRgb(cardBase),
      backgroundImage:
        'linear-gradient(135deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.9) 100%)',
      borderColor: formatRgb(cardBorder),
      boxShadow: `0 16px 28px -24px ${formatRgb(accent, 0.42)}`,
    },
    minusStyle: {
      backgroundColor: formatRgb(minusBase),
      backgroundImage:
        'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.58) 100%)',
      borderColor: formatRgb(minusBorder),
      color: formatRgb(emphasis),
      boxShadow: `0 12px 20px -20px ${formatRgb(accent, 0.34)}`,
    },
    plusStyle: {
      backgroundColor: formatRgb(accent),
      backgroundImage:
        'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0.1) 100%)',
      boxShadow: `0 14px 22px -18px ${formatRgb(accent, 0.48)}`,
    },
    valueStyle: {
      color: formatRgb(emphasis),
    },
  };
};

interface CounterInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onInteract?: () => void;
  color?: 'amber' | 'emerald' | 'slate';
  min?: number;
  max?: number;
  compact?: boolean;
  centerLabel?: boolean;
  padWithZero?: boolean;
  disabled?: boolean;
  displayOverride?: string | null;
  feedback?: 'low' | 'medium' | 'high' | null;
  visualProgress?: number | null;
}

export function CounterInput({
  label,
  value,
  onChange,
  onInteract,
  color = 'slate',
  min = 0,
  max = 999,
  compact = false,
  centerLabel = false,
  padWithZero = false,
  disabled = false,
  displayOverride = null,
  feedback = null,
  visualProgress = null,
}: CounterInputProps) {
  const [inputValue, setInputValue] = useState(value.toString());
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const setValue = (next: number) => {
    onInteract?.();
    const val = Math.max(min, Math.min(max, next));
    onChange(val);
    setInputValue(val.toString());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onInteract?.();
    const raw = e.target.value.replace(/\D/g, '');
    setInputValue(raw);
    if (raw !== '') {
      const num = parseInt(raw, 10);
      onChange(Math.max(min, Math.min(max, num)));
    } else {
      onChange(min);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    setInputValue(value.toString());
  };

  const displayValue =
    displayOverride && !isEditing
      ? displayOverride
      : padWithZero && !isEditing
        ? String(Math.max(min, Math.min(max, Number(value) || 0))).padStart(2, '0')
        : inputValue;
  const dynamicStyles =
    typeof visualProgress === 'number'
      ? buildDynamicCounterStyles(visualProgress)
      : null;
  const activeTone = dynamicStyles
    ? 'text-[var(--qc-text)] ring-[var(--qc-border)]'
    : feedback
      ? feedbackTones[feedback]
      : tones[color];
  const actionTone = dynamicStyles
    ? ''
    : feedback
      ? feedbackButtonTones[feedback]
      : color === 'amber'
        ? 'bg-[#7f6b2b]'
        : color === 'slate'
          ? 'bg-[var(--qc-secondary)]'
          : 'bg-[var(--qc-primary)]';

  return (
    <Card
      className={cn(
        'w-full min-w-0 max-w-full overflow-hidden border-none shadow-sm',
        compact ? 'rounded-[20px]' : 'rounded-[22px]',
      )}
      onPointerDown={onInteract}
    >
      <CardContent
        className={cn(
          'min-w-0 bg-gradient-to-br ring-1 ring-inset transition-[background-color,border-color,box-shadow,color] duration-300 ease-out',
          activeTone,
          compact ? 'p-3' : 'p-4',
        )}
        style={dynamicStyles?.cardStyle}
      >
        <p
          className={cn(
            'break-words text-sm font-bold tracking-tight text-[var(--qc-text)]',
            centerLabel && 'text-center',
          )}
        >
          {label}
        </p>
        <div
          className={cn(
            'min-w-0 flex items-center justify-between',
            compact ? 'mt-2 gap-2' : 'mt-4 gap-3',
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'shrink-0 rounded-2xl border border-[var(--qc-border)] bg-white text-[var(--qc-secondary)] shadow-sm transition-[background-color,border-color,color,box-shadow] duration-300 ease-out',
              compact ? 'h-10 w-10 rounded-[12px]' : 'h-12 w-12 rounded-[16px]',
            )}
            disabled={disabled}
            onClick={() => setValue((Number(value) || 0) - 1)}
            style={dynamicStyles?.minusStyle}
          >
            <Minus className={cn('stroke-[3]', compact ? 'h-5 w-5' : 'h-6 w-6')} />
          </Button>

          <input
            type="text"
            inputMode="numeric"
            data-counter-input="true"
            className={cn(
              'min-w-0 flex-1 border-none bg-transparent p-0 text-center font-black leading-none tracking-[-0.04em] tabular-nums text-[var(--qc-text)] transition-colors duration-300 focus:ring-0',
              !dynamicStyles && feedback === 'low' && 'text-[#1f61a4]',
              !dynamicStyles && feedback === 'medium' && 'text-[#8a6a08]',
              !dynamicStyles && feedback === 'high' && 'text-[var(--qc-danger)]',
              compact ? 'text-[1.95rem]' : 'text-[3.5rem]',
            )}
            value={displayValue}
            disabled={disabled}
            onChange={handleInputChange}
            onFocus={() => {
              onInteract?.();
              setIsEditing(true);
            }}
            onBlur={handleBlur}
            style={dynamicStyles?.valueStyle}
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'shrink-0 rounded-2xl border-none text-white shadow-sm transition-[background-color,border-color,box-shadow] duration-300 ease-out',
              compact ? 'h-10 w-10 rounded-[12px]' : 'h-12 w-12 rounded-[16px]',
              actionTone,
            )}
            disabled={disabled}
            onClick={() => setValue((Number(value) || 0) + 1)}
            style={dynamicStyles?.plusStyle}
          >
            <Plus className={cn('stroke-[3]', compact ? 'h-5 w-5' : 'h-6 w-6')} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
