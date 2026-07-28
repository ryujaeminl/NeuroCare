import { MOOD_LABELS, type Mood } from "@/lib/db/types";

export interface MoodPoint {
  date: string;
  mood: Mood;
}

interface MoodChartProps {
  points: MoodPoint[];
}

/**
 * 기분 추이 라인 차트. 차트 라이브러리를 새로 들이지 않고 인라인 SVG로 그린다
 * (components/ProgressRing.tsx도 같은 방식이라 의존성과 스타일을 맞춘다).
 */

/** 세로축 위치. 위로 갈수록 긍정적이다. */
const MOOD_LEVEL: Record<Mood, number> = {
  positive: 4,
  neutral: 3,
  confused: 2,
  anxious: 1,
  sad: 0,
};

const WIDTH = 640;
const HEIGHT = 180;
const PADDING = { top: 16, right: 16, bottom: 28, left: 76 };

export function MoodChart({ points }: MoodChartProps) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        아직 분석된 기분 기록이 없습니다. 대화를 나누면 여기에 추이가 표시됩니다.
      </p>
    );
  }

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const maxLevel = 4;

  const toX = (index: number) =>
    PADDING.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const toY = (mood: Mood) => PADDING.top + (1 - MOOD_LEVEL[mood] / maxLevel) * plotHeight;

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(index)} ${toY(point.mood)}`)
    .join(" ");

  const orderedMoods = (Object.keys(MOOD_LEVEL) as Mood[]).sort(
    (a, b) => MOOD_LEVEL[b] - MOOD_LEVEL[a],
  );

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="min-w-[480px] w-full"
        role="img"
        aria-label="기분 추이 차트"
      >
        {orderedMoods.map((mood) => {
          const y = toY(mood);
          return (
            <g key={mood}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={WIDTH - PADDING.right}
                y2={y}
                stroke="currentColor"
                className="text-surface-border"
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 10}
                y={y}
                dy="0.35em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px]"
              >
                {MOOD_LABELS[mood].label}
              </text>
            </g>
          );
        })}

        <path d={linePath} fill="none" stroke="currentColor" className="text-accent" strokeWidth={2} />

        {points.map((point, index) => (
          <circle
            key={`${point.date}-${index}`}
            cx={toX(index)}
            cy={toY(point.mood)}
            r={4}
            className="fill-accent"
          >
            <title>{`${point.date} · ${MOOD_LABELS[point.mood].label}`}</title>
          </circle>
        ))}

        {points.map((point, index) =>
          index === 0 || index === points.length - 1 ? (
            <text
              key={`label-${index}`}
              x={toX(index)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {point.date.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
