import type { Track, TasteInteraction } from '../../models';

/** Counts rendered audio progress, excluding seeks, pauses and buffering. */
export class ListeningTracker {
  private track: Track | null = null;
  private position = 0; private duration = 0; private sampledAt = 0;
  private played = false; private thirty = false; private completed = false; private listened = 0;
  constructor(private record: (event: TasteInteraction, track: Track) => void) {}
  reset() { this.track = null; this.played = false; this.thirty = false; this.completed = false; this.listened = 0; this.sampledAt = 0; }
  private finish() {
    if (!this.track || !this.played || this.completed) return;
    if (this.duration > 0 && this.position >= this.duration - 1500 && this.listened >= this.duration * .7) this.record('COMPLETE', this.track);
    else if (this.listened < 30000) this.record('SKIP', this.track);
  }
  update(track: Track, position: number, duration: number, playing: boolean, seeking = false, now = Date.now()) {
    if (this.track?.id !== track.id) { this.finish(); this.reset(); this.track = track; this.position = position; this.sampledAt = now; }
    const delta = position - this.position; const elapsed = now - this.sampledAt;
    if (playing && !seeking) {
      if (!this.played) { this.played = true; this.record('PLAY', track); }
      if (delta > 0 && elapsed > 0 && delta <= Math.max(2500, elapsed + 1500)) this.listened += Math.min(delta, elapsed, 2000);
      if (!this.thirty && this.listened >= 30000) { this.thirty = true; this.record('LISTEN_30S', track); }
    }
    this.position = position; this.duration = duration; this.sampledAt = now;
    if (!playing && this.played && !this.completed && duration > 0 && position >= duration - 500 && this.listened >= duration * .7) {
      this.completed = true; this.record('COMPLETE', track);
    }
  }
}
