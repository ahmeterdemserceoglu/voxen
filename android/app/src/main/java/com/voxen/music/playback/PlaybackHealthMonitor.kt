package com.voxen.music.playback

/** Detects a stalled source without resuming a user/focus pause or a pending load. */
class PlaybackHealthMonitor {
    private var position = 0L
    private var advancedAt = 0L
    private var sampledAt = 0L
    var progressingFor = 0L
        private set

    fun reset(now: Long, startPosition: Long) {
        position = startPosition
        advancedAt = now
        sampledAt = now
        progressingFor = 0L
    }

    fun sample(now: Long, currentPosition: Long, wantsPlay: Boolean, canPlay: Boolean, buffering: Boolean): Boolean {
        if (!wantsPlay || !canPlay) { reset(now, currentPosition); return false }
        if (currentPosition > position + 100L) {
            progressingFor += (now - sampledAt).coerceIn(0L, 2_000L)
            advancedAt = now
        } else progressingFor = 0L
        position = currentPosition
        sampledAt = now
        val timeout = if (buffering) 15_000L else 8_000L
        if (now - advancedAt < timeout) return false
        reset(now, currentPosition)
        return true
    }
}
