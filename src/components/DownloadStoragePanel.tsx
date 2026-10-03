import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { appAlert } from '../utils/appAlert';
import { offlineDownloadService } from '../services/offlineDownloadService';
import { useThemeColors } from '../utils/useTheme';
import type { Track } from '../models';
import { accountSession } from '../services/auth/accountStorage';

export function DownloadStoragePanel({ onTracksChanged }: { onTracksChanged: (tracks: Track[]) => void }) {
  const colors = useThemeColors(); const callback = React.useRef(onTracksChanged); callback.current = onTracksChanged;
  const [bytes, setBytes] = React.useState(0); const [pending, setPending] = React.useState<Track[]>([]);
  React.useEffect(() => {
    let alive = true; let loading = false; const epoch = accountSession.generation;
    const load = async () => { if (loading) return; loading = true;
      try {
        const [items, size, remaining] = await Promise.all([offlineDownloadService.getDownloadedTracks(), offlineDownloadService.getStorageUsedBytes(), offlineDownloadService.getPendingTracks()]);
        if (alive && accountSession.isCurrent(epoch)) { setBytes(size); setPending(remaining); callback.current(items.map(item => item.track)); }
      } finally { loading = false; }
    };
    void load().catch(() => {}); const timer = setInterval(() => { void load().catch(() => {}); }, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const button = (label: string, action: () => void) => <TouchableOpacity key={label} onPress={action} style={{ paddingVertical: 10, paddingRight: 18 }}><Text style={{ color: colors.primary }}>{label}</Text></TouchableOpacity>;
  return <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
    <Text style={{ color: colors.textMuted }}>{(bytes / 1048576).toFixed(1)} MB kullanılıyor</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {pending.length > 0 && button(`${pending.length} indirmeyi yeniden dene`, () => { void offlineDownloadService.downloadMany(pending); })}
      {button('İndirmeleri durdur', () => offlineDownloadService.cancelAllDownloads())}
      {(bytes > 0 || pending.length > 0) && button('Depolamayı temizle', () => appAlert('İndirilenleri temizle', 'İndirilen şarkılar ve yarım dosyalar silinecek.', [{ text: 'Vazgeç' }, { text: 'Temizle', style: 'destructive', onPress: () => { void offlineDownloadService.clearDownloads().catch(() => appAlert('Temizlenemedi', 'Bazı dosyalar silinemedi. Tekrar dene.')); } }]))}
    </View>
  </View>;
}
