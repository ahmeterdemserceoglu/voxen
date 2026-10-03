import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { appAlert } from '../utils/appAlert';
import { offlineDownloadService } from '../services/offlineDownloadService';
import { useThemeColors } from '../utils/useTheme';
import type { Track } from '../models';
import { accountSession } from '../services/auth/accountStorage';
import type { DownloadEntry } from '../services/offlineDownloadService';

export function DownloadStoragePanel({ onTracksChanged }: { onTracksChanged: (tracks: Track[]) => void }) {
  const colors = useThemeColors(); const callback = React.useRef(onTracksChanged); callback.current = onTracksChanged;
  const [bytes, setBytes] = React.useState(0); const [pending, setPending] = React.useState<Track[]>([]);
  const [entries, setEntries] = React.useState<DownloadEntry[]>([]);
  React.useEffect(() => {
    const update = () => setEntries(offlineDownloadService.getAllEntries());
    update(); const unsubscribe = offlineDownloadService.addProgressListener(update);
    return unsubscribe;
  }, []);
  React.useEffect(() => {
    let alive = true; let loading = false;
    const load = async () => { if (loading) return; loading = true;
      const epoch = accountSession.generation;
      try {
        const [items, size, remaining] = await Promise.all([offlineDownloadService.getDownloadedTracks(), offlineDownloadService.getStorageUsedBytes(), offlineDownloadService.getPendingTracks()]);
        if (alive && accountSession.isCurrent(epoch)) { setBytes(size); setPending(remaining); callback.current(items.map(item => item.track)); }
      } finally { loading = false; }
    };
    void load().catch(() => {}); const timer = setInterval(() => { void load().catch(() => {}); }, 2000);
    const unsubscribe = offlineDownloadService.addProgressListener((_id, progress) => { if (progress >= 100) void load().catch(() => {}); });
    const unsubscribeAccount = accountSession.subscribe(() => { setBytes(0); setPending([]); callback.current([]); void load().catch(() => {}); });
    return () => { alive = false; clearInterval(timer); unsubscribe(); unsubscribeAccount(); };
  }, []);
  const button = (label: string, action: () => void) => <TouchableOpacity key={label} onPress={action} style={{ paddingVertical: 10, paddingRight: 18 }}><Text style={{ color: colors.primary }}>{label}</Text></TouchableOpacity>;
  return <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
    <Text style={{ color: colors.textMuted }}>{(bytes / 1048576).toFixed(1)} MB kullanılıyor</Text>
    {entries.filter(entry => entry.state === 'downloading' || entry.state === 'error' || entry.state === 'cancelled').map(entry => <View key={entry.trackId} style={{ paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{entry.track?.title || 'Müzik indiriliyor'}</Text>
        <Text style={{ color: colors.textMuted }}>{entry.state === 'downloading' ? `%${Math.floor(entry.progress)}` : entry.state === 'error' ? 'Başarısız' : 'Durduruldu'}</Text>
        {entry.state === 'downloading' && <TouchableOpacity accessibilityLabel="İndirmeyi durdur" onPress={() => offlineDownloadService.cancelDownload(entry.trackId)}><Text style={{ color: colors.primary }}>Durdur</Text></TouchableOpacity>}
      </View>
      <View style={{ height: 4, backgroundColor: colors.surface, borderRadius: 2, marginVertical: 8, overflow: 'hidden' }}><View style={{ height: 4, width: `${Math.max(0, Math.min(100, entry.progress))}%`, backgroundColor: colors.primary }} /></View>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{entry.error || [entry.bytesDownloaded != null ? `${(entry.bytesDownloaded / 1048576).toFixed(1)} MB${entry.totalBytes ? ` / ${(entry.totalBytes / 1048576).toFixed(1)} MB` : ''}` : 'Bağlantı hazırlanıyor', entry.bytesPerSecond ? `${(entry.bytesPerSecond / 1048576).toFixed(2)} MB/sn` : '', entry.remainingSeconds ? `yaklaşık ${Math.ceil(entry.remainingSeconds / 60)} dk kaldı` : ''].filter(Boolean).join(' · ')}</Text>
    </View>)}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {pending.length > 0 && button(`${pending.length} indirmeyi yeniden dene`, () => { void offlineDownloadService.downloadMany(pending); })}
      {button('İndirmeleri durdur', () => offlineDownloadService.cancelAllDownloads())}
      {(bytes > 0 || pending.length > 0) && button('Depolamayı temizle', () => appAlert('İndirilenleri temizle', 'İndirilen şarkılar ve yarım dosyalar silinecek.', [{ text: 'Vazgeç' }, { text: 'Temizle', style: 'destructive', onPress: () => { void offlineDownloadService.clearDownloads().catch(() => appAlert('Temizlenemedi', 'Bazı dosyalar silinemedi. Tekrar dene.')); } }]))}
    </View>
  </View>;
}
