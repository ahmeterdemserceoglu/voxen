import React from 'react';
import { TouchableOpacity, Text, Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineDownloadService } from '../services/offlineDownloadService';
import { useThemeColors } from '../utils/useTheme';
import type { Track } from '../models';
export function BulkDownloadButton({ tracks, menu = false, onStarted }: { tracks: Track[]; menu?: boolean; onStarted?: () => void }) {
  const colors = useThemeColors();
  const [progress, setProgress] = React.useState<string | null>(null);
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);
  return <TouchableOpacity accessibilityRole="button" disabled={!tracks.length || progress !== null} onPress={() => {
    setProgress(`0 / ${tracks.length}`);
    onStarted?.();
    void offlineDownloadService.downloadMany(tracks, (done, total) => { if (mounted.current) setProgress(`${done} / ${total}`); }).then(result => {
      if (mounted.current) { setProgress(null); if (result.failed) Alert.alert('İndirmeler', `${result.completed - result.failed} parça indirildi. ${result.failed} parça için tekrar deneyebilirsin.`); }
    }).catch(() => { if (mounted.current) { setProgress(null); Alert.alert('İndirmeler', 'İndirme başlatılamadı. Tekrar deneyebilirsin.'); } });
  }} accessibilityLabel="Tümünü çevrimdışı indir" style={menu ? { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14, opacity: tracks.length ? 1 : 0.4 } : { borderRadius: 16, padding: 12, marginVertical: 12, backgroundColor: colors.surface, alignItems: 'center', opacity: tracks.length ? 1 : 0.4 }}>
    {menu && <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="download-outline" size={21} color={colors.text} /></View>}
    <Text style={{ color: colors.text, ...(menu ? { flex: 1, fontSize: 15, fontWeight: '600' as const } : {}) }}>{progress ? `İndiriliyor • ${progress}` : 'Tümünü çevrimdışı indir'}</Text>
  </TouchableOpacity>;
}
