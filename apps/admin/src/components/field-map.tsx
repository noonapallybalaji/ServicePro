import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

/*
 * Technicians on a map: the live map (many markers) and a day's route (a trail). Loaded lazily, so
 * Leaflet is only downloaded on these screens. Tiles default to OpenStreetMap; set VITE_MAP_TILE_URL
 * (and VITE_MAP_ATTRIBUTION) to a provider you have an account with before heavy use.
 */

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const HYDERABAD: L.LatLngTuple = [17.385, 78.4867];

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  /** Shown in the marker (initials). */
  text: string;
  /** Hover label. */
  label: string;
  /** Literal Tailwind classes for the marker colour (Tailwind must see the full string). */
  colorClass: string;
  /** Faded: an old position (offline). */
  stale?: boolean;
}

interface FieldMapProps {
  markers: MapMarker[];
  /** A route, oldest point first. */
  trail?: L.LatLngTuple[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Re-frame the map when this changes (not on every live update, so panning isn't undone). */
  frameKey?: string;
  label: string;
  className?: string;
}

export default function FieldMap({ markers, trail = [], selectedId, onSelect, frameKey, label, className }: FieldMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const framed = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView(HYDERABAD, 11);
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(instance);
    map.current = instance;
    layer.current = L.layerGroup().addTo(instance);
    return () => {
      instance.remove();
      map.current = null;
      layer.current = null;
      framed.current = undefined; // a new map (remount) is framed again
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    const group = layer.current;
    if (!instance || !group) return;
    group.clearLayers();

    if (trail.length > 1) {
      L.polyline(trail, {
        weight: 4,
        opacity: 0.8,
        className: 'stroke-primary',
      }).addTo(group);
    }
    const [first] = trail;
    if (first) {
      L.circleMarker(first, {
        radius: 6,
        weight: 2,
        fillOpacity: 1,
        className: 'fill-surface stroke-primary',
      })
        .bindTooltip('Start')
        .addTo(group);
    }

    for (const m of markers) {
      const selected = m.id === selectedId;
      const icon = L.divIcon({
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        html: `<span class="flex items-center justify-center rounded-full border-2 text-xs font-bold shadow-md ${m.colorClass} ${
          selected ? 'border-foreground ring-4 ring-primary/30' : 'border-white'
        } ${m.stale ? 'opacity-50' : ''}" style="width:36px;height:36px;color:white">${escapeHtml(m.text)}</span>`,
      });
      const marker = L.marker([m.latitude, m.longitude], {
        icon,
        keyboard: true,
        title: m.label,
        zIndexOffset: selected ? 1000 : 0,
      })
        .bindTooltip(escapeHtml(m.label), {
          direction: 'top',
          offset: [0, -18],
        })
        .addTo(group);
      if (onSelect) marker.on('click', () => onSelect(m.id));
    }

    // Frame everything once per frameKey; afterwards live updates only move markers. Wait a frame so
    // the map has its real size (it may have just been laid out), or the fit uses a zero-size box.
    if (framed.current !== frameKey) {
      framed.current = frameKey;
      const points: L.LatLngTuple[] = [...markers.map((m) => [m.latitude, m.longitude] as L.LatLngTuple), ...trail];
      requestAnimationFrame(() => {
        if (map.current !== instance) return;
        instance.invalidateSize();
        const [only] = points;
        if (points.length === 1 && only) instance.setView(only, 15);
        else if (points.length > 1) instance.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
      });
    }
  }, [markers, trail, selectedId, onSelect, frameKey]);

  // Pan to a technician picked from the list.
  useEffect(() => {
    const m = markers.find((x) => x.id === selectedId);
    if (m && map.current) map.current.panTo([m.latitude, m.longitude]);
    // Only when the selection changes, not on every position update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // isolate: keeps Leaflet's z-indexes (controls at 1000) under the app's header and dialogs.
  return (
    <div ref={container} role="application" aria-label={label} className={`isolate overflow-hidden rounded-card border border-border ${className ?? ''}`} />
  );
}

function escapeHtml(text: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (c) => entities[c] ?? c);
}
