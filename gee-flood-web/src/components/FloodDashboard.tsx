// src/components/FloodDashboard.tsx
import React, { useState } from "react";
import DetectionTab from "./tabs/DetectionTab";
import TimeSeriesTab from "./tabs/TimeSeriesTab";
import CorrelationTab from "./tabs/CorrelationTab";
import RainfallTab from "./tabs/RainfallTab";
import ReportTab from "./tabs/ReportTab";
import ForecastTab from "./tabs/ForecastTab";
import "./FloodDashboard.css";

type TabKey =
  | "detection"
  | "timeseries"
  | "rainfall"
  | "correlation"
  | "report"
  | "forecast";

const tabMeta: {
  key: TabKey;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "detection",
    label: "Phát hiện ngập",
    subtitle: "So sánh Sentinel-1 trước / sau mưa để trích vùng ngập.",
    icon: <span className="fg-nav-icon-inner">📡</span>,
  },
  {
    key: "timeseries",
    label: "Chuỗi thời gian",
    subtitle: "Theo dõi diện tích ngập 10 năm gần đây.",
    icon: <span className="fg-nav-icon-inner">📈</span>,
  },
  {
    key: "rainfall",
    label: "Lượng mưa",
    subtitle: "Chuỗi CHIRPS daily & thống kê theo tháng.",
    icon: <span className="fg-nav-icon-inner">🌧️</span>,
  },
  {
    key: "correlation",
    label: "Tương quan",
    subtitle: "Mối quan hệ giữa mưa và diện tích ngập.",
    icon: <span className="fg-nav-icon-inner">🔗</span>,
  },
  {
    key: "report",
    label: "Báo cáo",
    subtitle: "Xuất gói ZIP: bản đồ + CSV + metadata.",
    icon: <span className="fg-nav-icon-inner">📦</span>,
  },
  {
    key: "forecast",
    label: "Cảnh báo",
    subtitle: "Dự báo nguy cơ ngập 5 ngày tới.",
    icon: <span className="fg-nav-icon-inner">⚠️</span>,
  },
];

const FloodDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("detection");
  const current = tabMeta.find((t) => t.key === activeTab) ?? tabMeta[0];

  return (
    <div className="fg-app-shell">
      {/* ===== SIDEBAR ===== */}
      <aside className="fg-sidebar">
        {/* Logo + title */}
        <div>
          <div className="fg-sidebar-header">
            <div className="fg-logo-circle">
              <span className="fg-logo-icon">⚡</span>
            </div>
            <div className="fg-logo-text">
              <div className="fg-logo-title">FloodGuard AI</div>
              <div className="fg-logo-sub">TP.HCM sau sáp nhập</div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="fg-sidebar-nav">
            {tabMeta.map((t) => (
              <button
                key={t.key}
                className={
                  "fg-nav-item" +
                  (activeTab === t.key ? " fg-nav-item--active" : "")
                }
                onClick={() => setActiveTab(t.key)}
              >
                <div className="fg-nav-icon">{t.icon}</div>
                <div className="fg-nav-text">
                  <div className="fg-nav-label">{t.label}</div>
                  <div className="fg-nav-sub">{t.subtitle}</div>
                </div>
                {activeTab === t.key && <span className="fg-nav-dot" />}
              </button>
            ))}
          </nav>
        </div>

        {/* Footer: data sources + status */}
        <div className="fg-sidebar-footer">
          <div className="fg-status-card">
            <div className="fg-status-dot" />
            <div className="fg-status-text">
              <div className="fg-status-title">Trạng thái: Tốt</div>
              <div className="fg-status-sub">
                Hệ thống đang giám sát dữ liệu từ Google Earth Engine & API.
              </div>
            </div>
          </div>

          <div className="fg-datasource-block">
            <div className="fg-datasource-title">Nguồn dữ liệu</div>
            <ul>
              <li>Sentinel-1 SAR (EE)</li>
              <li>JRC Global Surface Water</li>
              <li>SRTM DEM 30&nbsp;m</li>
              <li>CHIRPS Daily</li>
              <li>OpenWeather 5-day / 3h Forecast</li>
            </ul>
          </div>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main className="flood-dashboard fg-main">
        {/* Top header giống mẫu FloodGuard AI */}
        <header className="fg-main-header">
          <div>
            <div className="fg-breadcrumb">
              HỆ THỐNG PHÂN TÍCH &amp; CẢNH BÁO NGẬP LỤT
            </div>
            <h1 className="fg-main-title">
              Hệ thống phân tích ngập TP.HCM sau sáp nhập
            </h1>
            <p className="fg-main-subtitle">
              FastAPI + Google Earth Engine · Sentinel-1, JRC, SRTM, CHIRPS,
              OpenWeather
            </p>
          </div>

          <div className="fg-main-header-right">
            <div className="fg-chip fg-chip-status">
              <span className="fg-chip-dot" />
              <span>Trạng thái: Online</span>
            </div>
            <div className="fg-chip-group">
              <span className="fg-chip">HCM + Bình Dương + Bà Rịa-Vũng Tàu</span>
              <span className="fg-chip fg-chip-soft">
                ΔdB · JRC · SRTM · AOI hợp nhất
              </span>
            </div>
          </div>
        </header>

        {/* Section header theo tab hiện tại */}
        <section className="fg-section-header">
          <div className="fg-section-pill">
            <div className="fg-section-icon">{current.icon}</div>
            <div>
              <div className="fg-section-title">{current.label}</div>
              <div className="fg-section-sub">{current.subtitle}</div>
            </div>
          </div>

          <div className="fg-section-tags">
            <span className="fg-tag">TP.HCM sau sáp nhập</span>
            <span className="fg-tag">Sentinel-1 · CHIRPS · OpenWeather</span>
          </div>
        </section>

        {/* Nội dung từng tab (card / chart / map giữ nguyên) */}
        <main className="fg-main-content">
          {/* Detection */}
          <section
            className={
              "fd-tab-panel" +
              (activeTab === "detection" ? " fd-tab-panel--active" : "")
            }
          >
            <DetectionTab />
          </section>

          {/* Time series */}
          <section
            className={
              "fd-tab-panel" +
              (activeTab === "timeseries" ? " fd-tab-panel--active" : "")
            }
          >
            <TimeSeriesTab />
          </section>

          {/* Rainfall */}
          <section
            className={
              "fd-tab-panel" +
              (activeTab === "rainfall" ? " fd-tab-panel--active" : "")
            }
          >
            <RainfallTab />
          </section>

          {/* Correlation */}
          <section
            className={
              "fd-tab-panel" +
              (activeTab === "correlation" ? " fd-tab-panel--active" : "")
            }
          >
            <CorrelationTab />
          </section>

          {/* Report */}
          <section
            className={
              "fd-tab-panel" +
              (activeTab === "report" ? " fd-tab-panel--active" : "")
            }
          >
            <ReportTab />
          </section>

          {/* Forecast */}
          <section
            className={
              "fd-tab-panel" +
              (activeTab === "forecast" ? " fd-tab-panel--active" : "")
            }
          >
            <ForecastTab />
          </section>
        </main>
      </main>
    </div>
  );
};

export default FloodDashboard;
