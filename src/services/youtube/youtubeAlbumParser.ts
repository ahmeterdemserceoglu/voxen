import type { AlbumItem } from '../youtubeService';
import { parseBestThumbnail } from './youtubeParser';

const albumLabels = /^(albüm|album|single|ep)$/i;
const separator = /^[\s•·,&]+$/;

export function isAlbumBrowseId(id: string): boolean {
  return /^MPRE[A-Za-z0-9_-]+$/.test(id);
}

function pageType(endpoint: any): string | undefined {
  return endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
}

export function albumReleaseType(runs: any[]): AlbumItem['releaseType'] {
  const label = runs.find(run => albumLabels.test(run.text?.trim() || ''))?.text?.trim();
  return /^single$/i.test(label || '') ? 'Single' : /^ep$/i.test(label || '') ? 'EP' : 'Albüm';
}

export function albumArtist(runs: any[]): string {
  const linked = runs.filter(run => pageType(run.navigationEndpoint) === 'MUSIC_PAGE_TYPE_ARTIST'
    || run.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC'));
  const names = linked.length ? linked : runs.filter(run => {
    const text = run.text?.trim() || '';
    return text && !separator.test(text) && !albumLabels.test(text) && !/^\d{4}$/.test(text)
      && !/^\d+(?::\d+)+$/.test(text);
  });
  return [...new Set<string>(names.map(run => run.text?.trim()).filter(Boolean))].join(', ');
}

export function parseAlbumRenderer(renderer: any): AlbumItem | null {
  const titleRuns = renderer.title?.runs
    || renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  // The title/row endpoint identifies the release. Artist endpoints in subtitles do not.
  const endpoint = renderer.navigationEndpoint?.browseEndpoint ? renderer.navigationEndpoint
    : titleRuns.find((run: any) => run.navigationEndpoint?.browseEndpoint)?.navigationEndpoint;
  const id = endpoint?.browseEndpoint?.browseId;
  const type = pageType(endpoint);
  if (!id || !isAlbumBrowseId(id) || (type && type !== 'MUSIC_PAGE_TYPE_ALBUM')) return null;
  const title = titleRuns.map((run: any) => run.text || '').join('').trim();
  if (!title) return null;
  const infoRuns = renderer.subtitle?.runs
    || renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const thumbs = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails
    || renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  return {
    id, title, artist: albumArtist(infoRuns) || 'Bilinmeyen Sanatçı',
    year: infoRuns.find((run: any) => /^\d{4}$/.test(run.text?.trim() || ''))?.text?.trim(),
    releaseType: albumReleaseType(infoRuns), thumbnailUrl: parseBestThumbnail(thumbs),
  };
}

export function parseAlbumSearchResults(data: any): AlbumItem[] {
  const albums = new Map<string, AlbumItem>();
  function visit(node: any) {
    if (!node || typeof node !== 'object') return;
    const renderer = node.musicResponsiveListItemRenderer || node.musicTwoRowItemRenderer;
    if (renderer) {
      const album = parseAlbumRenderer(renderer);
      if (album && !albums.has(album.id)) albums.set(album.id, album);
      return;
    }
    for (const value of Object.values(node)) visit(value);
  }
  visit(data.contents);
  return [...albums.values()];
}

export function findBrowseHeader(node: any): any {
  if (!node || typeof node !== 'object') return undefined;
  const header = node.musicResponsiveHeaderRenderer || node.musicDetailHeaderRenderer;
  if (header) return header;
  for (const value of Object.values(node)) {
    const found = findBrowseHeader(value);
    if (found) return found;
  }
  return undefined;
}
