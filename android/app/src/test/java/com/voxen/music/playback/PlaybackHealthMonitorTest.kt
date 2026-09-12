package com.voxen.music.playback

import org.junit.Assert.*
import org.junit.Test

class PlaybackHealthMonitorTest {
    @Test fun stalledReadySourceRecoversAtTheCurrentPosition() {
        val health = PlaybackHealthMonitor()
        health.reset(0, 42_000)
        assertFalse(health.sample(7_000, 42_000, true, true, false))
        assertTrue(health.sample(8_000, 42_000, true, true, false))
        assertFalse(health.sample(9_000, 42_000, true, true, false))
    }
    @Test fun userPauseAndFocusSuppressionNeverTriggerRecovery() {
        val health = PlaybackHealthMonitor()
        health.reset(0, 42_000)
        assertFalse(health.sample(60_000, 42_000, false, true, false))
        assertFalse(health.sample(120_000, 42_000, true, false, false))
        assertFalse(health.sample(121_000, 42_000, true, true, false))
    }
    @Test fun bufferingGetsTimeToRecoverButDoesNotHangForever() {
        val health = PlaybackHealthMonitor()
        health.reset(0, 0)
        assertFalse(health.sample(14_000, 0, true, true, true))
        assertTrue(health.sample(15_000, 0, true, true, true))
    }
    @Test fun movingPlaybackDoesNotRecoverAndASeekResetsTheDeadline() {
        val health = PlaybackHealthMonitor()
        health.reset(0, 0)
        for (second in 1L..60L) assertFalse(health.sample(second * 1_000, second * 1_000, true, true, false))
        assertTrue(health.progressingFor >= 5_000)
        health.reset(60_000, 120_000)
        assertFalse(health.sample(61_000, 120_000, true, true, false))
    }
}
