// src/components/tabs/ReportTab.tsx
import React, { useState } from "react";
import { detectFlood, downloadReport } from "../../api";
import type { FloodRequest, FloodResponse } from "../../types";
import MapView from "../MapView";
import "../FloodDashboard.css";

// ==== mặc định ngày giống DetectionTab ====
const today = new Date();
const formatDate = (d: Date) => d.toISOString().slice(0, 10);

const defaultEventEnd = formatDate(today);
const defaultEventStart = formatDate(new Date(today.getTime() - 2 * 86400000));
const defaultPreEnd = formatDate(new Date(today.getTime() - 3 * 86400000));
const defaultPreStart = formatDate(new Date(today.getTime() - 10 * 86400000));

const ReportTab: React.FC = () => {
  // --- state ngày ---
  const [preStart, setPreStart] = useState(defaultPreStart);
  const [preEnd, setPreEnd] = useState(defaultPreEnd);
  const [eventStart, setEventStart] = useState(defaultEventStart);
  const [eventEnd, setEventEnd] = useState(defaultEventEnd);

  // --- tham số báo cáo ---
  const [years, setYears] = useState(5);
  const [rainfallScale, setRainfallScale] = useState(5000);
  const [minDiffDb, setMinDiffDb] = useState(-2);
  const [elevMax, setElevMax] = useState(15);
  const [scaleM, setScaleM] = useState(30);

  // --- preview map ---
  const [previewResult, setPreviewResult] = useState<FloodResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // --- download ---
  const [downloading, setDownloading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // --- search ---
  const [searchText, setSearchText] = useState("");
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(
    null
  );
  const [searchPoint, setSearchPoint] = useState<{
    lat: number;
    lng: number;
    label?: string;
  } | null>(null);

  const buildFloodRequest = (): FloodRequest => ({
    pre_start: preStart,
    pre_end: preEnd,
    event_start: eventStart,
    event_end: eventEnd,
    min_diff_db: minDiffDb,
    elev_max_m: elevMax,
    scale_m: scaleM,
    max_vertices: 5000,
    thumb_size: 1024,
  });

  const handlePreview = async () => {
    setLoadingPreview(true);
    setPreviewError(null);
    setReportError(null);
    setSearchCenter(null);
    setSearchPoint(null);

    try {
      const res = await detectFlood(buildFloodRequest());
      setPreviewResult(res);
    } catch (e: any) {
      console.error(e);
      setPreviewError(
        e?.response?.data?.detail || "Lỗi khi xem trước bản đồ ngập."
      );
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setReportError(null);
    try {
      const blob = await downloadReport(buildFloodRequest(), {
        years,
        rainfall_scale_m: rainfallScale,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flood_report_${eventStart}_to_${eventEnd}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      setReportError(e?.response?.data?.detail || "Lỗi khi tạo báo cáo.");
    } finally {
      setDownloading(false);
    }
  };

  const handleSearchLocation = async () => {
    const raw = searchText.trim();
    if (!raw) return;

    let query = raw;
    if (!/Hồ Chí Minh|Ho Chi Minh|TPHCM|TP\.? ?HCM/i.test(raw)) {
      query = `${raw}, Ho Chi Minh, Vietnam`;
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=1`;
      const res = await fetch(url, { headers: { "Accept-Language": "vi" } });
      const json = await res.json();

      if (Array.isArray(json) && json.length > 0) {
        const { lat, lon, display_name } = json[0];
        setSearchCenter([parseFloat(lat), parseFloat(lon)]);
        setSearchPoint({
          lat: parseFloat(lat),
          lng: parseFloat(lon),
          label: display_name || raw,
        });
      } else {
        alert("Không tìm thấy vị trí.");
      }
    } catch {
      alert("Lỗi khi tìm kiếm.");
    }
  };

  return (
    <div className="rp-root">
      {/* HEADER CARD */}
      <section className="fd-card rp-header-card">
        <div className="rp-header-main">
          <h2>5. Tạo báo cáo tải về</h2>
          <p className="fd-note">
            Báo cáo ZIP bao gồm: ảnh bản đồ ngập, chuỗi diện tích ngập (CSV),
            chuỗi lượng mưa (CSV) và file metadata mô tả toàn bộ tham số xử lý.
          </p>
        </div>

        <div className="rp-header-meta">
          <span className="rp-chip">
            Đầu ra: <strong>.zip</strong> (map + CSV + metadata)
          </span>
          <span className="rp-chip">
            Khoảng thời gian: {preStart} → {eventEnd}
          </span>
          <span className="rp-chip rp-chip-soft">
            Chuỗi phân tích: {years} năm gần nhất • CHIRPS scale{" "}
            {rainfallScale.toLocaleString("vi-VN")} m
          </span>
        </div>
      </section>

      {/* GRID 2 CARD: FORM + PREVIEW */}
      <div className="rp-grid">
        {/* CARD TRÁI: form & tham số xử lý */}
        <section className="fd-card rp-form-card">
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>
            1. Khoảng thời gian phân tích
          </h3>
          <div className="fd-form-grid">
            <div>
              <label>Pre start</label>
              <input
                type="date"
                value={preStart}
                onChange={(e) => setPreStart(e.target.value)}
              />
            </div>
            <div>
              <label>Pre end</label>
              <input
                type="date"
                value={preEnd}
                onChange={(e) => setPreEnd(e.target.value)}
              />
            </div>
            <div>
              <label>Event start</label>
              <input
                type="date"
                value={eventStart}
                onChange={(e) => setEventStart(e.target.value)}
              />
            </div>
            <div>
              <label>Event end</label>
              <input
                type="date"
                value={eventEnd}
                onChange={(e) => setEventEnd(e.target.value)}
              />
            </div>
          </div>

          <h3 style={{ marginTop: 16, marginBottom: 6 }}>2. Tham số xử lý</h3>
          <div className="fd-form-grid rp-param-grid">
            <div>
              <label>Số năm cho chuỗi ngập</label>
              <select
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
              >
                <option value={1}>1 năm</option>
                <option value={3}>3 năm</option>
                <option value={5}>5 năm</option>
                <option value={10}>10 năm</option>
              </select>
              <small>
                Dùng cho phần chuỗi diện tích ngập &amp; tương quan mưa–ngập.
              </small>
            </div>

            <div>
              <label>Scale CHIRPS (m)</label>
              <input
                type="number"
                value={rainfallScale}
                onChange={(e) => setRainfallScale(Number(e.target.value))}
              />
              <small>Độ phân giải không gian khi lấy lượng mưa CHIRPS.</small>
            </div>

            <div>
              <label>Ngưỡng giảm dB</label>
              <input
                type="number"
                step="0.1"
                value={minDiffDb}
                onChange={(e) => setMinDiffDb(Number(e.target.value))}
              />
              <small>Ngưỡng ΔdB giữa ảnh pre &amp; event để coi là ngập.</small>
            </div>

            <div>
              <label>Ngưỡng cao độ tối đa (m)</label>
              <input
                type="number"
                value={elevMax}
                onChange={(e) => setElevMax(Number(e.target.value))}
              />
              <small>Loại bỏ vùng cao hơn giới hạn độ cao này.</small>
            </div>

            <div>
              <label>Scale Sentinel-1 (m)</label>
              <input
                type="number"
                value={scaleM}
                onChange={(e) => setScaleM(Number(e.target.value))}
              />
              <small>Độ phân giải khi trích vùng ngập từ Sentinel-1.</small>
            </div>
          </div>

          <div className="fd-actions rp-actions">
            <button onClick={handlePreview} disabled={loadingPreview}>
              {loadingPreview ? "Đang xem..." : "Xem trước bản đồ ngập"}
            </button>

            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{ marginLeft: 8 }}
            >
              {downloading ? "Đang tạo báo cáo..." : "Tải báo cáo (.zip)"}
            </button>
          </div>

          {reportError && <p className="fd-error">{reportError}</p>}
        </section>

        {/* CARD PHẢI: preview + map */}
        <section className="fd-card rp-preview-card">
          <h3 style={{ marginTop: 0 }}>3. Kết quả preview bản đồ ngập</h3>

          {previewError && <p className="fd-error">{previewError}</p>}

          {!previewResult ? (
            <div className="rp-preview-empty">
              <div className="rp-preview-icon">📍</div>
              <div>Bản đồ ngập sẽ hiển thị tại đây sau khi bạn nhấn xem trước.</div>
              <div className="fd-note" style={{ marginTop: 4 }}>
                Gợi ý: chọn khoảng thời gian &amp; tham số phù hợp rồi bấm{" "}
                <strong>“Xem trước bản đồ ngập”</strong>.
              </div>
            </div>
          ) : (
            <div className="fd-result">
              <div className="rp-summary-row">
                <div>
                  <div className="fd-note">Diện tích ngập</div>
                  <div className="rp-summary-value">
                    {previewResult.stats.area_km2.toFixed(2)} km²
                  </div>
                </div>
                <div>
                  <div className="fd-note">Số pixel ngập</div>
                  <div className="rp-summary-sub">
                    {previewResult.stats.pixel_count.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="fd-note">Độ phân giải Sentinel-1</div>
                  <div className="rp-summary-sub">
                    {previewResult.stats.scale_m} m
                  </div>
                </div>
              </div>

              <div className="fd-map-search">
                <div className="fd-map-search-inner">
                  <span className="fd-map-search-icon">🔍</span>
                  <input
                    className="fd-map-search-input"
                    type="text"
                    placeholder="Tìm quận/huyện hoặc địa điểm..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleSearchLocation()
                    }
                  />
                  <button
                    type="button"
                    className="fd-map-search-btn"
                    onClick={handleSearchLocation}
                    disabled={loadingPreview}
                  >
                    Tìm
                  </button>
                </div>
              </div>

              <div className="fd-map-wrapper">
                <p className="fd-note">
                  Bản đồ ngập chi tiết (OpenStreetMap + ranh TP.HCM sau sáp
                  nhập + vùng ngập trích từ Sentinel-1).
                </p>
                <MapView
                  data={previewResult.polygons_geojson}
                  aoi={previewResult.aoi_geojson}
                  centerOverride={searchCenter}
                  searchPoint={searchPoint}
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ReportTab;
