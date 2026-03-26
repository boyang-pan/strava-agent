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
import type { ChartPayload } from "@/types";

const ZINC_900 = "#18181b";
const ZINC_200 = "#e4e4e7";
const ZINC_500 = "#71717a";

const axisTickStyle = {
  fontSize: 11,
  fill: ZINC_500,
  fontFamily: "var(--font-ibm-plex-mono), monospace",
};

const tooltipContentStyle = {
  border: `1px solid ${ZINC_200}`,
  borderRadius: "4px",
  fontSize: 11,
  fontFamily: "var(--font-ibm-plex-mono), monospace",
  backgroundColor: "#fff",
  boxShadow: "none",
};

interface ChartBlockProps {
  chart: ChartPayload;
}

export function ChartBlock({ chart }: ChartBlockProps) {
  const { type, title, subtitle, data, x_key, y_key, x_label, y_label } = chart;

  return (
    <div className="border border-zinc-200 rounded-lg p-5 my-2">
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      {subtitle && (
        <p className="text-xs text-zinc-500 mt-0.5 mb-3">{subtitle}</p>
      )}

      <ResponsiveContainer width="100%" height={240}>
        {type === "line" ? (
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={ZINC_200} />
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
              stroke={ZINC_900}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: ZINC_900 }}
            />
          </LineChart>
        ) : type === "bar" ? (
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={ZINC_200} />
            <XAxis dataKey={x_key} tick={axisTickStyle} />
            <YAxis tick={axisTickStyle} />
            <Tooltip contentStyle={tooltipContentStyle} />
            <Bar dataKey={y_key} fill={ZINC_900} radius={[2, 2, 0, 0]} />
          </BarChart>
        ) : (
          <ScatterChart margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={ZINC_200} />
            <XAxis dataKey={x_key} tick={axisTickStyle} name={x_label ?? x_key} />
            <YAxis dataKey={y_key} tick={axisTickStyle} name={y_label ?? y_key} />
            <Tooltip contentStyle={tooltipContentStyle} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={data} fill={ZINC_900} />
          </ScatterChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
