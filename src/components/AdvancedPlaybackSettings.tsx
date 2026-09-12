import { recommendationFeedback } from '../services/recommendations/recommendationFeedback';
import React from 'react';
import { View, Text, Switch, TouchableOpacity, NativeModules } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeColors } from '../utils/useTheme';

const presets: Record<string, number[]> = { Dengeli: [0, 0, 0, 0, 0], Bas: [6, 4, 0, 0, 1], Pop: [2, 1, 3, 2, 3], Vokal: [-2, 0, 4, 3, 0], Rock: [4, 2, -1, 3, 4] };
export function AdvancedPlaybackSettings() {
  const colors = useThemeColors();
  const settings = useSettingsStore();
  const active = settings.sleepTimerTrackEnd || settings.sleepTimerDeadline > Date.now();
  const [supported, setSupported] = React.useState(true);
  React.useEffect(() => { NativeModules.VoxenPlayback?.getEqualizerSupport?.().then(setSupported).catch(() => setSupported(false)); }, []);
  const chip = (label: string, action: () => void, selected = false, display = label) => <TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} onPress={action} style={{ paddingHorizontal: 14, paddingVertical: 10, marginRight: 6, marginBottom: 6, borderRadius: 14, backgroundColor: selected ? colors.primary : colors.surface }}><Text style={{ color: selected ? '#fff' : colors.text }}>{display}</Text></TouchableOpacity>;
  return <View style={{ paddingTop: 20 }}>
    <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 8 }}>Uyku zamanlayıcısı</Text>
    <Text style={{ color: colors.textMuted, marginBottom: 12 }}>{settings.sleepTimerTrackEnd ? 'Bu parça bitince duracak' : active ? `${Math.ceil((settings.sleepTimerDeadline - Date.now()) / 60000)} dakika sonra duracak` : 'Ekran kilitliyken de müziği durdurur'}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {[15, 30, 45, 60].map(minutes => chip(`${minutes} dk`, () => { void settings.updateSettings({ sleepTimerDeadline: Date.now() + minutes * 60000, sleepTimerTrackEnd: false }); }))}
      {chip('Parça sonu', () => { void settings.updateSettings({ sleepTimerDeadline: 0, sleepTimerTrackEnd: true }); }, settings.sleepTimerTrackEnd)}
      {active && chip('Zamanlayıcıyı kapat', () => { void settings.updateSettings({ sleepTimerDeadline: 0, sleepTimerTrackEnd: false }); })}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20 }}>
      <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: colors.text }}>Ekolayzır</Text>
      <Switch disabled={!supported} value={settings.equalizerEnabled && supported} onValueChange={equalizerEnabled => { void settings.updateSettings({ equalizerEnabled }); }} />
    </View>
    {!supported && <Text style={{ color: colors.textMuted }}>Bu cihaz ekolayzırı desteklemiyor.</Text>}
    {supported && settings.equalizerEnabled && <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>{Object.entries(presets).map(([name, bands]) => chip(name, () => { void settings.updateSettings({ equalizerBands: [...bands] }); }, bands.every((value, i) => value === settings.equalizerBands[i])))}</View>
      {['60 Hz', '230 Hz', '910 Hz', '3.6 kHz', '14 kHz'].map((label, i) => <View key={label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}>
        <Text style={{ flex: 1, color: colors.text }}>{label}</Text>
        {chip(`${label} azalt`, () => { const bands = [...settings.equalizerBands]; bands[i] = Math.max(-12, bands[i] - 1); void settings.updateSettings({ equalizerBands: bands }); }, false, '−')}
        <Text style={{ width: 45, textAlign: 'center', color: colors.text }}>{settings.equalizerBands[i]} dB</Text>
        {chip(`${label} artır`, () => { const bands = [...settings.equalizerBands]; bands[i] = Math.min(12, bands[i] + 1); void settings.updateSettings({ equalizerBands: bands }); }, false, '+')}
      </View>)}
    </>}
    <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 24, marginBottom: 12 }}>Keşif tercihleri</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {([['familiar', 'Tanıdık'], ['balanced', 'Dengeli'], ['adventurous', 'Daha fazla keşif']] as const).map(([value, label]) => chip(label, () => { void settings.updateSettings({ discoveryVariety: value }); }, settings.discoveryVariety === value))}
    </View>
    {chip('Önerme tercihlerini sıfırla', () => { void recommendationFeedback.reset(); })}
  </View>;
}
