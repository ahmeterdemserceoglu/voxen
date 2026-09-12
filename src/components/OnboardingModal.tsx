import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Animated,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useUiStore } from '../store/uiStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLibraryStore } from '../store/libraryStore';
import { tasteProfileService } from '../services/recommendations/tasteProfileService';
import { YouTubeService } from '../services/youtubeService';
import { accountSession } from '../services/auth/accountStorage';
import { Colors } from '../constants/theme';
import type { SerializedArtist } from '../models';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export interface TasteArtist {
  id: string;
  name: string;
  genre: string;
  thumbnailUrl: string;
}

const GENRES = [
  'Türkçe Rap',
  'Türkçe Pop',
  'Hip-Hop',
  'Rock',
  'Alternatif',
  'Arabesk',
  'Akustik',
  'R&B',
  'Elektronik',
  'Metal',
  'Caz',
  'Türk Halk Müziği',
  '90lar Pop',
  'Klasik',
  'Lo-Fi',
];

export const POPULAR_ARTISTS_CATALOGUE: TasteArtist[] = [
  // Türkçe Rap
  { id: 'uzi', name: 'Uzi', genre: 'Türkçe Rap', thumbnailUrl: 'https://lh3.googleusercontent.com/GHg0YL-jpPfatQndSUXJy5xTBONrj81V58nblKNlxzpMsEUgwz1z9Zb_sUz4fubKpcenGm37qqqReh8=w500-h500-p-l90-rj' },
  { id: 'motive', name: 'Motive', genre: 'Türkçe Rap', thumbnailUrl: 'https://yt3.googleusercontent.com/a41s6Q46KVgH97DlnrXD1FTB2TOuPCX2DTH0g7lrYwnSTOiESDakHKVQAhkf3vYZTAiqhHrwRLiG3T8=w500-h500-p-l90-rj' },
  { id: 'ceza', name: 'Ceza', genre: 'Türkçe Rap', thumbnailUrl: 'https://yt3.googleusercontent.com/pKGBl8B8a3fbhwlABpvLISaoRED5vwEwQ5-tgB1xCWdWhXZNIWGBUEQtAV8G-zTiU55kxQ3w8UUfeSY=w500-h500-l90-rj' },
  { id: 'sagopa', name: 'Sagopa Kajmer', genre: 'Türkçe Rap', thumbnailUrl: 'https://yt3.googleusercontent.com/RkDB51_woHhLwOyTiX0LYY5oUoyj6Y_s8ygvK_mjigXXn7QLU4lYr9ThHMmMWQZtsBbaZ_M_CBB1QrYrcA=w500-h500-l90-rj' },
  { id: 'ezhel', name: 'Ezhel', genre: 'Türkçe Rap', thumbnailUrl: 'https://yt3.googleusercontent.com/Tuov3L_8qT1wXeIZttRtwDbTnDlDbN1UtjThK6T_oWI48L4HFIu5JxkA1rkyInrvajT6lfaTBJJkHnlPsg=w500-h500-l90-rj' },
  { id: 'sefo', name: 'Sefo', genre: 'Türkçe Rap', thumbnailUrl: 'https://yt3.googleusercontent.com/e9pB8SMv0_NER56SZUqrBmCcxCcuVdaZw2Kbn7g9_jqTXTxdTtBY8mlSm59EE8qbmM78aD7dkqVUdt5BUg=w500-h500-l90-rj' },
  { id: 'lvbelc5', name: 'Lvbel C5', genre: 'Türkçe Rap', thumbnailUrl: 'https://lh3.googleusercontent.com/WF0wZI8NWAPayLj6IDeXTReqDorWjhpYE8nFeOxcLLizhTBCUpwP3WFSF3y4LBwy6H0SPsEcoKh_NzBP=w500-h500-p-l90-rj' },
  { id: 'blok3', name: 'Blok3', genre: 'Türkçe Rap', thumbnailUrl: 'https://yt3.googleusercontent.com/fZRHjMA25CYpXeAy78qipMhlidZMA6ZpOGYBz3W6iH2Wa-u2lXSK21mCh3OA3XCgsZn2yUFoXw=w500-h500-l90-rj-dcJRaW7REL' },
  { id: 'ati242', name: 'Ati242', genre: 'Türkçe Rap', thumbnailUrl: 'https://lh3.googleusercontent.com/IxSioCzCYoUQIXyZIA2FPNcfftZj92adKKvWALoy7bLdstQwMJ7W1q4koxEOl-k5GdX_8ffhmsHjTxDy=w500-h500-p-l90-rj' },
  { id: 'saniser', name: 'Şanışer', genre: 'Türkçe Rap', thumbnailUrl: 'https://yt3.googleusercontent.com/HHaViOAE6lZrc1JFQ8OyfVNTApf5-PNnLTuQ_h4b9wkwfzU6YWf2FBPzaQz_K2kK8WSB9MJiLK7iqm0=w500-h500-p-l90-rj' },
  { id: 'no1', name: 'No.1', genre: 'Türkçe Rap', thumbnailUrl: 'https://yt3.googleusercontent.com/vsQJ209NEam14cmhKvtDlKhb9yXj9KI0wU5-JygZqvDH7GJo4Kllg7pHcAdu1OSF4zM3lfRAkw=w500-h500-l90-rj' },
  { id: 'cakal', name: 'Çakal', genre: 'Türkçe Rap', thumbnailUrl: 'https://lh3.googleusercontent.com/pqMmmDj2-9bfFj9qpfbYvXOg6ozC_bxIRtXDZNACnLrg3CsuhVpRwhzFcoluemoKRJIPvzFdNK8UouQ=w500-h500-p-l90-rj' },

  // Pop & Alternatif
  { id: 'sezen-aksu', name: 'Sezen Aksu', genre: 'Türkçe Pop', thumbnailUrl: 'https://lh3.googleusercontent.com/4lUgniUT8z0CeQSZui-1eagl8S9tIF3G70v0AcmeYpUonl-PC8LuDbcSdfp5yYqOm-sFqlDsZFDh1xoU=w500-h500-p-l90-rj' },
  { id: 'tarkan', name: 'Tarkan', genre: 'Türkçe Pop', thumbnailUrl: 'https://lh3.googleusercontent.com/gMYM_o7yOSZLCrRi6ibDG4A3j-PHZJ_QW3SMnDpolGsYtVtVUp7i6oGGkcc3JC_uVRGEJuR8sUhlpwg=w500-h500-p-l90-rj' },
  { id: 'mabel-matiz', name: 'Mabel Matiz', genre: 'Türkçe Pop', thumbnailUrl: 'https://yt3.googleusercontent.com/tTLYLHHaS1oE8WEFPr82mweOp-msHHUrn-q-rg1ZGlEl3QGEbIC2xp4c6Zco4GcgW4-HtRedo9GnfyA=w500-h500-p-l90-rj' },
  { id: 'emir-can-igrek', name: 'Emir Can İğrek', genre: 'Alternatif', thumbnailUrl: 'https://yt3.googleusercontent.com/jxGV4RSrtzM5yFceZjlcgTsBz-0lM9GrJ7kQbWo6wDdunG5E16JyDA8bFGDEE7c9xiQMDfD64noqtBuS=w500-h500-p-l90-rj' },
  { id: 'edis', name: 'Edis', genre: 'Türkçe Pop', thumbnailUrl: 'https://yt3.googleusercontent.com/AsCUgCXqLugmiaayqz-liv2-kltrSGm9V9osZubhke9ICp9kGM8W4czgs3d0GDjJlMnroajHRLRaGK8=w500-h500-p-l90-rj' },
  { id: 'simge', name: 'Simge', genre: 'Türkçe Pop', thumbnailUrl: 'https://yt3.googleusercontent.com/uVRq0oOzBQUIfGex4wvYnybBUX_NXAh--wL24g8JrSb67QbY3GaAIV6nhDZjZPdV8Zn1zUjnbQ=w500-h500-l90-rj' },
  { id: 'zeynep-bastik', name: 'Zeynep Bastık', genre: 'Türkçe Pop', thumbnailUrl: 'https://lh3.googleusercontent.com/kI5QC9tGD5Xjl5uW0xBzkwL8gRD9O1s5QLt1t4hhR_0CepCQwTDvagF2dHTHTjNS2MpblSILaZs4QRah=w500-h500-p-l90-rj' },
  { id: 'madrigal', name: 'Madrigal', genre: 'Alternatif', thumbnailUrl: 'https://yt3.googleusercontent.com/ANfD3l_jRc-rkJQcTz9o98gvaLDy_-nayPJU-tagt7QOhQHYf_NWAAy2nStylzWLOkgiHiiQEQ=w500-h500-l90-rj' },
  { id: 'yuzyuzeyken', name: 'Yüzyüzeyken Konuşuruz', genre: 'Alternatif', thumbnailUrl: 'https://yt3.googleusercontent.com/clg8i5bXWhL8UqVUOD2qJ9oIdksrLYOoNh0SJtKksyiRuYr2WwKnf8R29eeTDi4Da_7-bY1OG1qtmyg=w500-h500-p-l90-rj' },
  { id: 'dolu-kadehi', name: 'Dolu Kadehi Ters Tut', genre: 'Alternatif', thumbnailUrl: 'https://lh3.googleusercontent.com/DnDsBm6Ysp8sYZZ8qakVPOhaBik8saTnw7AZ9hsHfPEiMTXMZ_PjH7Y-xJGyn6l5hGXwZRwsYaDo9g=w500-h500-p-l90-rj' },
  { id: 'dedubluman', name: 'Dedublüman', genre: 'Alternatif', thumbnailUrl: 'https://lh3.googleusercontent.com/btbfti7VoIs5QJj-MQWQVDAm5ks_DDdHjYQ7fo-cIb2a52z22MX0rGo4iecaQm2Aue8GUGxVt_1KGA=w500-h500-p-l90-rj' },

  // Rock & Anadolu Rock
  { id: 'duman', name: 'Duman', genre: 'Rock', thumbnailUrl: 'https://lh3.googleusercontent.com/DfowsipT1GE6GGzFrj4vbg6J6T199WrDgWGSBqQsYwCiaVIze-GN0EfMaXP1pVGnX8bE3CJmisceRW8=w500-h500-p-l90-rj' },
  { id: 'manga', name: 'Manga', genre: 'Rock', thumbnailUrl: 'https://yt3.googleusercontent.com/zMjbLS8cXMCqGSb6NyJJO9p1ddJkZsDW1XPYZk0YPOWpCLMeWoy0aLT-IHnv6oQAvR1rGEwxetc=w500-h500-l90-rj' },
  { id: 'mor-ve-otesi', name: 'Mor ve Ötesi', genre: 'Rock', thumbnailUrl: 'https://lh3.googleusercontent.com/OlL0dV32N44qtTOEm9ZFZ_hufKPtDAVSRD-5-8qni1sve6YMVXhCPixiE7RYrbcZ55XBj6Y4InSx2mo=w500-h500-p-l90-rj' },
  { id: 'teoman', name: 'Teoman', genre: 'Rock', thumbnailUrl: 'https://lh3.googleusercontent.com/T5WtxL5CF-gCNuoLZWknhI0DILDBFc7yls_Xe_9RWobNCE61qrKqcaOqRd_fEm6pgt3XAAQ_eF8TJzk=w500-h500-p-l90-rj' },
  { id: 'sebnem-ferah', name: 'Şebnem Ferah', genre: 'Rock', thumbnailUrl: 'https://yt3.ggpht.com/ytc/AIdro_mE9nPZ4hJaIGod-hCM6GaEr35C6cvLi6ZETJRv73j44Fg=w500-h500-l90-rj' },
  { id: 'baris-manco', name: 'Barış Manço', genre: 'Rock', thumbnailUrl: 'https://yt3.googleusercontent.com/RkDB51_woHhLwOyTiX0LYY5oUoyj6Y_s8ygvK_mjigXXn7QLU4lYr9ThHMmMWQZtsBbaZ_M_CBB1QrYrcA=w500-h500-l90-rj' },
  { id: 'cem-karaca', name: 'Cem Karaca', genre: 'Rock', thumbnailUrl: 'https://lh3.googleusercontent.com/UhPW_7ulllVR-Qw_IYjke8B4DsNFVQir6ye1QHTwsdHaDpRor-fwpNF2oEPYj5iser00YPmPXRlSAQ=w500-h500-p-l90-rj' },

  // Arabesk & Özgün
  { id: 'muslum-gurses', name: 'Müslüm Gürses', genre: 'Arabesk', thumbnailUrl: 'https://yt3.googleusercontent.com/PQGaomPUxRdsB9HozFSya75u1GmJ4Nasgl-4m9LqFWeERvMYJzHzU_aj1Hd4wK0NCWZ-Wc5s4bxlVYhs=w500-h500-l90-rj' },
  { id: 'yildiz-tilbe', name: 'Yıldız Tilbe', genre: 'Arabesk', thumbnailUrl: 'https://yt3.googleusercontent.com/yePEa167f6C9ix6hL7lWtsqUJ82ZTzTPFGftVeBwKocbRWQdkWXGWqIGeZ-HJ95mniPd4q9QjVPdz8SE=w500-h500-l90-rj' },
  { id: 'ahmet-kaya', name: 'Ahmet Kaya', genre: 'Özgün', thumbnailUrl: 'https://lh3.googleusercontent.com/0K2rMAU4jAmGYr2_Xewr72NzdHHH5GECGsbgzWKOCjL83vBf4Wvf9p_71Ui-j4NKZAe1AR9ugliThVjD=w500-h500-p-l90-rj' },
  { id: 'azer-bulbul', name: 'Azer Bülbül', genre: 'Arabesk', thumbnailUrl: 'https://yt3.googleusercontent.com/Yon5nvgCQ3i7QVX4tObN_RwPz49-u_f5toTxtiPmtMeXeury2fvvYvC3stP2mLUzxeaemTUDnlsptvk=w500-h500-l90-rj' },

  // Global
  { id: 'the-weeknd', name: 'The Weeknd', genre: 'Global', thumbnailUrl: 'https://lh3.googleusercontent.com/U-SAmNOu4TynE818gLCfKsuHZ0U5YNEtO9mrjSI9WCCKERs98LzrCal5kajBBTQNwdcisoB2Bn-pHp4=w500-h500-p-l90-rj' },
  { id: 'travis-scott', name: 'Travis Scott', genre: 'Global', thumbnailUrl: 'https://yt3.googleusercontent.com/r9k_FpAswxhQnl_cudiaT2ocWFccR6SzEFXgZ9a12iR5eDPSILlIL2EQewyQ-yYSt1JFyH1pqnoBXxs=w500-h500-p-l90-rj' },
  { id: 'eminem', name: 'Eminem', genre: 'Global', thumbnailUrl: 'https://lh3.googleusercontent.com/JFI6JZrS-Lco4UdpqDfHY5Wgwy51VXWxmNdI7bCBU5CDlIpN6WWyisZ7MGlpjbrxEGYMFpsqoR_UwcE=w500-h500-p-l90-rj' },
  { id: 'billie-eilish', name: 'Billie Eilish', genre: 'Global', thumbnailUrl: 'https://lh3.googleusercontent.com/tQC4rOL6xz6FhmFr0ggQExxyGbYSOsyveXVSnPBh2WjEyIzQ9pMHablLJ-0GlMBrLBlBrbWQGmzrV6KN=w500-h500-p-l90-rj' },
  { id: 'dua-lipa', name: 'Dua Lipa', genre: 'Global', thumbnailUrl: 'https://lh3.googleusercontent.com/aFx8s1fTuelgxONGbezmTG0EKR8r82uB5H-Q6ZJtssyCWLJWF8GfZNr4tHo84sXdFCPBKrA4R6zXOss=w500-h500-p-l90-rj' },
  { id: 'arctic-monkeys', name: 'Arctic Monkeys', genre: 'Global', thumbnailUrl: 'https://yt3.googleusercontent.com/kbPRnnOmWPXIb35ygxKvXt2a_745AVUkAUeFMqOUxbKx8T_I0f1JUfK3G43-_xUldK16-KrU2cj43i0=w500-h500-p-l90-rj' },
];

export const OnboardingModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { activeModal, closeModal } = useUiStore();
  const isOpen = activeModal === 'onboarding';

  const { preferredGenres, onboardingCompleted, updateSettings } = useSettingsStore();
  const { followedArtists, followArtist, unfollowArtist } = useLibraryStore();

  const [activeTab, setActiveTab] = useState<'genres' | 'artists'>('artists');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<TasteArtist[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenreFilter, setSelectedGenreFilter] = useState<string>('Tümü');
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineResults, setOnlineResults] = useState<TasteArtist[]>([]);

  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef(false);
  fullScreenRef.current = isFullScreen;
  const defaultHeight = SCREEN_HEIGHT * 0.88;
  const fullHeight = SCREEN_HEIGHT * 0.95;
  const heightAnim = useRef(new Animated.Value(defaultHeight)).current;

  // Initialize data when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsFullScreen(false);
      heightAnim.setValue(defaultHeight);

      // Prepopulate preferred genres
      setSelectedGenres(preferredGenres && preferredGenres.length > 0 ? preferredGenres : []);

      // Prepopulate followed artists from library & catalogue
      const initialArtists: TasteArtist[] = [];
      const followedNames = new Set(followedArtists.map((a) => a.name.toLowerCase()));

      POPULAR_ARTISTS_CATALOGUE.forEach((catArtist) => {
        if (followedNames.has(catArtist.name.toLowerCase())) {
          initialArtists.push(catArtist);
        }
      });

      // Also include any custom followed artists from library
      followedArtists.forEach((fa) => {
        if (!initialArtists.some((a) => a.name.toLowerCase() === fa.name.toLowerCase())) {
          initialArtists.push({
            id: fa.id,
            name: fa.name,
            genre: 'Takip Edilen',
            thumbnailUrl: fa.thumbnailUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=240&h=240&fit=crop',
          });
        }
      });

      setSelectedArtists(initialArtists);

      // Direct to artists tab if user has previously set up their taste
      if (onboardingCompleted || (preferredGenres && preferredGenres.length > 0)) {
        setActiveTab('artists');
      } else {
        setActiveTab('genres');
      }

      setSearchQuery('');
      setOnlineResults([]);
    }
  }, [isOpen]);

  const toggleFullScreen = (toFull: boolean) => {
    setIsFullScreen(toFull);
    Animated.spring(heightAnim, {
      toValue: toFull ? fullHeight : defaultHeight,
      useNativeDriver: false,
      friction: 8,
      tension: 50,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 8,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -30) {
          toggleFullScreen(true);
        } else if (gestureState.dy > 60) {
          if (fullScreenRef.current) {
            toggleFullScreen(false);
          } else {
            closeModal();
          }
        }
      },
    })
  ).current;

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const isArtistSelected = (artistName: string) => {
    return selectedArtists.some((a) => a.name.toLowerCase() === artistName.toLowerCase());
  };

  const toggleArtist = (artist: TasteArtist) => {
    setSelectedArtists((prev) => {
      const exists = prev.some((a) => a.name.toLowerCase() === artist.name.toLowerCase());
      if (exists) {
        return prev.filter((a) => a.name.toLowerCase() !== artist.name.toLowerCase());
      } else {
        return [...prev, artist];
      }
    });
  };

  const handleOnlineSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchingOnline(true);
    try {
      const directArtists = await YouTubeService.searchArtists(searchQuery.trim());
      if (directArtists.length > 0) {
        setOnlineResults(directArtists);
      } else {
        const tracks = await YouTubeService.search(searchQuery.trim());
        const uniqueArtists = new Map<string, TasteArtist>();
        tracks.forEach((t) => {
          const aName = t.artist || t.artistName;
          if (aName && !uniqueArtists.has(aName.toLowerCase())) {
            uniqueArtists.set(aName.toLowerCase(), {
              id: `yt_${t.id}`,
              name: aName,
              genre: 'YouTube Music',
              thumbnailUrl: t.thumbnail,
            });
          }
        });
        setOnlineResults(Array.from(uniqueArtists.values()));
      }
    } catch {
      // ignore search error
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const handleFinish = async () => {
    const epoch = accountSession.generation;
    // 1. Record selected genres into taste profile
    for (const g of selectedGenres) {
      if (!accountSession.isCurrent(epoch)) return;
      await tasteProfileService.record('PLAYLIST_ADD', undefined, g);
    }

    if (!accountSession.isCurrent(epoch)) return;
    const selectedIds = new Set(selectedArtists.map(artist => artist.id));
    for (const artist of useLibraryStore.getState().followedArtists) {
      if (!selectedIds.has(artist.id)) useLibraryStore.getState().unfollowArtist(artist.id);
    }
    // 2. Record and follow selected artists
    for (const a of selectedArtists) {
      if (!accountSession.isCurrent(epoch)) return;
      await tasteProfileService.record('ARTIST_FOLLOW', a.name);
      if (!accountSession.isCurrent(epoch)) return;
      followArtist({
        id: a.id,
        name: a.name,
        thumbnailUrl: a.thumbnailUrl,
      });
    }

    if (!accountSession.isCurrent(epoch)) return;
    // 3. Update app settings
    await updateSettings({
      preferredGenres: selectedGenres,
      onboardingCompleted: true,
    });

    closeModal();
  };

  // Filter artist catalogue
  const displayedArtists = React.useMemo(() => {
    let list = [...POPULAR_ARTISTS_CATALOGUE];

    // Add any selected artists not in default catalogue
    selectedArtists.forEach((sa) => {
      if (!list.some((a) => a.name.toLowerCase() === sa.name.toLowerCase())) {
        list.unshift(sa);
      }
    });

    // Add online results if searching
    if (onlineResults.length > 0) {
      onlineResults.forEach((oa) => {
        if (!list.some((a) => a.name.toLowerCase() === oa.name.toLowerCase())) {
          list.unshift(oa);
        }
      });
    }

    // Filter by genre tab
    if (selectedGenreFilter !== 'Tümü') {
      list = list.filter((a) => a.genre.toLowerCase().includes(selectedGenreFilter.toLowerCase()));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) => a.name.toLowerCase().includes(q) || a.genre.toLowerCase().includes(q)
      );
    }

    return list;
  }, [selectedArtists, onlineResults, selectedGenreFilter, searchQuery]);

  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={closeModal}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={closeModal}
        />

        <Animated.View style={[styles.sheet, { height: heightAnim }]}>
          {/* Top Bar with PanResponder */}
          <View {...panResponder.panHandlers} style={styles.topBar}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Müzik Zevkini Güncelle</Text>
                <Text style={styles.subtitle}>
                  Sana özel önerileri ve Günlük Karışım'ları şekillendir
                </Text>
              </View>
            </View>

            {/* Tab Switcher */}
            <View style={styles.tabSwitcher}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'artists' && styles.tabBtnActive]}
                onPress={() => setActiveTab('artists')}
              >
                <Ionicons
                  name="people"
                  size={16}
                  color={activeTab === 'artists' ? '#FFFFFF' : Colors.textMuted}
                />
                <Text style={[styles.tabBtnText, activeTab === 'artists' && styles.tabBtnTextActive]}>
                  Sanatçılar ({selectedArtists.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'genres' && styles.tabBtnActive]}
                onPress={() => setActiveTab('genres')}
              >
                <Ionicons
                  name="color-palette"
                  size={16}
                  color={activeTab === 'genres' ? '#FFFFFF' : Colors.textMuted}
                />
                <Text style={[styles.tabBtnText, activeTab === 'genres' && styles.tabBtnTextActive]}>
                  Müzik Türleri ({selectedGenres.length})
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Content Area */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === 'genres' ? (
              <View style={styles.genresSection}>
                <Text style={styles.sectionHeaderTitle}>Sevdiğin Türleri Seç</Text>
                <Text style={styles.sectionHeaderSub}>
                  Seçtiğin türler radyo mikslerini ve ana sayfa akışını etkiler.
                </Text>

                <View style={styles.chipGrid}>
                  {GENRES.map((genre) => {
                    const isSelected = selectedGenres.includes(genre);
                    return (
                      <TouchableOpacity
                        key={genre}
                        style={[styles.chip, isSelected && styles.chipActive]}
                        onPress={() => toggleGenre(genre)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                          {genre}
                        </Text>
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={16} color="#FFF" style={{ marginLeft: 6 }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.artistsSection}>
                {/* Search Bar */}
                <View style={styles.searchBarWrap}>
                  <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Sanatçı ara..."
                    placeholderTextColor={Colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={handleOnlineSearch}
                    returnKeyType="search"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setSearchQuery('');
                        setOnlineResults([]);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Genre Filter Horizontal Scroll */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                  {['Tümü', 'Rap', 'Pop', 'Rock', 'Alternatif', 'Arabesk', 'Global'].map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.filterChip, selectedGenreFilter === f && styles.filterChipActive]}
                      onPress={() => setSelectedGenreFilter(f)}
                    >
                      <Text style={[styles.filterChipText, selectedGenreFilter === f && styles.filterChipTextActive]}>
                        {f}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Online Search trigger if query entered */}
                {searchQuery.trim().length > 1 && (
                  <TouchableOpacity
                    style={styles.onlineSearchBtn}
                    onPress={handleOnlineSearch}
                    disabled={isSearchingOnline}
                  >
                    {isSearchingOnline ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={16} color={Colors.primary} />
                        <Text style={styles.onlineSearchText}>
                          "{searchQuery}" için YouTube Music'te sanatçı ara
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {/* Artists Grid */}
                <View style={styles.artistGrid}>
                  {displayedArtists.map((artist) => {
                    const selected = isArtistSelected(artist.name);
                    return (
                      <TouchableOpacity
                        key={`${artist.id}_${artist.name}`}
                        style={styles.artistCard}
                        onPress={() => toggleArtist(artist)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.avatarWrapper, selected && styles.avatarWrapperSelected]}>
                          <Image
                            source={{ uri: artist.thumbnailUrl }}
                            style={styles.avatarImg}
                            contentFit="cover"
                            transition={200}
                          />
                          {selected && (
                            <View style={styles.checkBadge}>
                              <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                            </View>
                          )}
                        </View>
                        <Text style={[styles.artistCardName, selected && styles.artistCardNameSelected]} numberOfLines={1}>
                          {artist.name}
                        </Text>
                        <Text style={styles.artistCardGenre} numberOfLines={1}>
                          {artist.genre}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Bottom Action Button */}
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleFinish} activeOpacity={0.85}>
              <Text style={styles.saveBtnText}>
                {activeTab === 'genres' && selectedGenres.length === 0
                  ? 'Atla ve Tamamla'
                  : 'Müzik Zevkimi Kaydet'}
              </Text>
              <Ionicons name="sparkles" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: '#141416',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  topBar: {
    paddingTop: 12,
    width: '100%',
    paddingHorizontal: 20,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  genresSection: {
    paddingTop: 8,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  sectionHeaderSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 16,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  artistsSection: {
    paddingTop: 4,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    padding: 0,
  },
  filterScroll: {
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.18)',
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  onlineSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.12)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.25)',
  },
  onlineSearchText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  artistGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  artistCard: {
    width: (Dimensions.get('window').width - 64) / 3,
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.card,
    position: 'relative',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarWrapperSelected: {
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
  },
  checkBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#141416',
  },
  artistCardName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DDDDDD',
    textAlign: 'center',
  },
  artistCardNameSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  artistCardGenre: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    backgroundColor: '#141416',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

