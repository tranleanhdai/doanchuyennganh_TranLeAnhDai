// src/components/MapView.tsx
import React, { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Popup,
  useMap,
  LayersControl,
  Circle,
  ImageOverlay,
} from "react-leaflet";
import type { Feature, Polygon, GeoJsonObject } from "geojson";
import L from "leaflet";
import type { LatLngBoundsExpression } from "leaflet";

import "leaflet/dist/leaflet.css";
import "leaflet.fullscreen/Control.FullScreen.css";
import "leaflet.fullscreen";

import marker2x from "leaflet/dist/images/marker-icon-2x.png";
import marker1x from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import type { FloodMapLayers, FloodRegions } from "../types";

const searchMarkerIcon = L.icon({
  iconRetinaUrl: marker2x,
  iconUrl: marker1x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Fix default marker
L.Icon.Default.mergeOptions({
  iconRetinaUrl: marker2x,
  iconUrl: marker1x,
  shadowUrl: markerShadow,
});

type MapViewProps = {
  data?: GeoJsonObject;
  aoi?: GeoJsonObject | null;
  centerOverride?: [number, number] | null;
  thumbUrl?: string | null;
  searchPoint?: { lat: number; lng: number; label?: string } | null;

  riskBubble?: {
    center: [number, number];
    radius: number;
    color: string;
  } | null;

  riskFillColor?: string | null;

  // 💧 các lớp ảnh PNG (pre / event / delta / flood) từ backend
  floodLayers?: FloodMapLayers | null;

  // 🔲 ranh giới HCM / BD / BRVT / merged
  regions?: FloodRegions | null;
};

type Ring = [number, number][];

const { BaseLayer } = LayersControl;

// ===== Collect AOI outer rings (for mask) =====
function collectAoiRings(aoi: GeoJsonObject | null | undefined): Ring[] {
  if (!aoi) return [];
  const rings: Ring[] = [];

  const processGeom = (geom: any) => {
    if (!geom) return;
    const { type, coordinates } = geom;

    if (type === "Polygon") {
      if (Array.isArray(coordinates) && coordinates.length > 0) {
        rings.push(coordinates[0] as Ring);
      }
    } else if (type === "MultiPolygon") {
      coordinates?.forEach((poly: any) => {
        if (poly?.[0]) {
          rings.push(poly[0] as Ring);
        }
      });
    }
  };

  const obj: any = aoi;
  if (obj.type === "FeatureCollection") {
    obj.features?.forEach((f: any) => processGeom(f.geometry));
  } else if (obj.type === "Feature") {
    processGeom(obj.geometry);
  } else {
    processGeom(obj);
  }

  return rings;
}

// ===== Build mask polygon (outer world - AOI holes) =====
function buildMaskFromAoi(
  aoi: GeoJsonObject | null | undefined
): Feature<Polygon> | null {
  const aoiRings = collectAoiRings(aoi);
  if (!aoiRings.length) return null;

  const outerRing: Ring = [
    [95, 3],
    [115, 3],
    [115, 25],
    [95, 25],
    [95, 3],
  ];

  const mask: Feature<Polygon> = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [outerRing, ...aoiRings] as any,
    },
  };

  return mask;
}

// ===== Map Effects =====
const MapEffects: React.FC<{
  data?: GeoJsonObject;
  aoi?: GeoJsonObject | null;
  centerOverride?: [number, number] | null;
}> = ({ data, aoi, centerOverride }) => {
  const map = useMap();

  // fullscreen
  useEffect(() => {
    const anyMap = map as any;
    if (!anyMap._hasFullscreen && (L as any).control?.fullscreen) {
      (L as any).control.fullscreen({ position: "topleft" }).addTo(map);
      anyMap._hasFullscreen = true;
    }
  }, [map]);

  // dimPane
  useEffect(() => {
    const anyMap = map as any;
    if (!anyMap.getPane("dimPane")) {
      anyMap.createPane("dimPane");
      const pane = anyMap.getPane("dimPane");
      if (pane) {
        pane.style.zIndex = "350";
      }
    }
  }, [map]);

  // fit bounds
  useEffect(() => {
    if (centerOverride) {
      map.setView(centerOverride, 13);
      return;
    }

    const layers: L.GeoJSON[] = [];
    if (aoi) layers.push(L.geoJSON(aoi as any));
    if (data) layers.push(L.geoJSON(data as any));

    if (!layers.length) {
      map.setView([10.75, 106.7], 10);
      return;
    }

    const group = L.featureGroup(layers);
    const bounds: LatLngBoundsExpression = group.getBounds();

    if ((bounds as any).isValid?.()) {
      map.fitBounds(bounds as any, { padding: [20, 20] });
    } else {
      map.setView([10.75, 106.7], 10);
    }
  }, [map, data, aoi, centerOverride]);

  // invalidateSize
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 0);
  }, [map]);

  return null;
};

// ============================ MAP VIEW =============================
const MapView: React.FC<MapViewProps> = ({
  data,
  aoi,
  centerOverride,
  thumbUrl,
  searchPoint,
  riskBubble,
  riskFillColor,
  floodLayers,
  regions,
}) => {
  const defaultCenter: [number, number] = [10.75, 106.7];
  const defaultZoom = 10;

  const normData = useMemo(() => data, [data]);
  const maskGeoJson = useMemo(() => buildMaskFromAoi(aoi), [aoi]);

  // bounds cho các ImageOverlay (lấy theo AOI)
  const overlayBounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (!aoi) return null;
    const layer = L.geoJSON(aoi as any);
    const b = layer.getBounds();
    if (!b.isValid()) return null;
    return [
      [b.getSouth(), b.getWest()],
      [b.getNorth(), b.getEast()],
    ];
  }, [aoi]);

  const aoiStrokeColor = "#facc15";
  const aoiFill = riskFillColor || "#fde047";
  const aoiFillOpacity = riskFillColor ? 0.18 : 0.08;

  return (
    <div className="map-wrapper">
      <MapContainer
        center={centerOverride || defaultCenter}
        zoom={defaultZoom}
        style={{ width: "100%", height: "100%" }}
      >
        {/* 👇 LayersControl luôn mở (collapsed={false}) để thấy checkbox */}
        <LayersControl position="topright" collapsed={false}>
          {/* BASE MAPS */}
          <BaseLayer checked name="Bản đồ">
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </BaseLayer>

          <BaseLayer name="Ảnh vệ tinh">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"
            />
          </BaseLayer>

          {/* PNG overlays từ GEE */}
          {overlayBounds && floodLayers?.flood && (
            <LayersControl.Overlay checked name="Ngập (mask + AOI)">
              <ImageOverlay
                url={floodLayers.flood}
                bounds={overlayBounds}
                opacity={0.85}
              />
            </LayersControl.Overlay>
          )}

          {overlayBounds && floodLayers?.pre_vv && (
            <LayersControl.Overlay name="VV trước sự kiện">
              <ImageOverlay
                url={floodLayers.pre_vv}
                bounds={overlayBounds}
                opacity={0.9}
              />
            </LayersControl.Overlay>
          )}

          {overlayBounds && floodLayers?.event_vv && (
            <LayersControl.Overlay name="VV trong sự kiện">
              <ImageOverlay
                url={floodLayers.event_vv}
                bounds={overlayBounds}
                opacity={0.9}
              />
            </LayersControl.Overlay>
          )}

          {overlayBounds && floodLayers?.delta_db && (
            <LayersControl.Overlay name="ΔdB (event - pre)">
              <ImageOverlay
                url={floodLayers.delta_db}
                bounds={overlayBounds}
                opacity={0.9}
              />
            </LayersControl.Overlay>
          )}

          {/* DARK MASK outside AOI */}
          {maskGeoJson && (
            <LayersControl.Overlay checked name="Mask ngoài AOI">
              <GeoJSON
                data={maskGeoJson as any}
                pane="dimPane"
                interactive={false}
                style={{
                  color: "#020617",
                  weight: 0,
                  fillColor: "#020617",
                  fillOpacity: 0.6,
                }}
              />
            </LayersControl.Overlay>
          )}

          {/* AOI BORDER + FILL (vùng merge sau sáp nhập) */}
          {aoi && (
            <LayersControl.Overlay checked name="Ranh TP.HCM sau sáp nhập (3 tỉnh)">
              <GeoJSON
                data={aoi as any}
                style={{
                  color: aoiStrokeColor,
                  weight: 3,
                  fillColor: aoiFill,
                  fillOpacity: aoiFillOpacity,
                }}
              />
            </LayersControl.Overlay>
          )}

          {/* Ranh TP.HCM / Bình Dương / Bà Rịa–Vũng Tàu gốc */}
          {regions?.hcm && (
            <LayersControl.Overlay name="Ranh TP.HCM (cũ)">
              <GeoJSON
                data={regions.hcm as any}
                style={{
                  color: "#22c55e", // xanh lá
                  weight: 2,
                  fillOpacity: 0,
                }}
              />
            </LayersControl.Overlay>
          )}

          {regions?.bd && (
            <LayersControl.Overlay name="Ranh Bình Dương">
              <GeoJSON
                data={regions.bd as any}
                style={{
                  color: "#3b82f6", // xanh dương
                  weight: 2,
                  fillOpacity: 0,
                }}
              />
            </LayersControl.Overlay>
          )}

          {regions?.brvt && (
            <LayersControl.Overlay name="Ranh Bà Rịa – Vũng Tàu">
              <GeoJSON
                data={regions.brvt as any}
                style={{
                  color: "#ec4899", // hồng
                  weight: 2,
                  fillOpacity: 0,
                }}
              />
            </LayersControl.Overlay>
          )}

          {/* FLOOD polygons vector */}
          {normData && (
            <LayersControl.Overlay checked name="Vùng ngập (vector)">
              <GeoJSON
                data={normData as any}
                style={{
                  color: "#0ea5e9",
                  weight: 1.6,
                  fillColor: "#22c1f1",
                  fillOpacity: 0.75,
                }}
              />
            </LayersControl.Overlay>
          )}

          {/* SEARCH MARKER */}
          {searchPoint && (
            <LayersControl.Overlay checked name="Điểm tìm kiếm">
              <Marker
                position={[searchPoint.lat, searchPoint.lng]}
                icon={searchMarkerIcon}
              >
                <Popup>{searchPoint.label || "Vị trí tìm kiếm"}</Popup>
              </Marker>
            </LayersControl.Overlay>
          )}

          {/* Circle bubble – nếu có */}
          {riskBubble && (
            <LayersControl.Overlay checked name="Vùng cảnh báo">
              <Circle
                center={riskBubble.center}
                radius={riskBubble.radius}
                pathOptions={{
                  color: riskBubble.color,
                  fillColor: riskBubble.color,
                  fillOpacity: 0.25,
                }}
              />
            </LayersControl.Overlay>
          )}
        </LayersControl>

        <MapEffects
          data={normData}
          aoi={aoi}
          centerOverride={centerOverride || null}
        />
      </MapContainer>

      {/* thumbnail nhỏ góc dưới (nếu muốn giữ) */}
      {thumbUrl && (
        <div className="map-thumb-overlay">
          <img src={thumbUrl} alt="Flood thumbnail" />
        </div>
      )}
    </div>
  );
};

export default MapView;
