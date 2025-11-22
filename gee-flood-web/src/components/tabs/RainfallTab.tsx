// src/components/tabs/RainfallTab.tsx
import React, { useEffect, useMemo, useState } from "react";
import { getRainfall } from "../../api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import type { RainfallPoint } from "../../types";
import "../FloodDashboard.css";

type PresetKey = "1y" | "3y" | "10y" | "custom";

interface MonthlyRain {
  monthKey: string; // "2023-01"
  label: string; // "01/2023"
  totalRain: number;
}

const formatDate = (d: Date) => d.toISOString().slice(0, 10);

const addYears = (d: Date, years: number) => {
  const nd = new Date(d);
  nd.setFullYear(nd.getFullYear() + years);
  return nd;
};

const RainfallTab: React.FC = () => {
  const [data, setData] = useState<RainfallPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [preset, setPreset] = useState<PresetKey>("3y");

  // Tải dữ liệu theo range
  const loadData = async (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getRainfall({
        start: startDate,
        end: endDate,
        scale_m: 5000,
      });
      setData(res);
    } catch (err) {
      console.error(err);
      setError("Không lấy được chuỗi lượng mưa.");
    } finally {
      setLoading(false);
    }
  };

  // Khởi tạo: 3 năm gần nhất
  useEffect(() => {
    const today = new Date();
    const endDate = formatDate(today);
    const startDate = formatDate(addYears(today, -3));
    setStart(startDate);
    setEnd(endDate);
    setPreset("3y");
    loadData(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePresetClick = (key: PresetKey) => {
    const today = new Date();
    let startDate = start;
    let endDate = end;

    if (key === "1y") {
      endDate = formatDate(today);
      startDate = formatDate(addYears(today, -1));
    } else if (key === "3y") {
      endDate = formatDate(today);
      startDate = formatDate(addYears(today, -3));
    } else if (key === "10y") {
      endDate = formatDate(today);
      startDate = formatDate(addYears(today, -10));
    } else {
      setPreset("custom");
      return;
    }

    setPreset(key);
    setStart(startDate);
    setEnd(endDate);
    loadData(startDate, endDate);
  };

  const handleManualStartChange = (value: string) => {
    setPreset("custom");
    setStart(value);
  };

  const handleManualEndChange = (value: string) => {
    setPreset("custom");
    setEnd(value);
  };

  const handleReloadClick = () => {
    if (!start || !end) return;
    if (start > end) {
      alert("Ngày bắt đầu phải trước ngày kết thúc.");
      return;
    }
    loadData(start, end);
  };

  // Tổng hợp thống kê
  const { totalRain, maxDay, heavyDays, monthly } = useMemo(() => {
    if (!data.length) {
      return {
        totalRain: 0,
        maxDay: null as RainfallPoint | null,
        heavyDays: 0,
        monthly: [] as MonthlyRain[],
      };
    }

    let total = 0;
    let max: RainfallPoint | null = null;
    let heavy = 0;

    const monthMap = new Map<string, MonthlyRain>();

    data.forEach((d) => {
      const rain = d.rain_mm || 0;
      total += rain;

      if (!max || rain > max.rain_mm) {
        max = d;
      }

      if (rain >= 50) {
        heavy += 1;
      }

      const monthKey = d.date.slice(0, 7);
      let m = monthMap.get(monthKey);
      if (!m) {
        const [y, mth] = monthKey.split("-");
        m = {
          monthKey,
          label: `${mth}/${y}`,
          totalRain: 0,
        };
      }
      m.totalRain += rain;
      monthMap.set(monthKey, m);
    });

    const monthlyArr = Array.from(monthMap.values()).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey)
    );

    return {
      totalRain: total,
      maxDay: max,
      heavyDays: heavy,
      monthly: monthlyArr,
    };
  }, [data]);

  if (loading && !data.length) return <p>Đang tải dữ liệu lượng mưa...</p>;
  if (error) return <p className="fd-error">{error}</p>;

  const hasRange = start && end;

  return (
    <div className="rf-root">
      {/* HEADER CARD: tiêu đề + mô tả + meta chips + preset & date */}
      <section className="fd-card rf-header-card">
        <div className="rf-header-main">
          <h2>3. Lượng mưa trên khu vực TP.HCM sau sáp nhập</h2>
          <p className="fd-note">
            Dữ liệu từ bộ CHIRPS Daily (Google Earth Engine), tính lượng mưa
            trung bình theo ngày trên toàn vùng nghiên cứu.
          </p>
        </div>

        <div className="rf-header-meta">
          {hasRange && (
            <span className="rf-meta-chip">
              Khoảng thời gian: {start} – {end}
            </span>
          )}
          <span className="rf-meta-chip">
            Số ngày dữ liệu: {data.length.toLocaleString("vi-VN")}
          </span>
          <span className="rf-meta-chip rf-meta-chip-soft">
            Độ phân giải CHIRPS: 5 km
          </span>
        </div>

        {/* Preset range buttons */}
        <div className="rf-preset-row">
          <button
            className={
              "fd-year-btn" + (preset === "1y" ? " fd-year-btn--active" : "")
            }
            onClick={() => handlePresetClick("1y")}
          >
            1 năm gần nhất
          </button>
          <button
            className={
              "fd-year-btn" + (preset === "3y" ? " fd-year-btn--active" : "")
            }
            onClick={() => handlePresetClick("3y")}
          >
            3 năm gần nhất
          </button>
          <button
            className={
              "fd-year-btn" + (preset === "10y" ? " fd-year-btn--active" : "")
            }
            onClick={() => handlePresetClick("10y")}
          >
            10 năm gần nhất
          </button>
          <button
            className={
              "fd-year-btn" +
              (preset === "custom" ? " fd-year-btn--active" : "")
            }
            onClick={() => handlePresetClick("custom")}
          >
            Tự chọn
          </button>
        </div>

        {/* Date inputs */}
        <div className="fd-form-grid rf-date-grid">
          <div>
            <label>Từ ngày</label>
            <input
              type="date"
              value={start}
              onChange={(e) => handleManualStartChange(e.target.value)}
            />
          </div>
          <div>
            <label>Đến ngày</label>
            <input
              type="date"
              value={end}
              onChange={(e) => handleManualEndChange(e.target.value)}
            />
          </div>
        </div>

        <div className="fd-actions rf-actions">
          <button onClick={handleReloadClick} disabled={loading}>
            {loading ? "Đang tải..." : "Lấy chuỗi lượng mưa"}
          </button>
          {loading && data.length > 0 && (
            <span className="fd-note">
              Đang cập nhật lại dữ liệu theo khoảng thời gian mới...
            </span>
          )}
        </div>
      </section>

      {/* CARD 2: Chuỗi thời gian daily */}
      <section className="fd-card rf-card">
        <div className="rf-card-header">
          <div>
            <h3>2. Chuỗi thời gian lượng mưa (mm/ngày)</h3>
            <p className="fd-note">
              Đường thể hiện lượng mưa trung bình theo ngày. Có thể dùng để
              phát hiện các đợt mưa lớn kéo dài.
            </p>
          </div>
        </div>
        <div className="rf-chart-wrapper">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                stroke="#9ca3af"
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                tickFormatter={(value: string) => value.slice(0, 7)}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="#9ca3af"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: "#22c55e", strokeWidth: 1 }}
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "0.5rem 0.75rem",
                  boxShadow: "0 10px 26px rgba(15,23,42,0.08)",
                }}
                labelStyle={{ color: "#111827", fontWeight: 500 }}
                itemStyle={{ color: "#16a34a", fontSize: 12 }}
                labelFormatter={(label: any) => `Ngày ${label}`}
                formatter={(value: any) => [
                  `${(value as number).toFixed(1)} mm`,
                  "Lượng mưa",
                ]}
              />
              <defs>
                <linearGradient
                  id="rainAreaGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#4ade80" stopOpacity={0.95} />
                  <stop offset="60%" stopColor="#22c55e" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#a7f3d0" stopOpacity={0.15} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="rain_mm"
                stroke="#22c55e"
                strokeWidth={1.5}
                fill="url(#rainAreaGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* CARD 3: Thống kê nhanh */}
      <section className="fd-card rf-card rf-stats-card">
        <div className="rf-stats-grid">
          <div className="rf-stat-item">
            <div className="fd-note">Tổng lượng mưa trong khoảng</div>
            <div className="rf-stat-value">
              {totalRain.toFixed(1)} <span className="rf-unit">mm</span>
            </div>
          </div>
          <div className="rf-stat-item">
            <div className="fd-note">Ngày mưa lớn nhất</div>
            {maxDay ? (
              <div className="rf-stat-main">
                <span className="rf-stat-date">{maxDay.date}</span>
                <span className="rf-stat-highlight">
                  {maxDay.rain_mm.toFixed(1)} mm
                </span>
              </div>
            ) : (
              <div className="rf-stat-main">—</div>
            )}
          </div>
          <div className="rf-stat-item">
            <div className="fd-note">Số ngày mưa ≥ 50 mm</div>
            <div className="rf-stat-value">{heavyDays}</div>
          </div>
        </div>
      </section>

      {/* CARD 4: Tổng lượng mưa theo tháng */}
      <section className="fd-card rf-card rf-bottom-card">
        <div className="rf-card-header">
          <div>
            <h3>3. Tổng lượng mưa theo tháng</h3>
            <p className="fd-note">
              Mỗi cột là tổng lượng mưa (mm) của tháng đó, tính từ dữ liệu
              daily trong khoảng thời gian đã chọn.
            </p>
          </div>
        </div>
        <div className="rf-chart-wrapper">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={monthly}
              margin={{ top: 16, right: 8, left: -12, bottom: 4 }}
            >
              <defs>
                <linearGradient
                  id="rainMonthGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                  <stop offset="60%" stopColor="#22c55e" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#bfdbfe" stopOpacity={0.3} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="4 4"
                stroke="#e5e7eb"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                stroke="#9ca3af"
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                stroke="#9ca3af"
                tickLine={false}
                axisLine={false}
                width={60}
                tick={{ fontSize: 11 }}
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
                labelFormatter={(label) => `Tháng ${label}`}
                formatter={(value: any) => [
                  `${(value as number).toFixed(1)} mm`,
                  "Tổng lượng mưa",
                ]}
              />
              <Bar
                dataKey="totalRain"
                fill="url(#rainMonthGradient)"
                radius={[8, 8, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

export default RainfallTab;
