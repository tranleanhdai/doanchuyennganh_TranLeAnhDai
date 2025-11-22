// src/components/tabs/DetectionTab.tsx
import React, { useState } from "react";
import { detectFlood } from "../../api";
import type { FloodResponse } from "../../types";
import MapView from "../MapView";
import "../FloodDashboard.css";

// ==== mặc định ngày ====
const today = new Date();
const formatDate = (d: Date) => d.toISOString().slice(0, 10);

const defaultEventEnd = formatDate(today);
const defaultEventStart = formatDate(new Date(today.getTime() - 2 * 86400000));
const defaultPreEnd = formatDate(new Date(today.getTime() - 3 * 86400000));
const defaultPreStart = formatDate(new Date(today.getTime() - 10 * 86400000));

const DetectionTab: React.FC = () => {
  // state ngày
  const [preStart, setPreStart] = useState(defaultPreStart);
  const [preEnd, setPreEnd] = useState(defaultPreEnd);
  const [eventStart, setEventStart] = useState(defaultEventStart);
  const [eventEnd, setEventEnd] = useState(defaultEventEnd);

  // state kết quả flood
  const [floodResult, setFloodResult] = useState<FloodResponse | null>(null);
  const [floodError, setFloodError] = useState<string | null>(null);
  const [loadingFlood, setLoadingFlood] = useState(false);

  // search ngoài map
  const [searchText, setSearchText] = useState("");
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(
    null
  );
  const [searchPoint, setSearchPoint] = useState<{
    lat: number;
    lng: number;
    label?: string;
  } | null>(null);

  const handleRunFlood = async () => {
    setLoadingFlood(true);
    setFloodError(null);
    setSearchCenter(null);
    setSearchPoint(null);

    try {
      const res = await detectFlood({
        pre_start: preStart,
        pre_end: preEnd,
        event_start: eventStart,
        event_end: eventEnd,
        min_diff_db: -2,
        elev_max_m: 15,
        scale_m: 30,
        max_vertices: 5000,
        thumb_size: 1024,
      });
      setFloodResult(res);
    } catch (e: any) {
      console.error(e);
      setFloodError(
        e?.response?.data?.detail || "Lỗi khi chạy phân tích ngập"
      );
    } finally {
      setLoadingFlood(false);
    }
  };

  const handleSearchLocation = async () => {
    const raw = searchText.trim();
    if (!raw) return;

    let query = raw;
    if (!/Hồ Chí Minh|Ho Chi Minh|TPHCM|TP\. ?HCM/i.test(raw)) {
      query = `${raw}, Ho Chi Minh, Vietnam`;
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=1`;
      const res = await fetch(url, { headers: { "Accept-Language": "vi" } });
      const json: any[] = await res.json();

      if (Array.isArray(json) && json.length > 0) {
        const { lat, lon, display_name } = json[0];
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);

        setSearchCenter([latNum, lonNum]);
        setSearchPoint({
          lat: latNum,
          lng: lonNum,
          label: display_name || raw,
        });
      } else {
        alert(
          "Không tìm thấy vị trí này. Thử gõ đầy đủ hơn, ví dụ: 'quận 8, TP.HCM'."
        );
      }
    } catch (error) {
      console.error(error);
      alert("Lỗi khi tìm kiếm vị trí.");
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearchLocation();
    }
  };

  return (
    <>
      <section className="fd-two-col">
        {/* CARD TRÁI: Thiết lập sự kiện ngập */}
        <div className="fd-card">
          <h2>1. Phân tích một sự kiện ngập (Sentinel-1)</h2>
          <p className="fd-note">
            Chọn khoảng thời gian ảnh trước – sau sự kiện mưa lớn để hệ thống
            tự trích vùng ngập trên toàn TP.HCM sau sáp nhập.
          </p>

          <div className="fd-form-grid" style={{ marginTop: "0.9rem" }}>
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

          <div className="fd-actions" style={{ marginTop: 8 }}>
            <button onClick={handleRunFlood} disabled={loadingFlood}>
              {loadingFlood ? "Đang xử lý..." : "Chạy phân tích ngập"}
            </button>
            {!floodResult && !loadingFlood && (
              <span className="fd-note">
                Hệ thống sẽ tự lấy Sentinel-1, JRC &amp; SRTM để tính vùng ngập
                cho toàn TP.HCM.
              </span>
            )}
            {floodError && <p className="fd-error">{floodError}</p>}
          </div>
        </div>

        {/* CARD PHẢI: Stats + Map */}
        <div className="fd-card fd-card-map">
          {floodResult ? (
            <div className="fd-map-result">
              {/* Hàng 1: tổng hợp */}
              <div className="fd-map-stats">
                <div>
                  <div className="fd-note">Diện tích ngập (3 tỉnh gộp)</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                    {floodResult.stats.area_km2.toFixed(2)} km²
                  </div>
                </div>
                <div>
                  <div className="fd-note">Số pixel ngập</div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 500 }}>
                    {floodResult.stats.pixel_count.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="fd-note">Độ phân giải Sentinel-1</div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 500 }}>
                    {floodResult.stats.scale_m} m
                  </div>
                </div>
              </div>

              {/* Hàng 2: chia theo từng khu vực */}
              <div
                style={{
                  marginTop: "0.75rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <div className="fd-note">Trong ranh TP.HCM (cũ)</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 500 }}>
                    {floodResult.stats.area_km2_hcm.toFixed(2)} km²
                  </div>
                </div>
                <div>
                  <div className="fd-note">Trong ranh Bình Dương</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 500 }}>
                    {floodResult.stats.area_km2_bd.toFixed(2)} km²
                  </div>
                </div>
                <div>
                  <div className="fd-note">Trong ranh Bà Rịa – Vũng Tàu</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 500 }}>
                    {floodResult.stats.area_km2_brvt.toFixed(2)} km²
                  </div>
                </div>
              </div>

              {/* Ô tìm kiếm */}
              <div className="map-search-bar">
                <div className="map-search-input-wrapper">
                  <span className="map-search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Tìm quận/huyện hoặc địa điểm trong TP.HCM..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                  />
                </div>
              </div>

              <div className="fd-map-wrapper">
                <p className="fd-note">
                  Bản đồ ngập chi tiết (OpenStreetMap / Esri + ranh TP.HCM sau
                  sáp nhập + vùng ngập trích từ Sentinel-1).
                </p>
                <MapView
                  data={floodResult.polygons_geojson}
                  aoi={floodResult.aoi_geojson}
                  centerOverride={searchCenter}
                  searchPoint={searchPoint}
                  floodLayers={floodResult.layers || undefined}
                  regions={floodResult.regions_geojson || undefined}
                />
              </div>
            </div>
          ) : (
            <div className="fd-map-placeholder">
              <div className="fd-map-pin">📍</div>
              <p className="fd-note">
                Bản đồ ngập sẽ hiển thị ở đây sau khi chạy phân tích.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default DetectionTab;
