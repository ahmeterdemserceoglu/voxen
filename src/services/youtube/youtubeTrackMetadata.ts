import type { AlbumSummary } from '../../models/Track';

export function albumFromRuns(runs: any[]): AlbumSummary | undefined {
  const run = runs.find(item => {
    const endpoint = item.navigationEndpoint?.browseEndpoint;
    const type = endpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
    return /^MPRE[A-Za-z0-9_-]+$/.test(endpoint?.browseId || '') && (!type || type === 'MUSIC_PAGE_TYPE_ALBUM');
  });
  return run?.text?.trim() ? { id: run.navigationEndpoint.browseEndpoint.browseId, title: run.text.trim() } : undefined;
}

export function matchingSongTitle(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/ı/g, 'i').replace(/i\u0307/g, 'i')
    .replace(/\([^)]*(official|video|audio|lyrics|klip)[^)]*\)|\[[^\]]*(official|video|audio|lyrics|klip)[^\]]*\]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
