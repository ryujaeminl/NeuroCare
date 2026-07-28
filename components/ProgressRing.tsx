interface ProgressRingProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
}

export function ProgressRing({ percent, size = 72, strokeWidth = 8 }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={center}
        cy={center}
        r={radius}
        stroke="currentColor"
        className="text-surface-border"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        stroke="currentColor"
        className="text-accent"
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text
        x="50%"
        y="50%"
        dy="0.35em"
        textAnchor="middle"
        className="fill-foreground text-sm font-semibold"
      >
        {percent}%
      </text>
    </svg>
  );
}
