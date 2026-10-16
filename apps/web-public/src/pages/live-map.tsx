import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

/*
 * The technician's last reported position on a small map (gap analysis 6.2). Loaded lazily so
 * Leaflet is only downloaded while someone is on the way. Only the technician is shown: the
 * customer's own address never appears, because tracking links can be forwarded.
 *
 * Tiles default to OpenStreetMap, which is fine for light use; set VITE_MAP_TILE_URL (and
 * VITE_MAP_ATTRIBUTION) to a tile provider you have an account with before heavy traffic.
 */

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function LiveMap({ latitude, longitude, label }: { latitude: number; longitude: number; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<{ map: L.Map; marker: L.CircleMarker } | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(instance);
    const marker = L.circleMarker([0, 0], { radius: 10, weight: 3, fillOpacity: 1, className: 'fill-primary stroke-surface' }).addTo(instance);
    map.current = { map: instance, marker };
    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    map.current.marker.setLatLng([latitude, longitude]).bindTooltip(label);
    map.current.map.setView([latitude, longitude], Math.max(map.current.map.getZoom() || 0, 14));
  }, [latitude, longitude, label]);

  // isolate: keeps Leaflet's z-indexes (controls at 1000) under the sticky site header.
  return <div ref={container} role="img" aria-label={label} className="isolate aspect-4/3 w-full overflow-hidden rounded-card border border-border sm:aspect-video" />;
}
