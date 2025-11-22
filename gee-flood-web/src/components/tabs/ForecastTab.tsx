import React, { useEffect, useState } from "react";
import { getForecast, getAoi } from "../../api";
import MapView from "../MapView";
import "../FloodDashboard.css";

interface DailyRain {
  date: string;
  rain_mm: number;
}

interface ForecastResponse {
  location: { name: string; lat: number; lon: number };
  rain_3d_mm: number;
  rain_5d_mm: number;
  risk_level: "low" | "medium" | "high";
  thresholds: {
    rain_3d_medium: number;
    rain_3d_high: number;
  };
  raw_daily: DailyRain[];
}

const HCM_CENTER: [number, number] = [10.82, 106.63];

const formatDayLabel = (d: string) => {
  const dateObj = new Date(d);
  if (Number.isNaN(dateObj.getTime())) return d;
  return dateObj.toLocaleDateString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
};

const ForecastTab: React.FC = () => {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [aoi, setAoi] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [forecastRes, aoiRes] = await Promise.all([
          getForecast(),
          getAoi(),
        ]);

        setData(forecastRes);
        setAoi(aoiRes);
      } catch (err: any) {
        console.error(err);
        setError("Không tải được dự báo nguy cơ ngập.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) return <p className="fd-loading">Đang tải dự báo...</p>;
  if (error) return <p className="fd-error">{error}</p>;
  if (!data) return null;

  const level = data.risk_level;
  const riskColor =
    level === "high"
      ? "#ef4444"
      : level === "medium"
      ? "#f97316"
      : "#22c55e";

  const riskLabel =
    level === "high" ? "Cao" : level === "medium" ? "Trung bình" : "Thấp";

  const riskDescription =
    level === "high"
      ? "Nguy cơ ngập cao, cần theo dõi sát các bản tin cảnh báo."
      : level === "medium"
      ? "Nguy cơ ngập trung bình, có thể xuất hiện ngập cục bộ khi mưa lớn."
      : "Nguy cơ ngập thấp, chủ yếu ngập nhẹ tại một số điểm trũng.";

  return (
    <div className="fc-root">
      {/* CARD LỚN BỌC HẾT */}
      <div className="fd-card fc-shell">
        {/* HEADER TRÊN CÙNG */}
        <header className="fc-shell-header">
          <div className="fc-shell-header-left">
            <div className="fc-shell-header-text">
              <h2 className="fc-title">6.Dự báo nguy cơ ngập 5 ngày tới</h2>
              <p className="fc-subtitle">
                Dựa trên tổng lượng mưa dự báo cho toàn vùng TP.HCM sau sáp
                nhập (OpenWeather 5-day / 3h forecast).
              </p>
            </div>
          </div>

          <div className="fc-shell-header-right">
            <div className="fc-header-badges">
                <div className="fc-location-pill">
                <span className="fc-location-dot" />
                <span>TP.HCM sau sáp nhập</span>
                </div>
            </div>
          </div>
        </header>

        {/* GRID 2 CỘT: TRÁI = SỐ LIỆU, PHẢI = MAP */}
        <div className="fc-shell-grid">
          {/* ===== CỘT TRÁI ===== */}
          <section className="fc-left">
            {/* 3 card tóm tắt */}
            <div className="fc-summary-row">
              <div className="fc-summary-card">
                <div className="fc-summary-label">Mưa 3 ngày</div>
                <div className="fc-summary-value">
                  {data.rain_3d_mm.toFixed(1)} mm
                </div>
                <div className="fc-summary-hint">
                  Tổng lượng mưa 72 giờ đầu
                </div>
              </div>

              <div className="fc-summary-card">
                <div className="fc-summary-label">Mưa 5 ngày</div>
                <div className="fc-summary-value">
                  {data.rain_5d_mm.toFixed(1)} mm
                </div>
                <div className="fc-summary-hint">
                  Tổng lượng mưa trong 5 ngày
                </div>
              </div>

              <div className="fc-summary-card fc-summary-card-risk">
                <div className="fc-summary-label">Đánh giá nguy cơ</div>
                <div className="fc-summary-value" style={{ color: riskColor }}>
                  {riskLabel}
                </div>
                <div className="fc-summary-hint">{riskDescription}</div>
              </div>
            </div>

            {/* note ngắn gọn */}
            <p className="fc-note">
              Ngưỡng (tạm thời): <strong>40&nbsp;mm</strong> / 3 ngày → nguy cơ
              trung bình,&nbsp;
              <strong>80&nbsp;mm</strong> / 3 ngày → nguy cơ cao. Nguồn dữ
              liệu mưa:{" "}
              <strong>OpenWeather 5-day / 3h forecast</strong>, tổng hợp theo
              ngày cho toàn vùng TP.HCM sau sáp nhập.
            </p>

            {/* bảng từng ngày */}
            <div className="fc-daily-box">
              <div className="fc-daily-header">
                <span>Ngày</span>
                <span>Mưa (mm)</span>
              </div>

              <div className="fc-daily-body">
                {data.raw_daily.map((d) => {
                  const dailyLevel =
                    d.rain_mm >= 30
                      ? "high"
                      : d.rain_mm >= 10
                      ? "medium"
                      : "low";

                  return (
                    <div key={d.date} className="fc-daily-item">
                      <div className="fc-daily-main">
                        <span className="fc-daily-date">
                          {formatDayLabel(d.date)}
                        </span>
                        <span className="fc-daily-rain">
                          {d.rain_mm.toFixed(1)}
                        </span>
                      </div>
                      <span
                        className={
                          "fc-daily-tag fc-daily-tag-" + dailyLevel
                        }
                      >
                        {dailyLevel === "high"
                          ? "Mưa lớn"
                          : dailyLevel === "medium"
                          ? "Mưa vừa"
                          : "Ít mưa"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* LEGEND TO, DỄ ĐỌC */}
              <div className="fc-legend">
                <span className="fc-legend-title">Chú thích:</span>
                <span className="fc-legend-chip fc-legend-chip-low">
                  <span className="fc-legend-bullet fc-legend-bullet-low" />
                  Ít mưa
                </span>
                <span className="fc-legend-chip fc-legend-chip-medium">
                  <span className="fc-legend-bullet fc-legend-bullet-medium" />
                  Mưa vừa
                </span>
                <span className="fc-legend-chip fc-legend-chip-high">
                  <span className="fc-legend-bullet fc-legend-bullet-high" />
                  Mưa lớn
                </span>
              </div>
            </div>
          </section>

          {/* ===== CỘT PHẢI: MAP ===== */}
          <section className="fc-right">
            <header className="fc-map-header">
              <div>
                <h3 className="fc-map-title">Bản đồ nguy cơ ngập toàn vùng</h3>
                <p className="fc-map-subtitle">
                  Tô màu ranh giới TP.HCM theo mức nguy cơ hiện tại dựa trên
                  tổng lượng mưa 3 ngày.
                </p>
              </div>
            </header>

            <div className="fc-map-inner">
              <MapView
                data={undefined}
                aoi={aoi}
                thumbUrl={null}
                centerOverride={HCM_CENTER}
                searchPoint={null}
                riskBubble={null}
                riskFillColor={riskColor}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ForecastTab;
