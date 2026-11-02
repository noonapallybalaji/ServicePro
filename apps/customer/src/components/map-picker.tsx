import { forwardRef, useImperativeHandle, useRef, useState, type ComponentType, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSequence, withSpring, withTiming, useSharedValue } from 'react-native-reanimated';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { Ionicons } from '@/components/ui';
import { colors, isDark } from '@/lib/theme';

/*
 * A full map to choose a place: the map moves under a fixed centre pin (OpenStreetMap via Leaflet,
 * no Google key). When the map settles, it reports the centre; the pin lifts while dragging and
 * drops when it stops.
 */

const html = (latitude: number, longitude: number) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{margin:0;height:100%;background:${colors.sunken}}${isDark ? '.leaflet-tile{filter:invert(1) hue-rotate(180deg) brightness(.9) contrast(.9)}' : ''}.leaflet-control-attribution{font-size:9px}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map',{zoomControl:false}).setView([${latitude},${longitude}],16);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
function send(type){var c=map.getCenter();window.ReactNativeWebView.postMessage(JSON.stringify({type:type,lat:c.lat,lng:c.lng}));}
map.on('movestart',function(){send('moving')});
map.on('moveend',function(){send('moved')});
window.goTo=function(lat,lng){map.flyTo([lat,lng],17,{duration:0.8});};
setTimeout(function(){send('moved')},300);
</script></body></html>`;

const Web = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;

export interface MapPickerHandle {
  goTo: (latitude: number, longitude: number) => void;
}

export const MapPicker = forwardRef(function MapPicker(
  { latitude, longitude, onCenter }: { latitude: number; longitude: number; onCenter: (latitude: number, longitude: number) => void },
  ref: Ref<MapPickerHandle>,
) {
  const view = useRef<WebView>(null);
  const [source] = useState(() => ({ html: html(latitude, longitude) }));
  const lift = useSharedValue(0);
  const pin = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() }] }));
  // A place asked for before the map has loaded (the phone's position on opening) waits for it.
  const loaded = useRef(false);
  const waiting = useRef<{ lat: number; lng: number } | null>(null);
  const fly = (lat: number, lng: number) => view.current?.injectJavaScript(`window.goTo(${lat}, ${lng}); true;`);

  useImperativeHandle(ref, () => ({
    goTo: (lat, lng) => {
      if (loaded.current) fly(lat, lng);
      else waiting.current = { lat, lng };
    },
  }));

  function onMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type: string; lat: number; lng: number };
      if (message.type === 'moving') lift.set(withTiming(-14, { duration: 150 }));
      if (message.type === 'moved' && !loaded.current) {
        loaded.current = true;
        const place = waiting.current;
        waiting.current = null;
        if (place) {
          fly(place.lat, place.lng);
          return;
        }
      }
      if (message.type === 'moved') {
        lift.set(withSequence(withSpring(4, { damping: 6 }), withSpring(0, { damping: 10 })));
        onCenter(message.lat, message.lng);
      }
    } catch {
      // Not ours.
    }
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <Web ref={view} source={source} originWhitelist={['*']} onMessage={onMessage} style={{ backgroundColor: colors.sunken }} />
      <View pointerEvents="none" style={styles.pinWrap}>
        <Animated.View style={[{ alignItems: 'center' }, pin]}>
          <Ionicons name="location" size={46} color={colors.error} />
        </Animated.View>
        <View style={styles.shadow} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  pinWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 46 },
  shadow: { width: 14, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.25)', marginTop: -4 },
});
