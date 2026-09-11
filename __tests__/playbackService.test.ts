import test from 'node:test';
import assert from 'node:assert/strict';

function parseLRC(lrc: string): Array<{ time?: number; text: string }> {
  const lines: Array<{ time?: number; text: string }> = [];
  for (const line of lrc.split('\n')) {
    const match = line.match(/^\[(\d+):(\d+\.?\d*)\](.*)$/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const text = match[3].trim();
      if (text) lines.push({ time: minutes * 60 + seconds, text });
    } else if (line.trim() && !line.startsWith('[')) {
      lines.push({ text: line.trim() });
    }
  }
  return lines;
}

test('Lyrics LRC Parser - parses time-stamped LRC strings correctly', () => {
  const sampleLRC = `
[00:05.50]Bir fırtına tuttu bizi
[00:12.00]Deryaya kardı
[00:20.15]O bizim kavuşmalarımız
`;

  const parsed = parseLRC(sampleLRC);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].text, 'Bir fırtına tuttu bizi');
  assert.equal(parsed[0].time, 5.5);
  assert.equal(parsed[1].time, 12);
  assert.equal(parsed[2].time, 20.15);
});

test('Lyrics LRC Parser - ignores header metadata tags', () => {
  const lrcWithMeta = `
[ti:Sample Title]
[ar:Sample Artist]
[00:01.00]First real lyric line
`;

  const parsed = parseLRC(lrcWithMeta);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].text, 'First real lyric line');
});

function cleanTitle(rawTitle: string, artistName?: string): string {
  let title = rawTitle
    .replace(/\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|lyric\s*video|audio|video|klip|clip\s*officiel|visualizer|hd|4k|remastered|lyrics)[\)\]]/gi, '')
    .replace(/\s*[\(\[](?:feat|ft)\.?\s+[^\)\]]+[\)\]]/gi, '')
    .trim();

  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts.length === 2) {
      if (!artistName || parts[0].toLowerCase().trim() === artistName.toLowerCase().trim()) {
        title = parts[1].trim();
      }
    }
  }
  return title;
}

function cleanArtist(rawArtist: string): string {
  return rawArtist
    .replace(/\s*[\(\[](?:feat|ft)\.?\s+[^\)\]]+[\)\]]/gi, '')
    .replace(/\s+(?:feat|ft)\.?\s+.+$/i, '')
    .replace(/\s+&\s+.+$/, '')
    .replace(/\s*,\s*.+$/, '')
    .trim();
}

test('Lyrics Cleaner - strips video tags, feat, and artist prefixes', () => {
  assert.equal(cleanTitle('Ezhel - Geceler (Official Video)', 'Ezhel'), 'Geceler');
  assert.equal(cleanTitle('Dua Lipa - Levitating (feat. DaBaby) [Official Music Video]', 'Dua Lipa'), 'Levitating');
  assert.equal(cleanTitle('Gülümse (Visualizer)'), 'Gülümse');
  assert.equal(cleanTitle('Anti-Hero', 'Taylor Swift'), 'Anti-Hero');
});

test('Lyrics Cleaner - cleans artist strings with collaborations', () => {
  assert.equal(cleanArtist('Semicenk & Doğu Swag'), 'Semicenk');
  assert.equal(cleanArtist('Ezhel feat. Ufo361'), 'Ezhel');
  assert.equal(cleanArtist('Taylor Swift (feat. Bon Iver)'), 'Taylor Swift');
});

