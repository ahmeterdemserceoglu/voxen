import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBestThumbnail, parsePipedTrack } from '../src/services/youtube/youtubeParser.ts';

test('YouTube Parser - parseBestThumbnail returns largest thumbnail url', () => {
  const thumbs = [
    { url: 'https://lh3.googleusercontent.com/test=w120-h120' },
    { url: 'https://lh3.googleusercontent.com/test=w500-h500' },
  ];
  const best = parseBestThumbnail(thumbs);
  assert.ok(best.includes('=w500-h500'));
});

test('YouTube Parser - parsePipedTrack parses piped search item correctly', () => {
  const item = {
    url: '/watch?v=abc123xyz',
    title: 'Neyim Var Ki',
    uploaderName: 'Ceza & Sagopa',
    thumbnail: 'https://img.youtube.com/vi/abc123xyz/hqdefault.jpg',
    duration: 215,
  };

  const track = parsePipedTrack(item);
  assert.equal(track.id, 'abc123xyz');
  assert.equal(track.title, 'Neyim Var Ki');
  assert.equal(track.artistName, 'Ceza & Sagopa');
  assert.equal(track.duration, 215);
  assert.equal(track.durationFormatted, '3:35');
});
