'use client';

import { useEffect, useRef, useMemo } from 'react';

interface PriceChartProps {
  symbol: string;
  timeframe: string;
}

/**
 * Interactive price chart component.
 * In production: uses TradingView Lightweight Charts library.
 * This implementation renders a responsive SVG line chart as a placeholder
 * that demonstrates the layout and interaction patterns.
 */
export function PriceChart({ symbol, timeframe }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate mock price data based on timeframe
  const data = useMemo(() => generateMockData(timeframe), [timeframe]);

  const { minPrice, maxPrice, priceRange } = useMemo(() => {
    const prices = data.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { minPrice: min, maxPrice: max, priceRange: max - min };
  }, [data]);

  const isPositive = data.length > 1 && data[data.length - 1].price >= data[0].price;
  const strokeColor = isPositive ? '#10B981' : '#EF4444';
  const fillColor = isPositive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';

  // Build SVG path
  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW;
    const y = padding.top + (1 - (d.price - minPrice) / priceRange) * chartH;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`;

  // Y-axis labels
  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const value = minPrice + (priceRange * i) / 4;
    const y = padding.top + (1 - i / 4) * chartH;
    return { value: `$${value.toFixed(2)}`, y };
  });

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {yLabels.map((label, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              y1={label.y}
              x2={width - padding.right}
              y2={label.y}
              stroke="currentColor"
              strokeOpacity={0.07}
              strokeDasharray="4 4"
            />
            <text x={padding.left - 8} y={label.y + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {label.value}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={fillColor} />

        {/* Price line */}
        <path d={linePath} fill="none" stroke={strokeColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Current price dot */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r={4}
            fill={strokeColor}
            stroke="white"
            strokeWidth={2}
          />
        )}
      </svg>

      {/* Chart type indicator */}
      <div className="absolute bottom-2 right-2 rounded bg-muted/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
        {symbol} · {timeframe} · Line Chart
      </div>
    </div>
  );
}

function generateMockData(timeframe: string): Array<{ date: string; price: number }> {
  const pointCount: Record<string, number> = {
    '1D': 78, '1W': 35, '1M': 22, '3M': 65, '6M': 130, '1Y': 252, '5Y': 1260, 'MAX': 2520,
  };
  const count = pointCount[timeframe] ?? 252;
  const data: Array<{ date: string; price: number }> = [];

  let price = 170 + Math.random() * 20; // Starting price
  const volatility = timeframe === '1D' ? 0.002 : 0.015;
  const drift = 0.0003; // Slight upward bias

  for (let i = 0; i < count; i++) {
    price *= 1 + drift + (Math.random() - 0.48) * volatility;
    price = Math.max(price, 50); // Floor
    const date = new Date();
    date.setDate(date.getDate() - (count - i));
    data.push({ date: date.toISOString().split('T')[0], price });
  }

  return data;
}
