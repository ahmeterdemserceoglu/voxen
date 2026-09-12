import type { Track, AlbumSummary } from '../../models/Track';
import { parseTrackFromRenderer, parseBestThumbnail } from './youtubeParser';
import { albumFromRuns } from './youtubeTrackMetadata';

export function findWatchTabs(data: any): any[] {
  let result: any[] = [];
  function visit(node: any) {
    if (!node || typeof node !== 'object' || result.length) return;
    if (node.watchNextTabbedResultsRenderer?.tabs) { result = node.watchNextTabbedResultsRenderer.tabs; return; }
    for (const value of Object.values(node)) visit(value);
  }
  visit(data.contents); return result;
}

export function findRelatedEndpoint(data: any): any {
  const tabs = findWatchTabs(data);
  return tabs.find(tab => /related|ilgili|benzer/i.test(tab.tabRenderer?.title || ''))?.tabRenderer?.endpoint?.browseEndpoint
    || tabs.find(tab => /^MPTR/.test(tab.tabRenderer?.endpoint?.browseEndpoint?.browseId || ''))?.tabRenderer?.endpoint?.browseEndpoint;
}

export function parseWatchTracks(data: any, seed: string): Track[] {
  const found = new Map<string, Track>();
  function visit(node: any) {
    if (!node || typeof node !== 'object') return;
    const responsive = node.musicResponsiveListItemRenderer;
    const renderer = node.musicTwoRowItemRenderer || node.playlistPanelVideoRenderer;
    if (responsive || renderer) {
      let track = responsive ? parseTrackFromRenderer(responsive) : null;
      if (renderer) {
        const id = renderer.videoId || renderer.navigationEndpoint?.watchEndpoint?.videoId
          || renderer.navigationEndpoint?.watchPlaylistEndpoint?.videoId;
        const title = renderer.title?.runs?.map((run: any) => run.text || '').join('');
        if (id && title) {
          const runs = renderer.longBylineText?.runs || renderer.shortBylineText?.runs || renderer.subtitle?.runs || [];
          const artist = runs.find((run: any) => run.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC'))?.text || runs[0]?.text || 'Bilinmeyen Sanatçı';
          const thumbs = renderer.thumbnail?.thumbnails || renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails
            || renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          const thumbnail = parseBestThumbnail(thumbs) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
          const durationFormatted = renderer.lengthText?.runs?.[0]?.text;
          const duration = durationFormatted?.split(':').reduce((total: number, value: string) => total * 60 + Number(value), 0);
          track = { id, videoId: id, title, artist, artistName: artist, artists: [{ name: artist }], album: albumFromRuns(runs), thumbnail,
            thumbnails: { small: thumbnail, medium: thumbnail, large: thumbnail }, duration, durationFormatted, source: 'youtube' };
        }
      }
      if (track && track.id !== seed && !found.has(track.id)) found.set(track.id, track);
      return;
    }
    for (const value of Object.values(node)) visit(value);
  }
  visit(data.contents); visit(data.continuationContents); return [...found.values()];
}

export function parseCurrentTrackAlbum(data: any, videoId: string): AlbumSummary | undefined {
  let album: AlbumSummary | undefined;
  function visit(node: any) {
    if (!node || typeof node !== 'object' || album) return;
    const renderer = node.playlistPanelVideoRenderer;
    if (renderer?.videoId === videoId) album = albumFromRuns(renderer.longBylineText?.runs || renderer.shortBylineText?.runs || []);
    const metadata = node.musicWatchMetadataRenderer;
    if (metadata) album = albumFromRuns(metadata.subtitle?.runs || metadata.longBylineText?.runs || []) || album;
    for (const value of Object.values(node)) visit(value);
  }
  visit(data.contents); return album;
}
