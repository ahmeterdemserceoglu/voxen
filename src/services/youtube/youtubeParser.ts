import type { Track, ArtistSummary } from '../../models';
import type {
  YTMListItemRenderer,
  YTMShelfRenderer,
  YTMThumbnail,
  PipedSearchItem,
} from './youtubeTypes';

/** Pick best (largest) thumbnail URL, optionally force 500px size */
export function parseBestThumbnail(thumbnails: YTMThumbnail[], forceSize = true): string {
  if (!thumbnails?.length) return '';
  const best = thumbnails[thumbnails.length - 1];
  const url = best?.url || '';
  return forceSize ? url.replace(/=w\d+-h\d+(-[^&]+)?/, '=w500-h500') : url;
}

/** Build TrackThumbnails object from a single URL */
function buildThumbnails(url: string) {
  return {
    small: url.replace(/=w\d+-h\d+(-[^&]+)?/, '=w120-h120'),
    medium: url.replace(/=w\d+-h\d+(-[^&]+)?/, '=w300-h300'),
    large: url.replace(/=w\d+-h\d+(-[^&]+)?/, '=w500-h500'),
  };
}

/** Parse a single musicResponsiveListItemRenderer into a Track */
export function parseTrackFromRenderer(renderer: YTMListItemRenderer): Track | null {
  const flexColumns = renderer.flexColumns || [];

  const titleRuns =
    flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const title = titleRuns[0]?.text || '';

  const videoId =
    renderer.playlistItemData?.videoId ||
    renderer.navigationEndpoint?.watchEndpoint?.videoId ||
    titleRuns[0]?.navigationEndpoint?.watchEndpoint?.videoId;

  if (!videoId || !title) return null;

  const infoRuns =
    flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];

  // Artist names are non-separator runs; duration is typically last
  const artistNames: string[] = [];
  let durationText: string | undefined;
  for (const run of infoRuns) {
    if (run.text === ' • ' || run.text === ' & ') continue;
    if (/^\d+:\d+$/.test(run.text.trim())) {
      durationText = run.text.trim();
    } else if (run.navigationEndpoint?.browseEndpoint) {
      artistNames.push(run.text);
    } else if (artistNames.length === 0 && run.text.trim()) {
      // fallback: first non-separator text is artist
      artistNames.push(run.text);
    }
  }

  const artists: ArtistSummary[] = artistNames.map((name) => ({ name }));
  const artistName = artists.map((a) => a.name).join(', ') || 'Bilinmeyen Sanatci';

  const thumbs = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const baseThumb = parseBestThumbnail(thumbs);

  let duration: number | undefined;
  if (durationText) {
    const parts = durationText.split(':').map(Number);
    if (parts.length === 2) duration = parts[0] * 60 + parts[1];
    else if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  const isExplicit =
    Boolean(
      (renderer as any).badges?.some(
        (b: any) =>
          b?.musicInlineBadgeRenderer?.icon?.iconType === 'MUSIC_EXPLICIT_BADGE' ||
          b?.musicInlineBadgeRenderer?.accessibilityData?.accessibilityData?.label
            ?.toLowerCase()
            .includes('explicit')
      )
    ) || /(\bexplicit\b|\[e\]|\(e\))/i.test(title);

  return {
    id: videoId,
    videoId,
    title,
    artist: artistName,
    artists,
    artistName,
    duration,
    durationFormatted: durationText,
    thumbnail: baseThumb,
    thumbnails: buildThumbnails(baseThumb),
    explicit: isExplicit,
    source: 'youtube',
  };
}

/** Parse a musicShelfRenderer into an array of Tracks */
export function parseShelfTracks(shelf: YTMShelfRenderer): Track[] {
  const tracks: Track[] = [];
  for (const item of shelf.contents || []) {
    const renderer = item.musicResponsiveListItemRenderer;
    if (!renderer) continue;
    const track = parseTrackFromRenderer(renderer);
    if (track) tracks.push(track);
  }
  return tracks;
}

/** Parse Piped search result item into a Track */
export function parsePipedTrack(item: PipedSearchItem): Track {
  const videoId = item.url
    ? item.url.replace('/watch?v=', '')
    : (item.id || '');
  const thumb = item.thumbnail || '';
  return {
    id: videoId,
    videoId,
    title: item.title || 'Bilinmeyen Sarki',
    artist: item.uploaderName || 'Bilinmeyen Sanatci',
    artists: item.uploaderName ? [{ name: item.uploaderName }] : [],
    artistName: item.uploaderName || 'Bilinmeyen Sanatci',
    duration: item.duration,
    durationFormatted: item.duration
      ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}`
      : undefined,
    thumbnail: thumb,
    thumbnails: buildThumbnails(thumb),
    explicit: false,
    source: 'youtube',
  };
}
