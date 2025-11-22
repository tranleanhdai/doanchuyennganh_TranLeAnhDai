// src/components/tabs/CorrelationTab.tsx
import React, { useState } from "react";
import { getCorrelation } from "../../api";
import type { CorrelationResponse } from "../../types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "../FloodDashboard.css";

const CorrelationTab: React.FC = () => {
  const [years, setYears] = useState(5); // số năm gần nhất
  const stepDays = 30; // bước thời gian cố định 30 ngày
  const [rainfallScale, setRainfallScale] = useState(5000); // scale CHIRPS (m)

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CorrelationResponse | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getCorrelation({
        years,
        step_days: stepDays,
        rainfall_scale_m: rainfallScale,
        min_diff_db: -2,
        elev_max_m: 15,
        scale_m: 30,
      });

      setResult(res);
    } catch (err) {
      console.error(err);
      setError("Không tính được tương quan mưa – ngập.");
    } finally {
      setLoading(false);
    }
  };

  const formatCorrText = (corr: number | null) => {
    if (corr === null)
      return "Không tính được (thiếu dữ liệu hoặc phương sai bằng 0).";
    const r = corr;

    let desc = "";
    if (Math.abs(r) < 0.2) desc = "rất yếu";
    else if (Math.abs(r) < 0.4) desc = "yếu";
    else if (Math.abs(r) < 0.6) desc = "trung bình";
    else if (Math.abs(r) < 0.8) desc = "khá mạnh";
    else desc = "rất mạnh";

    if (r > 0) return `Tương quan cùng chiều ${desc}`;
    if (r < 0) return `Tương quan ngược chiều ${desc}`;
    return "Không tương quan";
  };

  return (
    <div>
      <h2>4.Tương quan mưa – ngập (5–10 năm gần đây)</h2>
      <p className="fd-note">
        Kết hợp chuỗi diện tích ngập (Sentinel-1) và lượng mưa (CHIRPS) trên
        cùng khu vực TP.HCM sau sáp nhập, sau đó tính hệ số tương quan Pearson
        theo từng mốc thời gian.
      </p>

      {/* 1. Cấu hình tham số – card trắng giống v0 */}
      <section className="fd-card" style={{ marginTop: 12, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>1. Thiết lập tham số</h3>

        <div className="fd-form-grid">
          <div>
            <label>Số năm gần nhất</label>
            <input
              type="number"
              min={1}
              max={10}
              value={years}
              onChange={(e) => setYears(Number(e.target.value) || 1)}
            />
            <small>Sử dụng chuỗi mưa – ngập trong khoảng {years} năm gần đây.</small>
          </div>

          <div>
            <label>Bước thời gian (ngày)</label>
            <input
              type="number"
              value={stepDays}
              readOnly
              disabled
              style={{
                opacity: 0.6,
                cursor: "not-allowed",
              }}
            />
            <small>Đang khóa 30 ngày để khớp với chuỗi dữ liệu đã tiền tính.</small>
          </div>

          <div>
            <label>Scale lượng mưa CHIRPS (m)</label>
            <input
              type="number"
              min={1000}
              max={20000}
              step={1000}
              value={rainfallScale}
              onChange={(e) =>
                setRainfallScale(Number(e.target.value) || 5000)
              }
            />
            <small>Độ phân giải không gian khi lấy dữ liệu mưa.</small>
          </div>
        </div>

        <div className="fd-actions" style={{ marginTop: 8 }}>
          <button onClick={handleRun} disabled={loading}>
            {loading ? "Đang tính..." : "Tính tương quan mưa – ngập"}
          </button>
          {!result && !loading && (
            <span className="fd-note">
              Nhấn nút để tính tương quan. Bước nhảy đang khóa 30 ngày để khớp
              với chuỗi dữ liệu 10 năm đã tiền tính.
            </span>
          )}
        </div>

        {error && <p className="fd-error">{error}</p>}
      </section>

      {/* 2. Kết quả tương quan + số r to, gradient giống v0 */}
      {result && (
        <>
          <section className="fd-card">
            <h3 style={{ marginTop: 0 }}>2. Kết quả hệ số tương quan</h3>

            <div
              style={{
                textAlign: "center",
                marginTop: 12,
                marginBottom: 8,
              }}
            >
              <div className="fd-note" style={{ marginBottom: 4 }}>
                Hệ số tương quan Pearson
              </div>
              <div
                style={{
                  fontSize: "2.6rem",
                  fontWeight: 700,
                  background:
                    "linear-gradient(135deg, #06b6d4, #6366f1)",
                  WebkitBackgroundClip: "text",
                  color: "transparent",
                  lineHeight: 1.1,
                  marginBottom: 6,
                }}
              >
                {result.corr === null
                  ? "—"
                  : result.corr.toFixed(3)}
              </div>
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: "#0f172a",
                }}
              >
                {formatCorrText(result.corr)}
              </div>
            </div>

            <p className="fd-note">
              Lưu ý: đây là tương quan trên các mốc thời gian đã chọn (mỗi{" "}
              {stepDays} ngày một lần), không phải tương quan trên từng ngày
              mưa riêng lẻ.
            </p>
          </section>

          {/* 3. Biểu đồ mưa – ngập trong card trắng bo góc */}
          <section
            className="fd-card"
            style={{ marginTop: 18, paddingBottom: 18 }}
          >
            <h3 style={{ marginTop: 0 }}>3. Biểu đồ mưa – ngập theo thời gian</h3>
            <p className="fd-note">
              Đường màu xanh lá là lượng mưa (mm), đường xanh dương là diện
              tích ngập (km²). Trục bên trái: lượng mưa; trục bên phải: diện
              tích ngập.
            </p>

            <div style={{ width: "100%", marginTop: 8 }}>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={result.data}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    stroke="#9ca3af"
                    tickLine={false}
                    axisLine={{ stroke: "#e5e7eb" }}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#22c55e"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#0ea5e9"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: "0.5rem 0.75rem",
                      boxShadow:
                        "0 10px 26px rgba(15,23,42,0.08)",
                    }}
                    labelStyle={{
                      color: "#111827",
                      fontWeight: 500,
                    }}
                    itemStyle={{
                      fontSize: 12,
                      color: "#111827",
                    }}
                    labelFormatter={(label: any) =>
                      `Ngày ${label}`
                    }
                    formatter={(value: any, name: any) => {
                      if (name === "rain_mm") {
                        return [
                          `${(value as number).toFixed(1)} mm`,
                          "Lượng mưa",
                        ];
                      }
                      if (name === "area_km2") {
                        return [
                          `${(value as number).toFixed(2)} km²`,
                          "Diện tích ngập",
                        ];
                      }
                      return [value, name];
                    }}
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="rain_mm"
                    name="Lượng mưa (mm)"
                    stroke="#22c55e"
                    strokeWidth={1.8}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="area_km2"
                    name="Diện tích ngập (km²)"
                    stroke="#0ea5e9"
                    strokeWidth={1.8}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default CorrelationTab;
