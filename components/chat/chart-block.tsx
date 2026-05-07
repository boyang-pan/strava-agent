"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTheme } from "next-themes";
import type { ChartPayload } from "@/types";

interface ChartBlockProps {
  chart: ChartPayload;
}

export function ChartBlock({ chart }: ChartBlockProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const seriesColor = isDark ? "#e4e4e7" : "#18181b";
  const gridColor = isDark ? "#3f3f46" : "#e4e4e7";
  const tickColor = isDark ? "#a1a1aa" : "#71717a";
  const tooltipBg = isDark ? "#27272a" : "#ffffff";
  const tooltipBorder = isDark ? "#3f3f46" : "#e4e4e7";
  const tooltipText = isDark ? "#f4f4f5" : "#18181b";

  const axisTickStyle = {
    fontSize: 11,
    fill: tickColor,
    fontFamily: "var(--font-ibm-plex-mono), monospace",
  };

  const tooltipContentStyle = {
    border: `1px solid ${tooltipBorder}`,
    borderRadius: "4px",
    fontSize: 11,
    fontFamily: "var(--font-ibm-plex-mono), monospace",
    backgroundColor: tooltipBg,
    color: tooltipText,
    boxShadow: "none",
  };

  const { type, title, subtitle, data, x_key, y_key, x_label, y_label } = chart;

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-5 my-2">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
      {subtitle && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 mb-3">{subtitle}</p>
      )}

      <ResponsiveContainer width="100%" height={240}>
        {type === "line" ? (
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey={x_key}
              tick={axisTickStyle}
              label={
                x_label
                  ? { value: x_label, position: "insideBottom", offset: -2, style: axisTickStyle }
                  : undefined
              }
            />
            <YAxis
              tick={axisTickStyle}
              label={
                y_label
                  ? { value: y_label, angle: -90, position: "insideLeft", style: axisTickStyle }
                  : undefined
              }
            />
            <Tooltip contentStyle={tooltipContentStyle} />
            <Line
              type="monotone"
              dataKey={y_key}
              stroke={seriesColor}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: seriesColor }}
            />
          </LineChart>
        ) : type === "bar" ? (
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey={x_key} tick={axisTickStyle} />
            <YAxis tick={axisTickStyle} />
            <Tooltip contentStyle={tooltipContentStyle} />
            <Bar dataKey={y_key} fill={seriesColor} radius={[2, 2, 0, 0]} />
          </BarChart>
        ) : (
          <ScatterChart margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey={x_key} tick={axisTickStyle} name={x_label ?? x_key} />
            <YAxis dataKey={y_key} tick={axisTickStyle} name={y_label ?? y_key} />
            <Tooltip contentStyle={tooltipContentStyle} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={data} fill={seriesColor} />
          </ScatterChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
