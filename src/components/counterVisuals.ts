type RgbColor = readonly [number, number, number];

const BASE_FEEDBACK_COLOR_STOPS = [
  { stop: 0, color: [0, 200, 83] as RgbColor },
  { stop: 1, color: [255, 235, 59] as RgbColor },
] as const;

const ALERT_RED = [255, 82, 82] as const satisfies RgbColor;

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

  if (safeProgress >= 1) {
    return ALERT_RED;
  }

  for (let index = 1; index < BASE_FEEDBACK_COLOR_STOPS.length; index += 1) {
    const previous = BASE_FEEDBACK_COLOR_STOPS[index - 1];
    const current = BASE_FEEDBACK_COLOR_STOPS[index];

    if (safeProgress <= current.stop) {
      const span = current.stop - previous.stop || 1;
      const ratio = (safeProgress - previous.stop) / span;
      return mixRgb(previous.color, current.color, ratio);
    }
  }

  return BASE_FEEDBACK_COLOR_STOPS[BASE_FEEDBACK_COLOR_STOPS.length - 1].color;
};

export const buildCounterVisualStyles = (progress: number) => {
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
        'linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.94) 100%)',
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
