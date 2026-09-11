import type { Track, Playlist } from '../../models';

export interface LibrarySyncMeta {
  favorites: Record<string, { present: boolean; at: number }>;
  deletedPlaylists: Record<string, number>;
}
type Library = { favorites: Track[]; playlists: Playlist[]; syncMeta?: LibrarySyncMeta };

// Keep deletion records so an offline device cannot resurrect an older copy.
export function mergeLibrary(local: Library, remote: Library) {
  const syncMeta: LibrarySyncMeta = { favorites: {}, deletedPlaylists: {} };
  for (const source of [remote, local]) {
    for (const [id, change] of Object.entries(source.syncMeta?.favorites || {})) {
      const previous = syncMeta.favorites[id];
      if (!previous || change.at > previous.at || (change.at === previous.at && !change.present)) syncMeta.favorites[id] = change;
    }
    for (const [id, at] of Object.entries(source.syncMeta?.deletedPlaylists || {})) {
      syncMeta.deletedPlaylists[id] = Math.max(at, syncMeta.deletedPlaylists[id] || 0);
    }
  }
  const favorites = [...new Map([...remote.favorites, ...local.favorites].filter(t => t?.id).map(t => [t.id, t])).values()]
    .filter(t => syncMeta.favorites[t.id]?.present !== false);
  const playlists = new Map<string, Playlist>();
  for (const p of [...remote.playlists, ...local.playlists]) {
    if (!p?.id) continue;
    if (syncMeta.deletedPlaylists[p.id]) continue;
    const previous = playlists.get(p.id);
    if (!previous || (p.updatedAt || 0) >= (previous.updatedAt || 0)) playlists.set(p.id, p);
  }
  return { favorites, playlists: [...playlists.values()], syncMeta };
}
