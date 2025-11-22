// src/components/tabs/TimeSeriesTab.tsx
import React, { useEffect, useState, useMemo } from "react";
import { getFloodTimeseries } from "../../api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import type { FloodTimeseriesPoint } from "../../types";
import "../FloodDashboard.css";

type YearKey = "all" | number;

interface YearStats {
  year: number;
  totalArea: number;
  daysWithFlood: number;
  maxArea: number;
}

const TimeSeriesTab: React.FC = () => {
  const [data, setData] = useState<FloodTimeseriesPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<YearKey>("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getFloodTimeseries({
          years: 10,
          step_days: 45,
          min_diff_db: -2,
          elev_max_m: 15,
          scale_m: 30,
        });
        setData(res);
      } catch (err) {
        console.error(err);
        setError("Không lấy được chuỗi thời gian ngập.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const { filteredData, top10, yearStats, availableYears } = useMemo(() => {
    if (!data.length) {
      return {
        filteredData: [] as FloodTimeseriesPoint[],
        top10: [] as FloodTimeseriesPoint[],
        yearStats: [] as YearStats[],
        availableYears: [] as number[],
      };
    }

    const filtered =
      selectedYear === "all"
        ? data
        : data.filter((d) => d.date.startsWith(selectedYear.toString() + "-"));

    const topSorted = [...data].sort((a, b) => b.area_km2 - a.area_km2);
    const top10 = topSorted.slice(0, 10);

    const statsMap = new Map<number, YearStats>();

    data.forEach((d) => {
      const year = Number(d.date.slice(0, 4));
      if (!Number.isFinite(year)) return;

      const area = d.area_km2;
      let s = statsMap.get(year);
      if (!s) {
        s = { year, totalArea: 0, daysWithFlood: 0, maxArea: 0 };
      }
      s.totalArea += area;
      if (area > 0.1) s.daysWithFlood += 1;
      if (area > s.maxArea) s.maxArea = area;
      statsMap.set(year, s);
    });

    const yearStats = Array.from(statsMap.values()).sort(
      (a, b) => a.year - b.year
    );
    const years = yearStats.map((s) => s.year);

    return { filteredData: filtered, top10, yearStats, availableYears: years };
  }, [data, selectedYear]);

  const minYear =
    availableYears.length > 0 ? availableYears[0] : undefined;
  const maxYear =
    availableYears.length > 0
      ? availableYears[availableYears.length - 1]
      : undefined;

  if (loading) return <p>Đang tải dữ liệu...</p>;
  if (error) return <p className="fd-error">{error}</p>;
  if (!data.length) return <p>Không có dữ liệu.</p>;

  return (
    <div className="ts-root">
      {/* CARD HEADER: tiêu đề + mô tả + chips nhỏ */}
      <section className="fd-card ts-header-card">
        <div className="ts-header-main">
          <h2>2. Chuỗi thời gian diện tích ngập 10 năm gần đây</h2>
          <p className="fd-note">
            Dữ liệu được lấy mỗi ≈30 ngày từ Google Earth Engine. Biểu đồ thể
            hiện diện tích ngập (km²) trên toàn khu vực TP.HCM sau sáp nhập.
          </p>
        </div>

        <div className="ts-header-meta">
          {minYear && maxYear && (
            <span className="ts-meta-chip">
              Khoảng thời gian: {minYear} – {maxYear}
            </span>
          )}
          <span className="ts-meta-chip">
            Số mốc thời gian: {data.length.toLocaleString("vi-VN")}
          </span>
          <span className="ts-meta-chip ts-meta-chip-soft">
            Bước thời gian cố định ≈ 30 ngày
          </span>
        </div>

        {/* Hàng nút chọn năm */}
        <div className="fd-year-switch ts-year-switch">
          <button
            className={
              "fd-year-btn" +
              (selectedYear === "all" ? " fd-year-btn--active" : "")
            }
            onClick={() => setSelectedYear("all")}
          >
            Tất cả 10 năm
          </button>
          {availableYears.map((y) => (
            <button
              key={y}
              className={
                "fd-year-btn" +
                (selectedYear === y ? " fd-year-btn--active" : "")
              }
              onClick={() => setSelectedYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      </section>

      {/* CARD 1: Dữ liệu lịch sử (chart lớn) */}
      <section className="fd-card ts-card">
        <div className="ts-card-header">
          <div>
            <h3>Dữ liệu lịch sử</h3>
            <p className="fd-note">
              Đường diện tích ngập theo thời gian. Chọn năm ở trên để zoom
              nhanh vào từng giai đoạn.
            </p>
          </div>
        </div>

        <div className="ts-chart-wrapper">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={filteredData}>
              <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                stroke="#9ca3af"
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="#9ca3af"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "0.5rem 0.75rem",
                  boxShadow: "0 10px 26px rgba(15,23,42,0.08)",
                }}
                labelStyle={{ color: "#111827", fontWeight: 500 }}
                itemStyle={{ color: "#0ea5e9", fontSize: 12 }}
                formatter={(value: any, name: string) => {
                  if (name === "area_km2") {
                    return [`${(value as number).toFixed(2)} km²`, "Diện tích"];
                  }
                  return [value, name];
                }}
                labelFormatter={(label: any) => `Ngày: ${label}`}
              />
              <defs>
                <linearGradient id="tsAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.95} />
                  <stop offset="60%" stopColor="#38bdf8" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#bfdbfe" stopOpacity={0.15} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="area_km2"
                stroke="#0ea5e9"
                strokeWidth={1.8}
                fill="url(#tsAreaGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* CARD 2: Tổng diện tích theo năm + top 10 ngày ngập */}
      <section className="fd-card ts-card ts-card-bottom">
        <div className="ts-card-header ts-card-header-row">
          <div>
            <h3>Tổng diện tích ngập theo năm</h3>
            <p className="fd-note">
              Mỗi cột là tổng diện tích ngập (km²) trong năm đó, tính từ tất cả
              các mốc thời gian trong chuỗi.
            </p>
          </div>
        </div>

        <div className="ts-chart-wrapper">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart
              data={yearStats}
              margin={{ top: 16, right: 8, left: -12, bottom: 4 }}
            >
              <defs>
                <linearGradient
                  id="yearFloodGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                  <stop offset="60%" stopColor="#0ea5e9" stopOpacity={0.75} />
                  <stop offset="100%" stopColor="#bfdbfe" stopOpacity={0.4} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="4 4"
                stroke="#e5e7eb"
                vertical={false}
              />

              <XAxis
                dataKey="year"
                stroke="#9ca3af"
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                tick={{ fontSize: 12 }}
              />

              <YAxis
                stroke="#9ca3af"
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fontSize: 12 }}
                tickFormatter={(v: number) => `${Math.round(v)}`}
              />

              <Tooltip
                cursor={{ fill: "rgba(15,23,42,0.04)" }}
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "0.5rem 0.75rem",
                  boxShadow: "0 10px 26px rgba(15,23,42,0.08)",
                }}
                labelStyle={{ color: "#111827", fontWeight: 500 }}
                itemStyle={{ color: "#0369a1", fontSize: 12 }}
                labelFormatter={(label) => `Năm ${label}`}
                formatter={(value: number) => [
                  `${value.toFixed(1)} km²`,
                  "Tổng diện tích ngập",
                ]}
              />

              <Bar
                dataKey="totalArea"
                fill="url(#yearFloodGradient)"
                radius={[8, 8, 0, 0]}
                maxBarSize={42}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top 10 ngày ngập lớn nhất */}
        <div className="ts-top-wrapper">
          <h3>Top 10 ngày ngập lớn nhất (10 năm)</h3>
          <ul className="fd-top-list">
            {top10.map((d, idx) => (
              <li key={d.date} className="fd-top-item">
                <span className="fd-top-rank">{idx + 1}</span>
                <div className="fd-top-content">
                  <span className="fd-top-date">{d.date}</span>
                  <span className="fd-top-value">
                    {d.area_km2.toFixed(2)} km²
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
};

export default TimeSeriesTab;
