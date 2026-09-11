import test from 'node:test';
import assert from 'node:assert/strict';

function migrateTrackSchemaV1toV2(rawItems: any[]): any[] {
  return rawItems.map((item) => ({
    ...item,
    artist: item.artist || item.artistName || 'Bilinmeyen Sanatçı',
    artistName: item.artistName || item.artist || 'Bilinmeyen Sanatçı',
    thumbnail: item.thumbnail || item.thumbnails?.medium || '',
  }));
}

test('Storage Schema Migration - v1 to v2 normalizes legacy track items', () => {
  const legacyData = [
    {
      id: 'song-1',
      title: 'Legacy Song',
      artistName: 'Old Artist Prop',
      thumbnails: { medium: 'https://thumb.com/medium.jpg' },
    },
    {
      id: 'song-2',
      title: 'Legacy Song 2',
      artist: 'Another Artist',
      thumbnail: 'https://thumb.com/direct.jpg',
    },
  ];

  const migrated = migrateTrackSchemaV1toV2(legacyData);

  assert.equal(migrated[0].artist, 'Old Artist Prop');
  assert.equal(migrated[0].artistName, 'Old Artist Prop');
  assert.equal(migrated[0].thumbnail, 'https://thumb.com/medium.jpg');

  assert.equal(migrated[1].artist, 'Another Artist');
  assert.equal(migrated[1].artistName, 'Another Artist');
  assert.equal(migrated[1].thumbnail, 'https://thumb.com/direct.jpg');
});
