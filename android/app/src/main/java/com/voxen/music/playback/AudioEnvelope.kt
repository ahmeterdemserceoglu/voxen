package com.voxen.music.playback

import kotlin.math.pow

object AudioEnvelope {
    fun volume(position: Long, duration: Long, fadeMillis: Long, loudnessDb: Double?, normalize: Boolean, headroomDb: Double = 0.0): Float {
        val gain = 10.0.pow(-(if (normalize) (loudnessDb ?: 0.0).coerceAtLeast(0.0) else 0.0) / 20.0)
        val envelope = if (fadeMillis > 0 && duration > 0) minOf(1.0, position.coerceAtLeast(0).toDouble() / fadeMillis, (duration - position).coerceAtLeast(0).toDouble() / fadeMillis) else 1.0
        return (gain * envelope * 10.0.pow(-headroomDb.coerceAtLeast(0.0) / 20.0)).coerceIn(0.0, 1.0).toFloat()
    }
}
