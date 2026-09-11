import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, formatCompactNumber } from '../src/utils/formatters.ts';

test('formatTime - formats seconds under a minute', () => {
  assert.equal(formatTime(45), '0:45');
  assert.equal(formatTime(5), '0:05');
  assert.equal(formatTime(0), '0:00');
});

test('formatTime - formats standard minute:second tracks', () => {
  assert.equal(formatTime(215), '3:35');
  assert.equal(formatTime(360), '6:00');
});

test('formatTime - formats hour-long audio', () => {
  assert.equal(formatTime(3665), '1:01:05');
});

test('formatTime - handles negative or NaN inputs gracefully', () => {
  assert.equal(formatTime(-10), '0:00');
  assert.equal(formatTime(NaN), '0:00');
});

test('formatCompactNumber - formats numbers properly', () => {
  assert.equal(formatCompactNumber(500), '500');
  assert.equal(formatCompactNumber(1500), '1.5K');
  assert.equal(formatCompactNumber(2450000), '2.5M');
  assert.equal(formatCompactNumber(undefined), '0');
});
