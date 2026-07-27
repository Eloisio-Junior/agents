import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/client/contexts/ThemeContext";

// One day of the dashboard cost trend. cost is the Langfuse cost for the (UTC) day; calls/conversations
// are local-day counts from our own timeseries; costPerConv is cost ÷ conversations (null when either
// is missing). The UTC-vs-local mismatch only nudges values at the day boundary (documented caveat).
export interface TrendPoint {
  key: string;
  labelMs: number;
  cost: number;
  conversations: number;
  calls: number;
  costPerConv: number | null;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

// Resolves the chart palette from the theme CSS vars, re-reading when the theme flips (the vars change
// under html[data-theme], so the memo keys off resolvedTheme). Returns concrete colors recharts can put
// straight into SVG fill/stroke.
function useChartColors() {
  const { resolvedTheme } = useTheme();
  // biome-ignore lint/correctness/useExhaustiveDependencies: resolvedTheme is the re-read trigger; cssVar reads live DOM.
  return useMemo(
    () => ({
      cost: cssVar("--color-accent", "#3ea6ff"),
      conversations: cssVar("--color-text-muted", "#666666"),
      perConv: cssVar("--color-warning", "#eab308"),
      calls: cssVar("--color-accent", "#3ea6ff"),
      grid: cssVar("--color-border", "#262626"),
      axis: cssVar("--color-text-muted", "#666666"),
    }),
    [resolvedTheme],
  );
}

// The dashboard's daily cost trend as a recharts dual-axis ComposedChart, lazy-loaded so recharts stays
// out of the initial bundle (heavy SVG lib, only the dashboard needs it). Cost view: cost/day area +
// conversations/day bars (right axis) + cost-per-conversation line. Calls view (the no-Langfuse / no-cost
// fallback): calls/day bars + conversations/day line. Both axes are labelled + a legend, so the reader
// never has to guess what each axis means.
export default function CostTrendChart({
  data,
  metric,
  i18nLang,
}: {
  data: TrendPoint[];
  metric: "cost" | "calls";
  i18nLang: string;
}) {
  const { t } = useTranslation();
  const colors = useChartColors();

  const cf = useMemo(
    () =>
      new Intl.NumberFormat(i18nLang, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 4,
      }),
    [i18nLang],
  );
  const cfAxis = useMemo(
    () =>
      new Intl.NumberFormat(i18nLang, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
        notation: "compact",
      }),
    [i18nLang],
  );
  const nf = useMemo(() => new Intl.NumberFormat(i18nLang), [i18nLang]);
  const nfAxis = useMemo(
    () => new Intl.NumberFormat(i18nLang, { notation: "compact" }),
    [i18nLang],
  );
  const dayFmt = useMemo(
    () => new Intl.DateTimeFormat(i18nLang, { month: "short", day: "numeric" }),
    [i18nLang],
  );

  const isCost = metric === "cost";
  const labels = {
    cost: t("dashboard.chart.cost", "Cost (USD)"),
    conversations: t("dashboard.chart.conversations", "Conversations"),
    perConv: t("dashboard.chart.costPerConversation", "Cost / conversation"),
    calls: t("dashboard.chart.calls", "LLM requests"),
  };

  return (
    <div
      className="h-72 w-full"
      role="img"
      aria-label={
        isCost
          ? t(
              "dashboard.chart.ariaCost",
              "Daily LLM cost, conversations, and cost per conversation over time",
            )
          : t(
              "dashboard.chart.ariaCalls",
              "Daily LLM requests and conversations over time",
            )
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={colors.grid}
            vertical={false}
          />
          <XAxis
            dataKey="labelMs"
            tickFormatter={(ms: number) => dayFmt.format(new Date(ms))}
            tick={{ fill: colors.axis, fontSize: 11 }}
            stroke={colors.grid}
            minTickGap={24}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={(v: number) =>
              isCost ? cfAxis.format(v) : nfAxis.format(v)
            }
            tick={{ fill: colors.axis, fontSize: 11 }}
            stroke={colors.grid}
            width={56}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v: number) => nfAxis.format(v)}
            tick={{ fill: colors.axis, fontSize: 11 }}
            stroke={colors.grid}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: cssVar("--color-bg-secondary", "#161616"),
              border: `1px solid ${colors.grid}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: cssVar("--color-text-primary", "#f1f1f1") }}
            labelFormatter={(ms) => dayFmt.format(new Date(Number(ms)))}
            formatter={(value, name, item) => {
              const v = Number(value);
              const dk = (item as { dataKey?: string })?.dataKey;
              const money = dk === "cost" || dk === "costPerConv";
              return [money ? cf.format(v) : nf.format(v), name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {isCost ? (
            <>
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="cost"
                name={labels.cost}
                stroke={colors.cost}
                fill={colors.cost}
                fillOpacity={0.18}
              />
              <Bar
                yAxisId="right"
                dataKey="conversations"
                name={labels.conversations}
                fill={colors.conversations}
                fillOpacity={0.55}
                barSize={14}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="costPerConv"
                name={labels.perConv}
                stroke={colors.perConv}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </>
          ) : (
            <>
              <Bar
                yAxisId="left"
                dataKey="calls"
                name={labels.calls}
                fill={colors.calls}
                fillOpacity={0.55}
                barSize={14}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="conversations"
                name={labels.conversations}
                stroke={colors.perConv}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
