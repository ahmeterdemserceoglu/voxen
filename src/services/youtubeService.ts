/**
 * Voxen YouTube Music Service
 * Directly communicates with YouTube Music InnerTube endpoints (WEB_REMIX / ANDROID)
 * Ported from Metrolist Kotlin Innertube engine with zero ads.
 */

import { NativeModules, Platform } from 'react-native';
import type { AudioSource } from 'expo-audio';
import { networkFetch } from './network/networkService';
import { albumFromRuns, matchingSongTitle } from './youtube/youtubeTrackMetadata';
import { findRelatedEndpoint, parseWatchTracks, parseCurrentTrackAlbum } from './youtube/youtubeWatchParser';
import type { AlbumSummary } from '../models/Track';
import type { Track } from '../models';
import { useSettingsStore } from '../store/settingsStore';
import { albumArtist, albumReleaseType, findBrowseHeader, isAlbumBrowseId, parseAlbumSearchResults } from './youtube/youtubeAlbumParser';

export type TrackItem = Track;

export interface HomeSection {
  title: string;
  items: TrackItem[];
}

export interface ResolvedStreamResult {
  uri: string;
  headers?: Record<string, string>;
  client?: string;
  bitrate?: number;
  loudnessDb?: number;
}

export interface AlbumItem {
  id: string;
  title: string;
  artist: string;
  year?: string;
  thumbnailUrl: string;
  releaseType?: 'Albüm' | 'Single' | 'EP';
}

export interface ArtistReleaseItem {
  id: string;
  title: string;
  subtitle?: string;
  year?: string;
  thumbnailUrl: string;
  browseId?: string;
}

export interface SimilarArtistItem {
  id: string;
  name: string;
  subscribers?: string;
  thumbnailUrl: string;
  browseId?: string;
}

export interface ImportedPlaylistResult {
  id: string;
  title: string;
  author?: string;
  thumbnailUrl?: string;
  tracks: TrackItem[];
  year?: string;
  releaseType?: AlbumItem['releaseType'];
}

export interface ArtistProfileDetails {
  name: string;
  thumbnailUrl: string;
  bannerUrl?: string;
  description?: string;
  monthlyListeners?: string;
  subscriberCount?: string;
  tracks: TrackItem[];
  albums?: ArtistReleaseItem[];
  singles?: ArtistReleaseItem[];
  similarArtists?: SimilarArtistItem[];
}

const YTM_BASE = 'https://music.youtube.com/youtubei/v1';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Referer': 'https://music.youtube.com/',
  'X-YouTube-Client-Name': '67',
  'X-YouTube-Client-Version': '1.20240401.01.00',
};

const DEFAULT_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20240401.01.00',
    hl: 'tr',
    gl: 'TR',
  },
};

export class YouTubeService {
  /**
   * Search YouTube Music for songs and artists
   */
  static async search(query: string): Promise<TrackItem[]> {
    if (!query.trim()) return [];

    try {
      const response = await networkFetch(`${YTM_BASE}/search?prettyPrint=false`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          context: DEFAULT_CONTEXT,
          query,
          params: 'EgWKAQIIAWoKEAMQBBAJEAoQBQ%3D%3D', // Pure songs filter
        }),
      });

      if (!response.ok) {
        return this.fallbackSearch(query);
      }

      const data = await response.json();
      const tracks: TrackItem[] = [];

      const sectionList =
        data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ||
        data.contents?.sectionListRenderer?.contents ||
        [];

      for (const section of sectionList) {
        const shelf = section.musicShelfRenderer;
        if (!shelf?.contents) continue;

        for (const item of shelf.contents) {
          const renderer = item.musicResponsiveListItemRenderer;
          if (!renderer) continue;

          const flexColumns = renderer.flexColumns || [];
          const title =
            flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Bilinmeyen Şarkı';
          const artistRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          const artist = artistRuns[0]?.text || artistRuns.map((r: any) => r.text).join('') || 'Sanatçı';

          let playCount: string | undefined;
          for (let i = 1; i < flexColumns.length; i++) {
            const runs = flexColumns[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
            for (const r of runs) {
              if (/dinlendi|görüntüleme|views|stream/i.test(r.text)) {
                playCount = r.text.trim();
                break;
              }
            }
            if (playCount) break;
          }

          const thumbnails =
            renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          const thumbnail =
            thumbnails[thumbnails.length - 1]?.url ||
            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500';

          const videoId =
            renderer.playlistItemData?.videoId ||
            renderer.navigationEndpoint?.watchEndpoint?.videoId ||
            flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

          const fixedDuration = renderer.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text;
          const durationText = fixedDuration || flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.slice(-1)[0]?.text;

          if (videoId) {
            const thumbLarge = thumbnail.replace(/=w\d+-h\d+/, '=w500-h500');
            tracks.push({
              id: videoId,
              videoId,
              title,
              artist,
              artistName: artist,
              artists: [{ name: artist }],
              album: albumFromRuns(flexColumns.flatMap((column: any) => column.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [])),
              thumbnail: thumbLarge,
              thumbnails: {
                small: thumbnail.replace(/=w\d+-h\d+/, '=w120-h120'),
                medium: thumbnail.replace(/=w\d+-h\d+/, '=w300-h300'),
                large: thumbLarge,
              },
              playCount,
              durationFormatted: durationText,
              explicit: /explicit/i.test(JSON.stringify(renderer.badges || [])) || /(\bexplicit\b|\[e\]|\(e\))/i.test(title),
              source: 'youtube',
            });
          }
        }
      }

      return tracks.length > 0 ? tracks.filter(t => useSettingsStore.getState().explicitContent || !t.explicit) : this.fallbackSearch(query);
    } catch (e) {
      console.warn('YTM search failed, trying fallback:', e);
      return this.fallbackSearch(query);
    }
  }

  /**
   * Fetch complete artist details, official profile, and top tracks with play counts directly from YouTube Music InnerTube
   */
  static async getArtistDetails(name: string): Promise<ArtistProfileDetails | null> {
    if (!name.trim()) return null;
    try {
      const searchRes = await fetch(`${YTM_BASE}/search?prettyPrint=false`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          context: DEFAULT_CONTEXT,
          query: name.trim(),
        }),
      });

      if (!searchRes.ok) return null;

      const data = await searchRes.json();
      const sectionList =
        data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ||
        data.contents?.sectionListRenderer?.contents ||
        [];

      let browseId: string | undefined;
      let artistName = name.trim();
      let thumbnailUrl = '';
      let monthlyListeners: string | undefined;

      for (const section of sectionList) {
        if (section.musicCardShelfRenderer) {
          const card = section.musicCardShelfRenderer;
          artistName = card.title?.runs?.[0]?.text || artistName;
          const thumb = card.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.pop()?.url;
          if (thumb) thumbnailUrl = thumb.replace(/=w\d+-h\d+/, '=w500-h500');
          browseId = card.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId;
          const sub = card.subtitle?.runs?.map((r: any) => r.text).join('') || '';
          const match =
            sub.match(/Aylık kitle:\s*([^•\n]+)/i) ||
            sub.match(/([0-9,.]+\s*(?:Mn|B|Mr|M|K)?\s*dinleyici)/i);
          if (match) {
            monthlyListeners = match[1].trim();
          }
          break;
        }

        if (section.musicShelfRenderer) {
          for (const item of section.musicShelfRenderer.contents || []) {
            const r = item.musicResponsiveListItemRenderer;
            const pageType =
              r?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
            if (pageType === 'MUSIC_PAGE_TYPE_ARTIST') {
              artistName =
                r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || artistName;
              const thumb = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.pop()?.url;
              if (thumb) thumbnailUrl = thumb.replace(/=w\d+-h\d+/, '=w500-h500');
              browseId = r.navigationEndpoint?.browseEndpoint?.browseId;
              break;
            }
          }
          if (browseId) break;
        }
      }

      let description: string | undefined;
      let subscriberCount: string | undefined;
      let rawTrackItems: any[] = [];
      let albums: ArtistReleaseItem[] = [];
      let singles: ArtistReleaseItem[] = [];
      let similarArtists: SimilarArtistItem[] = [];

      if (browseId) {
        try {
          const bRes = await fetch(`${YTM_BASE}/browse?prettyPrint=false`, {
            method: 'POST',
            headers: DEFAULT_HEADERS,
            body: JSON.stringify({ context: DEFAULT_CONTEXT, browseId }),
          });
          if (bRes.ok) {
            const bData = await bRes.json();
            const header =
              bData.header?.musicImmersiveHeaderRenderer || bData.header?.musicVisualHeaderRenderer;
            if (header) {
              description = header.description?.runs?.[0]?.text;
              subscriberCount =
                header.subscriptionButton?.subscribeButtonRenderer?.subscriberCountText?.runs?.[0]?.text;
              const headerThumb =
                header.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.pop()?.url;
              if (headerThumb && !thumbnailUrl) {
                thumbnailUrl = headerThumb.replace(/=w\d+-h\d+/, '=w500-h500');
              }
            }

            const bSections =
              bData.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
            const topShelf = bSections.find((s: any) => s.musicShelfRenderer)?.musicShelfRenderer;

            if (topShelf) {
              const bottomBrowseId = topShelf.bottomEndpoint?.browseEndpoint?.browseId;
              const bottomParams = topShelf.bottomEndpoint?.browseEndpoint?.params;

              if (bottomBrowseId) {
                try {
                  const plRes = await fetch(`${YTM_BASE}/browse?prettyPrint=false`, {
                    method: 'POST',
                    headers: DEFAULT_HEADERS,
                    body: JSON.stringify({
                      context: DEFAULT_CONTEXT,
                      browseId: bottomBrowseId,
                      params: bottomParams,
                    }),
                  });
                  if (plRes.ok) {
                    const plData = await plRes.json();
                    const plContents =
                      plData.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer?.contents || [];
                    if (plContents.length > 0) {
                      rawTrackItems = plContents
                        .map((i: any) => i.musicResponsiveListItemRenderer)
                        .filter(Boolean);
                    }
                  }
                } catch {
                  // ignore
                }
              }

              if (rawTrackItems.length === 0 && topShelf.contents) {
                rawTrackItems = topShelf.contents
                  .map((i: any) => i.musicResponsiveListItemRenderer)
                  .filter(Boolean);
              }
            }

            // Extract Albums, Singles & EPs, and Similar Artists carousels
            for (const s of bSections) {
              const c = s.musicCarouselShelfRenderer;
              if (!c) continue;
              const cTitle = c.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text || '';
              const parsedItems = (c.contents || [])
                .map((item: any) => {
                  const r = item.musicTwoRowItemRenderer;
                  if (!r) return null;
                  const itemTitle = r.title?.runs?.[0]?.text || '';
                  const sub = r.subtitle?.runs?.map((x: any) => x.text).join('') || '';
                  const thumb = r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.pop()?.url || '';
                  const bId = r.navigationEndpoint?.browseEndpoint?.browseId;
                  const yearMatch = sub.match(/\b(19\d\d|20\d\d)\b/);
                  return {
                    id: bId || itemTitle,
                    title: itemTitle,
                    subtitle: sub,
                    year: yearMatch ? yearMatch[1] : undefined,
                    thumbnailUrl: thumb.replace(/=w\d+-h\d+/, '=w500-h500'),
                    browseId: bId,
                  };
                })
                .filter(Boolean);

              if (/albüm|album/i.test(cTitle) && albums.length === 0) {
                albums = parsedItems;
              } else if (/single|ep/i.test(cTitle) && singles.length === 0) {
                singles = parsedItems;
              } else if (/benzer|similar/i.test(cTitle) && similarArtists.length === 0) {
                similarArtists = parsedItems.map((it: any) => ({
                  id: it.id,
                  name: it.title,
                  subscribers: it.subtitle,
                  thumbnailUrl: it.thumbnailUrl,
                  browseId: it.browseId,
                }));
              }
            }
          }
        } catch {
          // ignore
        }
      }

      const tracks: TrackItem[] = [];
      for (const r of rawTrackItems) {
        const flex = r.flexColumns || [];
        const title =
          flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text ||
          'Bilinmeyen Şarkı';
        const artistRuns = flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
        const trackArtist = artistRuns[0]?.text || artistName;

        let playCount: string | undefined;
        for (let i = 1; i < flex.length; i++) {
          const runs = flex[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          for (const run of runs) {
            if (/dinlendi|görüntüleme|views|stream/i.test(run.text)) {
              playCount = run.text.trim();
              break;
            }
          }
          if (playCount) break;
        }

        const duration =
          r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text ||
          artistRuns.slice(-1)[0]?.text;

        const thumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const thumb =
          thumbs[thumbs.length - 1]?.url?.replace(/=w\d+-h\d+/, '=w500-h500') ||
          thumbnailUrl ||
          'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500';

        const videoId =
          r.playlistItemData?.videoId ||
          r.navigationEndpoint?.watchEndpoint?.videoId ||
          flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

        if (videoId) {
          tracks.push({
            id: videoId,
            videoId,
            title,
            artist: trackArtist,
            artistName: trackArtist,
            artists: [{ name: trackArtist }],
            thumbnail: thumb,
            thumbnails: {
              small: thumb.replace(/=w\d+-h\d+/, '=w120-h120'),
              medium: thumb.replace(/=w\d+-h\d+/, '=w300-h300'),
              large: thumb,
            },
            playCount,
            durationFormatted: duration,
            explicit: /explicit/i.test(JSON.stringify(r.badges || [])) || /(\bexplicit\b|\[e\]|\(e\))/i.test(title),
            source: 'youtube',
          });
        }
      }

      return {
        name: artistName,
        thumbnailUrl: thumbnailUrl || tracks[0]?.thumbnail || '',
        description,
        monthlyListeners,
        subscriberCount,
        tracks,
        albums,
        singles,
        similarArtists,
      };
    } catch (e) {
      console.warn('getArtistDetails failed:', e);
      return null;
    }
  }

  /**
   * Fetch official artist profile directly from YouTube Music Innertube API
   */
  static async getArtistProfile(name: string): Promise<{ name: string; thumbnailUrl: string } | null> {
    const details = await this.getArtistDetails(name);
    if (details) {
      return {
        name: details.name,
        thumbnailUrl: details.thumbnailUrl,
      };
    }
    return null;
  }

  /**
   * Extract playlist ID from a YouTube / YouTube Music URL or raw ID
   */
  static extractPlaylistId(urlOrId: string): string | null {
    const trimmed = urlOrId.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    if (/^[a-zA-Z0-9_-]{8,}$/.test(trimmed) && !trimmed.includes('http') && !trimmed.includes('/')) {
      return trimmed;
    }
    return null;
  }

  /**
   * Fetch complete playlist details and track items from YouTube Music
   */
  static async getAlbum(query: string, browseId?: string): Promise<ImportedPlaylistResult | null> {
    const id = browseId || (await this.searchAlbums(query))[0]?.id;
    if (!id || !isAlbumBrowseId(id)) return null;
    return this.getPlaylist(id, true);
  }

  static async getPlaylist(urlOrId: string, album = false): Promise<ImportedPlaylistResult | null> {
    const playlistId = this.extractPlaylistId(urlOrId);
    if (!playlistId) return null;

    try {
      const browseId = album || playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;
      const response = await networkFetch(`${YTM_BASE}/browse?prettyPrint=false`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          context: DEFAULT_CONTEXT,
          browseId,
        }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      const twoCol = data.contents?.twoColumnBrowseResultsRenderer;
      const singleCol = data.contents?.singleColumnBrowseResultsRenderer;

      // Extract Header Info
      const header = findBrowseHeader(twoCol?.tabs?.[0]?.tabRenderer?.content)
        || findBrowseHeader(singleCol?.tabs?.[0]?.tabRenderer?.content)
        || findBrowseHeader(data.header);
      const title = header?.title?.runs?.map((run: any) => run.text || '').join('') || 'İçe Aktarılan Çalma Listesi';
      const subtitle = header?.subtitle?.runs || [];
      const author = album ? albumArtist(header?.straplineTextOne?.runs || subtitle) || undefined
        : header?.straplineTextOne?.runs?.[0]?.text || header?.subtitle?.runs?.[0]?.text;
      const year = subtitle.find((run: any) => /^\d{4}$/.test(run.text?.trim() || ''))?.text?.trim();
      const thumbs = header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      const thumbnailUrl = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : undefined;

      // Extract Track Items from Shelf
      const secContents = twoCol?.secondaryContents?.sectionListRenderer?.contents?.[0];
      const singleShelf = singleCol?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0];
      const shelf =
        secContents?.musicPlaylistShelfRenderer ||
        secContents?.musicShelfRenderer ||
        singleShelf?.musicPlaylistShelfRenderer ||
        singleShelf?.musicShelfRenderer;

      const findShelf = (node: any): any => {
        if (!node || typeof node !== 'object') return null;
        for (const key of ['musicPlaylistShelfRenderer', 'musicShelfRenderer', 'musicPlaylistShelfContinuation', 'musicShelfContinuation']) {
          if (node[key]) return node[key];
        }
        for (const child of Object.values(node)) { const found = findShelf(child); if (found) return found; }
        return null;
      };
      let page = shelf || findShelf(data);
      const items: any[] = [...(page?.contents || [])];
      const tokens = new Set<string>();
      while (page) {
        const token = page.continuations?.[0]?.nextContinuationData?.continuation
          || page.contents?.find((item: any) => item.continuationItemRenderer)?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
        if (!token) break;
        if (tokens.has(token) || tokens.size >= 100) throw new Error('Playlist continuation did not finish');
        tokens.add(token);
        const next = await networkFetch(`${YTM_BASE}/browse?continuation=${encodeURIComponent(token)}`, {
          method: 'POST', headers: DEFAULT_HEADERS,
          body: JSON.stringify({ context: DEFAULT_CONTEXT, continuation: token }),
        });
        if (!next.ok) throw new Error('Playlist page failed');
        const nextData = await next.json();
        page = findShelf(nextData);
        if (!page) {
          const actions = nextData.onResponseReceivedActions || nextData.onResponseReceivedEndpoints || [];
          const action = actions.find((x: any) => x.appendContinuationItemsAction)?.appendContinuationItemsAction;
          if (action) page = { contents: action.continuationItems };
        }
        if (!page) throw new Error('Invalid playlist page');
        items.push(...(page.contents || []));
      }
      const tracks: TrackItem[] = [];

      for (const item of items) {
        const renderer = item.musicResponsiveListItemRenderer;
        if (!renderer) continue;

        const flexColumns = renderer.flexColumns || [];
        const trackTitle =
          flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Bilinmeyen Şarkı';
        const artistRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
        const linkedArtists = artistRuns.filter((run: any) => run.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC'));
        const artist = linkedArtists.map((run: any) => run.text).join(', ') || (album ? author : undefined) || artistRuns[0]?.text || 'Sanatçı';

        const videoId =
          renderer.playlistItemData?.videoId ||
          flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

        if (!videoId) continue;

        const trackThumbs = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const thumbUrl = trackThumbs.length > 0 ? trackThumbs[trackThumbs.length - 1].url : thumbnailUrl || '';

        const fixedCols = renderer.fixedColumns || [];
        const durationFormatted =
          fixedCols[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text;

        let durationSeconds: number | undefined;
        if (durationFormatted && durationFormatted.includes(':')) {
          const parts = durationFormatted.split(':').map(Number);
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            durationSeconds = parts[0] * 60 + parts[1];
          } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
            durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          }
        }

        tracks.push({
          id: videoId,
          videoId,
          title: trackTitle,
          artist,
          artistName: artist,
          artists: [{ name: artist }],
          album: album ? { id: playlistId, title, artistName: author, artworkUrl: thumbnailUrl, year: year ? Number(year) : undefined } : albumFromRuns(flexColumns.flatMap((column: any) => column.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [])),
          thumbnail: thumbUrl,
          thumbnails: {
            small: thumbUrl.replace(/=w\d+-h\d+/, '=w120-h120'),
            medium: thumbUrl.replace(/=w\d+-h\d+/, '=w300-h300'),
            large: thumbUrl,
          },
          duration: durationSeconds,
          durationFormatted,
          explicit: /explicit/i.test(JSON.stringify(renderer.badges || [])) || /(\bexplicit\b|\[e\]|\(e\))/i.test(trackTitle),
          source: 'youtube',
        });
      }

      if (album && !header && tracks.length === 0) return null;

      return {
        id: playlistId,
        title,
        author,
        thumbnailUrl,
        ...(album ? { year, releaseType: albumReleaseType(subtitle) } : {}),
        tracks: [...new Map(tracks.filter(t => useSettingsStore.getState().explicitContent || !t.explicit).map(t => [t.id, t])).values()],
      };
    } catch (e) {
      console.warn('YouTubeService.getPlaylist error:', e);
      return null;
    }
  }

  /**
   * Search specifically for artists on YouTube Music
   */
  static async searchArtists(query: string): Promise<Array<{ id: string; name: string; genre: string; thumbnailUrl: string }>> {
    if (!query.trim()) return [];
    try {
      const response = await fetch(`${YTM_BASE}/search?prettyPrint=false`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          context: DEFAULT_CONTEXT,
          query: query.trim(),
        }),
      });

      if (!response.ok) return [];

      const data = await response.json();
      const results: Array<{ id: string; name: string; genre: string; thumbnailUrl: string }> = [];
      const sectionList =
        data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

      for (const section of sectionList) {
        if (section.musicCardShelfRenderer) {
          const card = section.musicCardShelfRenderer;
          const name = card.title?.runs?.[0]?.text;
          const thumb = card.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.pop()?.url;
          if (name && thumb) {
            results.push({
              id: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
              name,
              genre: 'Sanatçı',
              thumbnailUrl: thumb.replace(/=w\d+-h\d+/, '=w500-h500'),
            });
          }
        }
        if (section.musicShelfRenderer) {
          for (const item of section.musicShelfRenderer.contents || []) {
            const r = item.musicResponsiveListItemRenderer;
            const pageType =
              r?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
            if (pageType === 'MUSIC_PAGE_TYPE_ARTIST') {
              const name = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
              const thumb = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.pop()?.url;
              if (name && thumb && !results.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
                results.push({
                  id: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                  name,
                  genre: 'Sanatçı',
                  thumbnailUrl: thumb.replace(/=w\d+-h\d+/, '=w500-h500'),
                });
              }
            }
          }
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Search specifically for albums on YouTube Music
   */
  static async searchAlbums(query: string): Promise<AlbumItem[]> {
    if (!query.trim()) return [];
    const response = await networkFetch(`${YTM_BASE}/search?prettyPrint=false`, {
      method: 'POST', headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        context: DEFAULT_CONTEXT, query: query.trim(),
        params: 'EgWKAQIYAWoKEAMQBBAJEAoQBQ%3D%3D',
      }),
    });
    if (!response.ok) throw new Error('Albüm araması yüklenemedi');
    return parseAlbumSearchResults(await response.json());
  }

  /**
   * Search suggestions
   */
  static async getSuggestions(query: string): Promise<string[]> {
    if (!query.trim()) return [];
    try {
      const response = await fetch(`${YTM_BASE}/music/get_search_suggestions?prettyPrint=false`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          context: DEFAULT_CONTEXT,
          input: query,
        }),
      });

      if (!response.ok) return [];
      const data = await response.json();
      const suggestions: string[] = [];

      const contents =
        data.contents?.[0]?.searchSuggestionsSectionRenderer?.contents || [];

      for (const item of contents) {
        const runs = item.searchSuggestionRenderer?.suggestion?.runs || [];
        const text = runs.map((r: any) => r.text).join('');
        if (text) suggestions.push(text);
      }

      return suggestions;
    } catch {
      return [];
    }
  }

  static async getHomeFeed(): Promise<HomeSection[]> {
    try {
      const response = await networkFetch(`${YTM_BASE}/browse?prettyPrint=false`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          context: DEFAULT_CONTEXT,
          browseId: 'FEmusic_home',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const sectionList =
          data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

        const sections: HomeSection[] = [];

        for (const section of sectionList) {
          const shelf = section.musicCarouselShelfRenderer || section.musicShelfRenderer;
          if (!shelf) continue;

          const title = shelf.header?.musicCarouselShelfHeaderRenderer?.title?.runs?.[0]?.text ||
                        shelf.header?.musicShelfHeaderRenderer?.title?.runs?.[0]?.text;
          if (!title) continue;

          const items: TrackItem[] = [];
          const contents = shelf.contents || [];

          for (const item of contents) {
            const twoRow = item.musicTwoRowItemRenderer;
            const respList = item.musicResponsiveListItemRenderer;

            if (twoRow) {
              const itemTitle = twoRow.title?.runs?.[0]?.text || 'Bilinmeyen Şarkı';
              const artistRuns = twoRow.subtitle?.runs || [];
              const artist = artistRuns.map((r: any) => r.text).join('') || 'Sanatçı';
              const thumbs = twoRow.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
              const thumbUrl = thumbs[thumbs.length - 1]?.url?.replace(/=w\d+-h\d+/, '=w500-h500') || '';

              const videoId =
                twoRow.navigationEndpoint?.watchEndpoint?.videoId ||
                twoRow.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

              if (videoId && thumbUrl) {
                items.push({
                  id: videoId,
                  videoId,
                  title: itemTitle,
                  artist,
                  artistName: artist,
                  artists: [{ name: artist }],
                  thumbnail: thumbUrl,
                  thumbnails: {
                    small: thumbUrl.replace(/=w\d+-h\d+/, '=w120-h120'),
                    medium: thumbUrl.replace(/=w\d+-h\d+/, '=w300-h300'),
                    large: thumbUrl,
                  },
                  explicit: /(\bexplicit\b|\[e\]|\(e\))/i.test(itemTitle),
                  source: 'youtube',
                });
              }
            } else if (respList) {
              const flexColumns = respList.flexColumns || [];
              const itemTitle = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Bilinmeyen Şarkı';
              const artistRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
              const artist = artistRuns.map((r: any) => r.text).join('') || 'Sanatçı';
              const thumbs = respList.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
              const thumbUrl = thumbs[thumbs.length - 1]?.url?.replace(/=w\d+-h\d+/, '=w500-h500') || '';

              const videoId =
                respList.playlistItemData?.videoId ||
                respList.navigationEndpoint?.watchEndpoint?.videoId ||
                flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

              if (videoId && thumbUrl) {
                items.push({
                  id: videoId,
                  videoId,
                  title: itemTitle,
                  artist,
                  artistName: artist,
                  artists: [{ name: artist }],
                  thumbnail: thumbUrl,
                  thumbnails: {
                    small: thumbUrl.replace(/=w\d+-h\d+/, '=w120-h120'),
                    medium: thumbUrl.replace(/=w\d+-h\d+/, '=w300-h300'),
                    large: thumbUrl,
                  },
                  explicit: /(\bexplicit\b|\[e\]|\(e\))/i.test(itemTitle),
                  source: 'youtube',
                });
              }
            }
          }

          if (items.length > 0) {
            sections.push({ title, items });
          }
        }

        if (sections.length > 0) {
          return sections;
        }
      }
    } catch (e) {
      console.warn('Native FEmusic_home browse request failed, falling back to dynamic search sections:', e);
    }

    // Dynamic Time-of-Day Fallback Strategy
    const hour = new Date().getHours();
    let timeGreetingQuery = 'Günün Hit Şarkıları';
    let moodQuery = 'Energic Pop';

    if (hour >= 5 && hour < 12) {
      timeGreetingQuery = 'Sabah Enerjisi & Günaydın Şarkıları';
      moodQuery = 'Kahve & Neşeli Şarkılar';
    } else if (hour >= 12 && hour < 18) {
      timeGreetingQuery = 'Gün Ortası Türkçe Hit';
      moodQuery = 'Popüler Trend Şarkılar';
    } else if (hour >= 18 && hour < 23) {
      timeGreetingQuery = 'Akşam Ritimleri & Pop Hit';
      moodQuery = 'Türkçe Rap & Sokak Nöbeti';
    } else {
      timeGreetingQuery = 'Gece Şarkıları & Derin Melodiler';
      moodQuery = 'Akustik & Sakin Ritimler';
    }

    try {
      const results = await Promise.allSettled([
        this.search('Hızlı Seçimler Türkçe'),
        this.search(timeGreetingQuery),
        this.search(moodQuery),
        this.search('Unutulmayan Nostalji 90lar 2000ler'),
        this.search('En Çok Dinlenen Trend Şarkılar'),
      ]);

      const [quickPicks, timeHits, moodHits, nostalgia, trendList] = results.map(
        (r) => (r.status === 'fulfilled' ? r.value : [])
      );

      return [
        { title: 'Hızlı Seçimler', items: quickPicks.slice(0, 16) },
        { title: timeGreetingQuery, items: timeHits.slice(0, 12) },
        { title: moodQuery, items: moodHits.slice(0, 12) },
        { title: 'Unutulmayan Nostalji & Klasikler', items: nostalgia.slice(0, 12) },
        { title: 'Popüler Listeler & Trendler', items: trendList.slice(0, 12) },
      ];
    } catch (e) {
      console.error('getHomeFeed fallback error:', e);
      return [];
    }
  }

  /**
   * Resolve ad-free direct audio stream URL
   */
  static async getAudioStreamUrl(videoId: string): Promise<ResolvedStreamResult> {
    if (Platform.OS === 'android' && NativeModules.VoxenStream) {
      try {
        const res = await NativeModules.VoxenStream.resolve(videoId);
        return {
          uri: res.uri,
          headers: res.headers,
          client: res.client,
          bitrate: res.bitrate,
          loudnessDb: res.loudnessDb,
        };
      } catch (nativeErr) {
        console.warn('Native VoxenStream resolver failed, falling back to CDN streams:', nativeErr);
      }
    }

    try {
      // 1. Direct Piped / Invidious CDN API (100% ad-free raw audio)
      const pipedInstances = [
        'https://pipedapi.kavin.rocks',
        'https://api.piped.privacydev.net',
        'https://pipedapi.tokhmi.xyz',
      ];

      for (const inst of pipedInstances) {
        try {
          const res = await fetch(`${inst}/streams/${videoId}`, { signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            const data = await res.json();
            const audioStreams = data.audioStreams || [];
            if (audioStreams.length > 0) {
              // Pick highest quality opus or m4a
              const best = audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
              if (best?.url) return { uri: best.url, bitrate: best.bitrate };
            }
          }
        } catch {
          continue;
        }
      }

      // 2. Direct Invidious fallback
      const invidiousRes = await fetch(`https://inv.tux.pizza/api/v1/videos/${videoId}`, { signal: AbortSignal.timeout(3000) });
      if (invidiousRes.ok) {
        const invData = await invidiousRes.json();
        const adaptive = invData.adaptiveFormats?.filter((f: any) => f.type?.startsWith('audio/')) || [];
        if (adaptive.length > 0) {
          const best = adaptive.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
          if (best?.url) return { uri: best.url, bitrate: best.bitrate };
        }
      }
    } catch (err) {
      console.warn('Stream resolution fallback needed:', err);
    }

    throw new Error('No playable audio stream was found');
  }

  /**
   * Fetch official plain lyrics from YouTube Music InnerTube endpoints
   */
  static async getLyrics(videoId: string): Promise<string | null> {
    if (!videoId) return null;
    try {
      const nextRes = await fetch(`${YTM_BASE}/next`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          context: DEFAULT_CONTEXT,
          videoId,
        }),
      });

      if (!nextRes.ok) return null;
      const nextData = await nextRes.json();
      const tabs = nextData?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs;
      if (!tabs || !Array.isArray(tabs)) return null;

      let browseEndpoint: { browseId?: string; params?: string } | null = null;
      for (const tab of tabs) {
        const tr = tab?.tabRenderer;
        if (!tr || tr.unselectable) continue;
        const ep = tr.endpoint?.browseEndpoint;
        if (ep?.browseId) {
          browseEndpoint = ep;
          break;
        }
      }

      if (!browseEndpoint && tabs[1]?.tabRenderer?.endpoint?.browseEndpoint && !tabs[1]?.tabRenderer?.unselectable) {
        browseEndpoint = tabs[1].tabRenderer.endpoint.browseEndpoint;
      }

      if (!browseEndpoint?.browseId) return null;

      const browseRes = await fetch(`${YTM_BASE}/browse`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          context: DEFAULT_CONTEXT,
          browseId: browseEndpoint.browseId,
          params: browseEndpoint.params,
        }),
      });

      if (!browseRes.ok) return null;
      const browseData = await browseRes.json();

      const contents = browseData?.contents?.sectionListRenderer?.contents || [];
      for (const content of contents) {
        const shelf = content?.musicDescriptionShelfRenderer;
        if (shelf?.description?.runs) {
          const text = shelf.description.runs.map((r: any) => r.text).join('').trim();
          if (text) return text;
        }
      }
    } catch (err) {
      console.warn('YouTubeService.getLyrics error:', err);
    }
    return null;
  }

  /**
   * Fetch Automix / Radio tracks for a given videoId
   */
  static async getAutomix(videoId: string): Promise<TrackItem[]> {
    if (!videoId) return [];
    try {
      const next = async (endpoint: Record<string, unknown>) => {
        const response = await networkFetch(`${YTM_BASE}/next`, {
          method: 'POST', headers: DEFAULT_HEADERS, retries: 0,
          body: JSON.stringify({ context: DEFAULT_CONTEXT, ...endpoint, videoId }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
          ?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer
          ?.content?.playlistPanelRenderer;
      };
      let panel = await next({});
      const preview = panel?.contents?.find((item: any) => item.automixPreviewVideoRenderer)
        ?.automixPreviewVideoRenderer?.content?.automixPlaylistVideoRenderer?.navigationEndpoint;
      const endpoint = preview?.watchPlaylistEndpoint || preview?.watchEndpoint;
      if (endpoint) panel = await next(endpoint) ?? panel;
      const playlistContents = panel?.contents || [];

      const tracks: TrackItem[] = [];
      for (const item of playlistContents) {
        const renderer = item.playlistPanelVideoRenderer;
        if (!renderer) continue;

        const vId = renderer.videoId;
        if (!vId || vId === videoId || tracks.some(track => track.id === vId)) continue;

        const title = renderer.title?.runs?.[0]?.text || 'Bilinmeyen Şarkı';
        const artistRuns = renderer.longBylineText?.runs || renderer.shortBylineText?.runs || [];
        const artist = artistRuns[0]?.text || 'Sanatçı';
        const thumbs = renderer.thumbnail?.thumbnails || renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const thumbUrl = thumbs[thumbs.length - 1]?.url?.replace(/=w\d+-h\d+/, '=w500-h500') || '';

        tracks.push({
          id: vId,
          videoId: vId,
          title,
          artist,
          artistName: artist,
          artists: [{ name: artist }],
          album: albumFromRuns(artistRuns),
          thumbnail: thumbUrl,
          thumbnails: {
            small: thumbUrl.replace(/=w\d+-h\d+/, '=w120-h120'),
            medium: thumbUrl.replace(/=w\d+-h\d+/, '=w300-h300'),
            large: thumbUrl,
          },
          explicit: /explicit/i.test(JSON.stringify(renderer.badges || [])) || /(\bexplicit\b|\[e\]|\(e\))/i.test(title),
          source: 'youtube',
        });
      }

      return tracks;
    } catch (err) {
      console.warn('YouTubeService.getAutomix error:', err);
      return [];
    }
  }

  /**
   * Fetch Related / Similar tracks and albums for a given videoId
   */
  static async getRelatedTracks(videoId: string): Promise<TrackItem[]> {
    if (!videoId) return [];
    try {
      const next = await networkFetch(`${YTM_BASE}/next`, { method: 'POST', headers: DEFAULT_HEADERS, retries: 0,
        body: JSON.stringify({ context: DEFAULT_CONTEXT, videoId }) });
      if (next.ok) {
        const data = await next.json();
        const endpoint = findRelatedEndpoint(data);
        if (endpoint?.browseId) {
          const browse = await networkFetch(`${YTM_BASE}/browse`, { method: 'POST', headers: DEFAULT_HEADERS, retries: 0,
            body: JSON.stringify({ context: DEFAULT_CONTEXT, ...endpoint }) });
          if (browse.ok) {
            const tracks = parseWatchTracks(await browse.json(), videoId);
            if (tracks.length) return tracks;
          }
        }
      }
    } catch (error) { console.warn('YouTubeService.getRelatedTracks error:', error); }
    return this.getAutomix(videoId);
  }

  /** Resolve the release attached to this song, never a guessed artist album. */
  static async getTrackAlbum(track: Track): Promise<AlbumSummary | null> {
    const existing = typeof track.album === 'object' ? track.album : undefined;
    if (existing?.id && isAlbumBrowseId(existing.id)) return existing;
    const videoId = track.videoId || track.id;
    try {
      const next = await networkFetch(`${YTM_BASE}/next`, { method: 'POST', headers: DEFAULT_HEADERS, retries: 0,
        body: JSON.stringify({ context: DEFAULT_CONTEXT, videoId }) });
      if (next.ok) {
        const album = parseCurrentTrackAlbum(await next.json(), videoId);
        if (album) return album;
      }
    } catch {}
    const matches = await this.search(`${track.title} ${track.artist || track.artistName || ''}`);
    const same = matches.find(item => item.id === videoId && typeof item.album === 'object' && item.album.id)
      || matches.find(item => typeof item.album === 'object' && item.album.id
        && matchingSongTitle(item.title) === matchingSongTitle(track.title)
        && matchingSongTitle(item.artist).includes(matchingSongTitle(track.artist || track.artistName || '')));
    return same && typeof same.album === 'object' ? same.album : null;
  }

  /**
   * Fetch official Top 100 Charts & Trends from YouTube Music InnerTube FEmusic_charts
   */
  static async getTopCharts(): Promise<HomeSection[]> {
    try {
      const response = await networkFetch(`${YTM_BASE}/browse?prettyPrint=false`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          context: DEFAULT_CONTEXT,
          browseId: 'FEmusic_charts',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const sectionList =
          data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

        const sections: HomeSection[] = [];

        for (const section of sectionList) {
          const shelf = section.musicCarouselShelfRenderer || section.musicShelfRenderer;
          if (!shelf) continue;

          const title =
            shelf.header?.musicCarouselShelfHeaderRenderer?.title?.runs?.[0]?.text ||
            shelf.header?.musicShelfHeaderRenderer?.title?.runs?.[0]?.text;
          if (!title) continue;

          const items: TrackItem[] = [];
          const contents = shelf.contents || [];

          for (const item of contents) {
            const twoRow = item.musicTwoRowItemRenderer;
            const respList = item.musicResponsiveListItemRenderer;

            if (twoRow) {
              const itemTitle = twoRow.title?.runs?.[0]?.text || 'Şarkı';
              const artist = twoRow.subtitle?.runs?.map((r: any) => r.text).join('') || 'Sanatçı';
              const thumbs = twoRow.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
              const thumbUrl = thumbs[thumbs.length - 1]?.url?.replace(/=w\d+-h\d+/, '=w500-h500') || '';

              const videoId =
                twoRow.navigationEndpoint?.watchEndpoint?.videoId ||
                twoRow.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

              if (videoId && thumbUrl) {
                items.push({
                  id: videoId,
                  videoId,
                  title: itemTitle,
                  artist,
                  artistName: artist,
                  artists: [{ name: artist }],
                  thumbnail: thumbUrl,
                  thumbnails: {
                    small: thumbUrl,
                    medium: thumbUrl,
                    large: thumbUrl,
                  },
                  source: 'youtube',
                });
              }
            } else if (respList) {
              const flexColumns = respList.flexColumns || [];
              const itemTitle = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Şarkı';
              const artist = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join('') || 'Sanatçı';
              const thumbs = respList.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
              const thumbUrl = thumbs[thumbs.length - 1]?.url?.replace(/=w\d+-h\d+/, '=w500-h500') || '';

              const videoId =
                respList.playlistItemData?.videoId ||
                respList.navigationEndpoint?.watchEndpoint?.videoId ||
                flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

              if (videoId && thumbUrl) {
                items.push({
                  id: videoId,
                  videoId,
                  title: itemTitle,
                  artist,
                  artistName: artist,
                  artists: [{ name: artist }],
                  thumbnail: thumbUrl,
                  thumbnails: {
                    small: thumbUrl,
                    medium: thumbUrl,
                    large: thumbUrl,
                  },
                  source: 'youtube',
                });
              }
            }
          }

          if (items.length > 0) {
            sections.push({ title, items });
          }
        }

        if (sections.length > 0) return sections;
      }
    } catch (e) {
      console.warn('YouTubeService.getTopCharts error:', e);
    }

    // Fallback Top Charts search
    const [topTr, topGlobal] = await Promise.all([
      this.search('Top 100 Türkiye Türkçe'),
      this.search('Global Top Hits 2024'),
    ]);

    return [
      { title: 'Top 100 Türkiye', items: topTr.slice(0, 20) },
      { title: 'Global Top Hits', items: topGlobal.slice(0, 20) },
    ];
  }

  /**
   * Fetch podcast channels from YouTube Music
   * Uses direct YTM Podcast filter params
   */
  static async getPodcasts(): Promise<PodcastChannel[]> {
    try {
      const res = await fetch(`${YTM_BASE}/search?prettyPrint=false`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          context: DEFAULT_CONTEXT,
          query: 'podcast',
          params: 'EgWKAQJQAWoSEBEQBRAOEAkQEBADEBUQBBAK', // YouTube Music Podcasts Filter
        }),
      });

      if (!res.ok) return this.getFallbackPodcasts();
      const data = await res.json();

      const podcasts: PodcastChannel[] = [];
      const tabs = data.contents?.tabbedSearchResultsRenderer?.tabs || [];
      const contents = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

      for (const section of contents) {
        const shelf = section.musicShelfRenderer;
        if (!shelf?.contents) continue;

        for (const item of shelf.contents) {
          const r = item.musicResponsiveListItemRenderer;
          if (!r) continue;

          const title = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
          const subtitle = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((x: any) => x.text).join('') || '';
          const browseId = r.navigationEndpoint?.browseEndpoint?.browseId;
          const thumbnailUrl = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';

          if (title && browseId) {
            podcasts.push({ id: browseId, title, subtitle, thumbnailUrl, browseId });
          }
        }
      }

      return podcasts.length > 0 ? podcasts : this.getFallbackPodcasts();
    } catch {
      return this.getFallbackPodcasts();
    }
  }

  /**
   * Fetch episodes for a specific podcast channel
   * Supports both twoColumnBrowseResultsRenderer (official podcast page) and singleColumn formats
   */
  static async getPodcastEpisodes(browseId: string): Promise<PodcastEpisode[]> {
    try {
      const res = await fetch(`${YTM_BASE}/browse?prettyPrint=false`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          context: DEFAULT_CONTEXT,
          browseId,
        }),
      });

      if (!res.ok) return [];
      const data = await res.json();
      const episodes: PodcastEpisode[] = [];

      // 1. Two-column podcast layout (secondaryContents)
      const secondaryContents =
        data?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents || [];

      // 2. Single-column podcast/playlist layout
      const singleContents =
        data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

      const allSections = [...secondaryContents, ...singleContents];

      for (const section of allSections) {
        const shelf = section.musicShelfRenderer || section.musicCarouselShelfRenderer;
        if (!shelf?.contents) continue;

        for (const item of shelf.contents) {
          // Case A: musicMultiRowListItemRenderer (Official Podcast Show Detail)
          if (item.musicMultiRowListItemRenderer) {
            const r = item.musicMultiRowListItemRenderer;
            const title = r.title?.runs?.[0]?.text || '';
            const meta = r.subtitle?.runs?.map((x: any) => x.text).join('') || '';
            const desc = r.description?.runs?.[0]?.text || '';
            const videoId =
              r.onTap?.watchEndpoint?.videoId ||
              r.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
              r.thumbnailOverlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
            const thumb = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';

            if (title && videoId) {
              episodes.push({ id: videoId, videoId, title, meta: meta || desc, thumbnailUrl: thumb });
            }
          }

          // Case B: musicResponsiveListItemRenderer (Standard playlist / channel)
          if (item.musicResponsiveListItemRenderer) {
            const r = item.musicResponsiveListItemRenderer;
            const flexCols = r.flexColumns || [];
            const title = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
            const meta = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((x: any) => x.text).join('') || '';
            const videoId =
              r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
              r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
            const thumb = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';

            if (title && videoId) {
              episodes.push({ id: videoId, videoId, title, meta, thumbnailUrl: thumb });
            }
          }
        }
      }
      return episodes;
    } catch {
      return [];
    }
  }

  /**
   * Fallback: curated Turkish podcast search results
   */
  private static async getFallbackPodcasts(): Promise<PodcastChannel[]> {
    const queries = ['Türkçe Podcast', 'Teknoloji Podcast', 'Tarih Podcast', 'Psikoloji Podcast'];
    const results = await Promise.allSettled(queries.map((q) => this.search(q)));
    const podcasts: PodcastChannel[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value[0]) {
        const t = r.value[0];
        podcasts.push({
          id: t.id,
          title: queries[i],
          subtitle: 'YouTube Music',
          thumbnailUrl: t.thumbnail || '',
          browseId: t.id,
        });
      }
    });
    return podcasts;
  }

  /**
   * Fallback search in case YTM endpoint is blocked
   */
  private static async fallbackSearch(query: string): Promise<TrackItem[]> {
    try {
      const res = await fetch(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=music_songs`);
      if (res.ok) {
        const data = await res.json();
        return (data.items || []).map((item: any) => {
          const videoId = item.url ? item.url.replace('/watch?v=', '') : item.id;
          const artist = item.uploaderName || 'Bilinmeyen Sanatçı';
          const thumb = item.thumbnail || '';
          return {
            id: videoId,
            videoId,
            title: item.title || 'Bilinmeyen Şarkı',
            artist,
            artistName: artist,
            artists: [{ name: artist }],
            thumbnail: thumb,
            thumbnails: {
              small: thumb,
              medium: thumb,
              large: thumb,
            },
            duration: item.duration,
            durationFormatted: item.duration ? `${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')}` : undefined,
            explicit: !!item.explicit || /\bexplicit\b/i.test(item.title || ''),
            source: 'youtube',
          };
        }).filter((track: Track) => useSettingsStore.getState().explicitContent || !track.explicit);
      }
    } catch {
      // ignore
    }
    return [];
  }
}

// ─── Podcast Types ──────────────────────────────────────────────────────────

export interface PodcastChannel {
  id: string;
  title: string;
  subtitle: string;
  thumbnailUrl: string;
  browseId: string;
}

export interface PodcastEpisode {
  id: string;
  videoId: string;
  title: string;
  meta: string;
  thumbnailUrl: string;
}
