package com.voxen.music.playback
import org.junit.Assert.*
import org.junit.Test
class AudioEnvelopeTest {
    @Test fun fadesAtBothEndsButKeepsMiddleVolume() {
        assertEquals(0f, AudioEnvelope.volume(0, 20000, 2000, null, false), 0.001f)
        assertEquals(0.5f, AudioEnvelope.volume(1000, 20000, 2000, null, false), 0.001f)
        assertEquals(1f, AudioEnvelope.volume(10000, 20000, 2000, null, false), 0.001f)
        assertEquals(0.5f, AudioEnvelope.volume(19000, 20000, 2000, null, false), 0.001f)
    }
    @Test fun normalizationAndEqualizerHeadroomDoNotAmplifyOrClip() {
        assertEquals(0.501f, AudioEnvelope.volume(1000, 0, 0, 6.0, true), 0.002f)
        assertEquals(1f, AudioEnvelope.volume(1000, 0, 0, -6.0, true), 0.001f)
        assertEquals(0.501f, AudioEnvelope.volume(1000, 0, 0, null, false, 6.0), 0.002f)
    }
}
