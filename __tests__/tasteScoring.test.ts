import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyTasteProfile,
  applyInteraction,
  topKeys,
  TASTE_SCORES,
} from '../src/models/TasteProfile.ts';

test('Taste Profile - empty creation', () => {
  const profile = createEmptyTasteProfile();
  assert.deepEqual(profile.genres, {});
  assert.deepEqual(profile.artists, {});
  assert.deepEqual(profile.tracks, {});
  assert.ok(profile.updatedAt > 0);
});

test('Taste Profile - apply interactions and scoring', () => {
  let profile = createEmptyTasteProfile();

  // Play an artist
  profile = applyInteraction(profile, 'PLAY', 'Ceza', 'Türkçe Rap', 'track_1');
  assert.equal(profile.artists['Ceza'], TASTE_SCORES.PLAY);
  assert.equal(profile.genres['Türkçe Rap'], TASTE_SCORES.PLAY);
  assert.equal(profile.tracks['track_1'], TASTE_SCORES.PLAY);

  // Like the track
  profile = applyInteraction(profile, 'LIKE', 'Ceza', 'Türkçe Rap', 'track_1');
  assert.equal(profile.artists['Ceza'], TASTE_SCORES.PLAY + TASTE_SCORES.LIKE);
  assert.equal(profile.tracks['track_1'], TASTE_SCORES.PLAY + TASTE_SCORES.LIKE);

  // Skip a track from another artist
  profile = applyInteraction(profile, 'SKIP', 'Unknown Artist', 'Pop', 'track_2');
  assert.equal(profile.artists['Unknown Artist'], TASTE_SCORES.SKIP);
});

test('Taste Profile - topKeys ordering', () => {
  const map: Record<string, number> = {
    Rap: 15,
    Rock: 3,
    Pop: 25,
    Jazz: 8,
    Electronic: 12,
  };

  const top3 = topKeys(map, 3);
  assert.deepEqual(top3, ['Pop', 'Rap', 'Electronic']);
});
