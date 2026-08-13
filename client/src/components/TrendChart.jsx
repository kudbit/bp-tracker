import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function TrendChart({ summary, classifyReading }) {
  if (!summary?.trends?.length) {
    return (
      <div className="empty-state">
        <strong>No trend line yet.</strong>
        <p>Your chart will appear after your first saved reading.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={summary.trends} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="sysGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#FF9B86" stopOpacity={0.55} />
            <stop offset="50%" stopColor="#FFB4A2" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#FFB4A2" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="diaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8B6471" stopOpacity={0.4} />
            <stop offset="55%" stopColor="#B5828C" stopOpacity={0.14} />
            <stop offset="100%" stopColor="#B5828C" stopOpacity={0} />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <ReferenceArea y1={60} y2={120} fill="rgba(93, 135, 99, 0.045)" strokeOpacity={0} />
        <ReferenceArea y1={120} y2={130} fill="rgba(185, 122, 88, 0.055)" strokeOpacity={0} />
        <ReferenceArea y1={130} y2={200} fill="rgba(166, 76, 93, 0.04)" strokeOpacity={0} />

        <CartesianGrid stroke="rgba(181, 130, 140, 0.12)" strokeDasharray="6 4" vertical={false} />

        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={16}
          tick={{ fill: "#9A7480", fontSize: 11.5, fontWeight: 700, fontFamily: "Manrope, sans-serif" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          width={52}
          domain={["dataMin - 12", "dataMax + 12"]}
          tick={{ fill: "#9A7480", fontSize: 11.5, fontWeight: 700, fontFamily: "Manrope, sans-serif" }}
        />

        <ReferenceLine
          y={120}
          stroke="rgba(185, 122, 88, 0.45)"
          strokeDasharray="5 4"
          strokeWidth={1.5}
          label={{ value: "120", position: "insideTopRight", fill: "#B97A58", fontSize: 10, fontWeight: 700, dy: -4 }}
        />
        <ReferenceLine
          y={80}
          stroke="rgba(93, 135, 99, 0.45)"
          strokeDasharray="5 4"
          strokeWidth={1.5}
          label={{ value: "80", position: "insideTopRight", fill: "#5d8763", fontSize: 10, fontWeight: 700, dy: -4 }}
        />

        <Tooltip
          cursor={{ stroke: "rgba(181,130,140,0.25)", strokeWidth: 1.5, strokeDasharray: "4 3" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const sys = payload.find((p) => p.dataKey === "avgSystolic")?.value;
            const dia = payload.find((p) => p.dataKey === "avgDiastolic")?.value;
            const cat = sys && dia ? classifyReading(Math.round(sys), Math.round(dia)) : null;
            return (
              <div className="chart-tooltip">
                <p className="chart-tooltip__label">{label}</p>
                <div className="chart-tooltip__rows">
                  <div className="chart-tooltip__row">
                    <span className="chart-tooltip__swatch chart-tooltip__swatch--sys" />
                    <span className="chart-tooltip__key">Systolic</span>
                    <strong className="chart-tooltip__val">{sys ? Math.round(sys) : "--"}</strong>
                    <span className="chart-tooltip__unit">mmHg</span>
                  </div>
                  <div className="chart-tooltip__row">
                    <span className="chart-tooltip__swatch chart-tooltip__swatch--dia" />
                    <span className="chart-tooltip__key">Diastolic</span>
                    <strong className="chart-tooltip__val">{dia ? Math.round(dia) : "--"}</strong>
                    <span className="chart-tooltip__unit">mmHg</span>
                  </div>
                </div>
                {cat && (
                  <span className={`status-pill status-pill--${cat.tone} chart-tooltip__pill`}>
                    {cat.label}
                  </span>
                )}
              </div>
            );
          }}
        />

        <Area
          type="monotoneX"
          dataKey="avgSystolic"
          stroke="#FF9B86"
          strokeWidth={2.5}
          fill="url(#sysGradient)"
          dot={(props) => {
            const { cx, cy } = props;
            return (
              <circle
                key={`sys-dot-${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={4}
                fill="#fff"
                stroke="#FF9B86"
                strokeWidth={2.5}
              />
            );
          }}
          activeDot={(props) => {
            const { cx, cy } = props;
            return (
              <g key={`sys-active-${cx}`}>
                <circle cx={cx} cy={cy} r={10} fill="rgba(255,155,134,0.18)" />
                <circle cx={cx} cy={cy} r={6} fill="#FF9B86" filter="url(#glow)" />
                <circle cx={cx} cy={cy} r={3} fill="#fff" />
              </g>
            );
          }}
        />

        <Area
          type="monotoneX"
          dataKey="avgDiastolic"
          stroke="#8B6471"
          strokeWidth={2.5}
          fill="url(#diaGradient)"
          dot={(props) => {
            const { cx, cy } = props;
            return (
              <circle
                key={`dia-dot-${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={4}
                fill="#fff"
                stroke="#8B6471"
                strokeWidth={2.5}
              />
            );
          }}
          activeDot={(props) => {
            const { cx, cy } = props;
            return (
              <g key={`dia-active-${cx}`}>
                <circle cx={cx} cy={cy} r={10} fill="rgba(139,100,113,0.18)" />
                <circle cx={cx} cy={cy} r={6} fill="#8B6471" filter="url(#glow)" />
                <circle cx={cx} cy={cy} r={3} fill="#fff" />
              </g>
            );
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
