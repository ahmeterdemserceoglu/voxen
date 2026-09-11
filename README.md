<div align="center">

# 🎵 Voxen

### Modern, Sosyal ve Yüksek Performanslı Müzik Deneyimi
*A next-generation music streaming and social listening platform built with React Native & Expo.*

<br/>

[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2057-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%7C%20Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)
[![License](https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=for-the-badge)](./LICENSE)

<br/>

[**Özellikler**](#-özellikler) • [**Ekran Görüntüleri**](#-ekran-görüntüleri) • [**Mimari ve Teknolojiler**](#-mimari-ve-teknolojiler) • [**Kurulum**](#-kurulum-ve-çalıştırma) • [**Proje Yapısı**](#-proje-yapısı) • [**Katkıda Bulunma**](#-katkıda-bulunma)

</div>

---

## 🌟 Genel Bakış (Overview)

**Voxen**, YouTube Music ekosisteminin geniş kütüphanesini modern sosyal özellikler, çevrimdışı dinleme kabiliyeti ve yüksek performanslı bir kullanıcı arayüzü ile buluşturan yeni nesil bir mobil müzik uygulamasıdır. 

Kullanıcıların arkadaşlarıyla eşzamanlı müzik dinleyebileceği **Listening Room (Dinleme Odaları)**, senkronize şarkı sözleri, gelişmiş ses motoru ve dinamik tema desteği ile kusursuz bir dinleme deneyimi sunar.

---

## ✨ Özellikler

### 🎧 Müzik & Oynatma
- **Geniş Müzik Kütüphanesi:** YouTube Music altyapısı ile milyonlarca şarkı, albüm, sanatçı ve çalma listesi.
- **Kesintisiz Oynatma & Ses Motoru:** Arka planda oynatma, mini oynatıcı ve gelişmiş tam ekran oynatıcı.
- **Kuyruk Yönetimi (Queue):** Parçaları kolayca yeniden sıralama, sıradaki şarkıları dinamik olarak ekleme/çıkarma.
- **Podcast Desteği:** En popüler podcast bölümlerini keşfetme ve doğrudan dinleme.

### 👥 Sosyal & Birlikte Dinleme (Listening Room)
- **Gerçek Zamanlı Dinleme Odaları:** Firebase tabanlı gerçek zamanlı senkronizasyon ile arkadaşlarınızla aynı anda aynı şarkıyı dinleyin.
- **Kullanıcı Profilleri & Arkadaşlar:** Profil özelleştirme, kullanıcı takibi ve anlık bildirimler.

### ⚡ Performans & Çevrimdışı Yetenekler
- **Çevrimdışı İndirme & Önbellekleme:** Sevdiğiniz müzikleri yerel cihaz hafızasına indirerek internetsiz ortamda kesintisiz dinleyin.
- **Akıllı Ağ Yönetimi:** Bağlantı koptuğunda otomatik çevrimdışı moda geçiş, internet geldiğinde otomatik bulut senkronizasyonu.
- **Shopify FlashList:** Binlerce şarkı içeren listelerde dahi 60/120 FPS akıcı kaydırma performansı.

### 🎨 Görsel & Kullanıcı Deneyimi
- **Senkronize Şarkı Sözleri (LRC):** Şarkıyla eş zamanlı akan sözler ve karaoke benzeri görsel takip.
- **Dinamik Tema Desteği:** Modern koyu (Dark) ve OLED uyumlu derin siyah modlar, özel renk paletleri.
- **Modern Animasyonlar:** `react-native-reanimated` ile güçlendirilmiş akıcı geçişler ve hareketler.
- **Ana Ekran Widget & Bildirim Kontrolleri:** Uygulama dışındayken müziği zahmetsizce yönetin.

---

## 📸 Ekran Görüntüleri

| Keşfet & Ana Sayfa | Tam Ekran Çalar | Şarkı Sözleri |
| :---: | :---: | :---: |
| *(Home Screen)* | *(Player Screen)* | *(Synced Lyrics)* |

| Arama & Filtreleme | Dinleme Odası | Kütüphane & İndirilenler |
| :---: | :---: | :---: |
| *(Search & Filter)* | *(Listening Room)* | *(Library & Offline)* |

---

## 🛠 Mimari ve Teknolojiler

| Alan | Teknoloji / Kütüphane | Amaç |
|---|---|---|
| **Çekirdek** | [Expo (SDK 57)](https://expo.dev/) & [React Native (0.86)](https://reactnative.dev/) | Çapraz platform mobil uygulama altyapısı |
| **Dil** | [TypeScript](https://www.typescriptlang.org/) | Tip güvenliği ve ölçeklenebilir kod mimarisi |
| **Durum Yönetimi** | [Zustand](https://github.com/pmndrs/zustand) | Hafif, hızlı ve modüler global state yönetimi |
| **Backend & Veritabanı** | [Firebase](https://firebase.google.com/) (Auth, Firestore, Realtime DB) | Kimlik doğrulama, bulut kütüphane eşitleme ve dinleme odaları |
| **Liste Performansı** | [@shopify/flash-list](https://shopify.github.io/flash-list/) | Bellek dostu, yüksek FPS liste renderlama |
| **Ses & Oynatıcı** | `expo-audio` & `expo-file-system` | Ses işleme, çevrimdışı depolama ve akış |
| **Animasyonlar** | `react-native-reanimated` & `gesture-handler` | Akıcı gesture ve 60 FPS geçiş efektleri |

---

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
- **Node.js:** v18.x veya üzeri
- **Paket Yöneticisi:** npm veya yarn
- **Expo CLI:** `npm install -g expo-cli` (opsiyonel)
- **Test Cihazı / Emülatör:** Android Studio (Emülatör) veya fiziksel cihazda **Expo Go** uygulaması

### 1. Depoyu Klonlayın
```bash
git clone https://github.com/kullaniciadi/voxen.git
cd voxen
```

### 2. Bağımlılıkları Yükleyin
```bash
npm install
```

### 3. Ortam Değişkenleri (Firebase Yapılandırması)
Firebase yapılandırması varsayılan olarak `src/config/firebase.ts` içerisinde tanımlıdır. Kendi Firebase projenizi kullanmak isterseniz bu dosyadaki ayarları kendi proje anahtarlarınızla güncelleyebilirsiniz:
- Firebase Console üzerinde **Authentication** (Email/Password & Anonymous)
- **Cloud Firestore** ve **Realtime Database** servislerini aktif edin.

### 4. Uygulamayı Başlatın
```bash
# Geliştirici sunucusunu başlat
npm start

# Doğrudan Android emülatöründe çalıştırmak için
npm run android

# Web tarayıcısında önizlemek için
npm run web
```

---

## 📂 Proje Yapısı

```text
voxen/
├── assets/                       # Logo, ikonlar ve görsel varlıklar
├── src/
│   ├── components/               # Yeniden kullanılabilir UI bileşenleri
│   │   ├── AudioEngine.tsx       # Ses motoru ve oynatma yöneticisi
│   │   ├── FullPlayerModal.tsx   # Tam ekran müzik çalar
│   │   ├── MiniPlayer.tsx        # Alt çubuk mini oynatıcı
│   │   ├── ListeningRoomModal.tsx# Birlikte dinleme odaları
│   │   ├── LyricsModal.tsx       # Senkronize şarkı sözleri
│   │   └── ...
│   ├── config/                   # Firebase ve sistem yapılandırmaları
│   ├── constants/                # Renk paletleri, temalar ve sabitler
│   ├── models/                   # TypeScript veri modelleri ve tipleri
│   ├── services/                 # Servis katmanı
│   │   ├── youtube/              # YouTube Music / Streaming servisleri
│   │   ├── offlineDownloadService.ts # Çevrimdışı indirme motoru
│   │   ├── audioCacheService.ts  # Ses önbellekleme
│   │   └── firebase/             # Bulut ve sosyal servisler
│   ├── store/                    # Zustand global durum depoları
│   │   ├── musicStore.ts         # Oynatıcı, sıra ve şarkı durumu
│   │   ├── authStore.ts          # Kullanıcı kimlik doğrulama
│   │   ├── libraryStore.ts       # Beğenilenler ve yerel listeler
│   │   └── socialStore.ts        # Dinleme odaları ve arkadaşlar
│   ├── utils/                    # Yardımcı fonksiyonlar, formatlayıcılar ve temalar
│   └── views/                    # Ana ekranlar
│       ├── HomeView.tsx          # Keşif ve ana sayfa
│       ├── SearchView.tsx        # Gelişmiş arama
│       ├── LibraryView.tsx       # Kütüphane ve indirilenler
│       └── ProfileView.tsx       # Profil ve ayarlar
├── App.tsx                       # Ana uygulama kökü ve navigasyon çatısı
├── app.json                      # Expo yapılandırması
├── package.json                  # Proje bağımlılıkları ve betikleri
└── tsconfig.json                 # TypeScript derleyici yapılandırması
```

---

## 🤝 Katkıda Bulunma

Projeye katkıda bulunmaktan mutluluk duyarız! Katkı sağlamak için:

1. Bu depoyu Fork'layın (`Fork` butonuna tıklayın).
2. Yeni bir özellik dalı oluşturun:
   ```bash
   git checkout -b feature/yeni-ozellik
   ```
3. Değişikliklerinizi commit edin:
   ```bash
   git commit -m "feat: Yeni harika özellik eklendi"
   ```
4. Dalınızı uzak sunucuya gönderin:
   ```bash
   git push origin feature/yeni-ozellik
   ```
5. Bir **Pull Request (PR)** açın.

---

## 📄 Lisans

Bu proje **GPL-3.0** lisansı ile lisanslanmıştır. Detaylar için [LICENSE](./LICENSE) dosyasına göz atabilirsiniz.

<br/>

<div align="center">
  <sub>Voxen ekibi tarafından tutkuyla geliştirildi. ❤️</sub>
</div>
