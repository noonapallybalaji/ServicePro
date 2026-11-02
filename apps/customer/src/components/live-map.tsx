import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';

import { colors, radius } from '@/lib/theme';

/*
 * The technician's position on a map inside the app: OpenStreetMap through Leaflet in a small web
 * view (the same map as the website, and no Google Maps key). New positions move the marker
 * smoothly instead of reloading the map.
 */

const html = (latitude: number, longitude: number) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{margin:0;height:100%;background:#eef0f4}
.tech{width:38px;height:38px;border-radius:50%;background:${colors.primary};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#fff;font:700 16px sans-serif}
.halo{position:absolute;inset:-10px;border-radius:50%;background:rgba(21,77,140,.25);animation:p 1.6s ease-out infinite}
@keyframes p{from{transform:scale(.6);opacity:1}to{transform:scale(1.6);opacity:0}}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map',{zoomControl:false,attributionControl:true}).setView([${latitude},${longitude}],15);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
var icon=L.divIcon({className:'',html:'<div class="tech"><span class="halo"></span>&#128295;</div>',iconSize:[38,38],iconAnchor:[19,19]});
var marker=L.marker([${latitude},${longitude}],{icon:icon}).addTo(map);
window.moveTo=function(lat,lng){var from=marker.getLatLng(),steps=30,i=0;
var t=setInterval(function(){i++;var f=i/steps;marker.setLatLng([from.lat+(lat-from.lat)*f,from.lng+(lng-from.lng)*f]);if(i>=steps){clearInterval(t);map.panTo([lat,lng]);}},30);};
</script></body></html>`;

// The web view's class typings don't line up with this React Native version's; its props are the same.
const Web = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;

export function LiveMap({ latitude, longitude, height = 220 }: { latitude: number; longitude: number; height?: number }) {
  const view = useRef<WebView>(null);
  const [source] = useState(() => ({ html: html(latitude, longitude) })); // later positions move the marker

  useEffect(() => {
    view.current?.injectJavaScript(`window.moveTo && window.moveTo(${latitude}, ${longitude}); true;`);
  }, [latitude, longitude]);

  return (
    <View style={{ height, borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.sunken }} accessibilityLabel="Map showing your technician's location">
      <Web
        ref={view}
        source={source}
        originWhitelist={['*']}
        scrollEnabled={false}
        style={{ backgroundColor: colors.sunken }}
      />
    </View>
  );
}
