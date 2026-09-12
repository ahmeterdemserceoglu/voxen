package com.voxen.music.playback

import android.app.Instrumentation
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Exercises the real Android service without changing account/library data. */
class PlaybackInstrumentation : Instrumentation() {
    private var durationSeconds = 60L
    override fun onCreate(arguments: Bundle?) {
        durationSeconds = arguments?.getString("seconds")?.toLongOrNull()?.coerceIn(10, 120) ?: 60L
        super.onCreate(arguments); start()
    }
    override fun onStart() {
        val result = Bundle()
        val prefs = targetContext.getSharedPreferences("voxen_playback_state", Context.MODE_PRIVATE)
        val original = prefs.all.toMap()
        val audio = original["audio_settings"] as? String ?: "{}"
        val file = File(targetContext.filesDir, "playback-instrumentation.wav")
        try {
            writeSilence(file, 120)
            command(VoxenPlaybackService.ACTION_SETTINGS) { putExtra(VoxenPlaybackService.EXTRA_SETTINGS, JSONObject().put("equalizerEnabled", true).put("equalizerBands", JSONArray(listOf(0, 0, 0, 0, 0))).toString()) }
            command(VoxenPlaybackService.ACTION_SHUFFLE_FLAG) { putExtra(VoxenPlaybackService.EXTRA_SHUFFLE, false) }
            command(VoxenPlaybackService.ACTION_REPEAT) { putExtra(VoxenPlaybackService.EXTRA_REPEAT, "off") }
            val tracks = JSONArray((1..2).map { i -> JSONObject().put("id", "instrumentation-$i").put("videoId", "instrumentation-$i").put("title", "Voxen oynatıcı testi").put("artist", "Sessiz test • lütfen bekle").put("duration", 120_000).put("localUri", file.toURI().toString()) }).toString()
            command(VoxenPlaybackService.ACTION_SET_QUEUE) { putExtra(VoxenPlaybackService.EXTRA_QUEUE_JSON, tracks); putExtra(VoxenPlaybackService.EXTRA_INDEX, 0); putExtra(VoxenPlaybackService.EXTRA_PLAY, true); putExtra(VoxenPlaybackService.EXTRA_POSITION, 0L) }
            await("yerel ses başlamadı") { PlaybackStateHolder.trackId == "instrumentation-1" && PlaybackStateHolder.isPlaying }
            val start = PlaybackStateHolder.position
            Thread.sleep(durationSeconds * 1000)
            check(PlaybackStateHolder.isPlaying && PlaybackStateHolder.position >= start + (durationSeconds - 5) * 1000) { "Kilit ekranında çalma ilerlemedi" }
            result.putString("screen_off_${durationSeconds}_seconds", "passed")
            command(VoxenPlaybackService.ACTION_SEEK_TO) { putExtra(VoxenPlaybackService.EXTRA_POSITION, 80_000L) }
            await("ileri sarma konumu korunmadı") { PlaybackStateHolder.position in 80_000L..85_000L && PlaybackStateHolder.isPlaying }
            result.putString("seek_position", "passed")
            command(VoxenPlaybackService.ACTION_SHUFFLE)
            await("karışık modu uygulanmadı") { PlaybackStateHolder.shuffle }
            command(VoxenPlaybackService.ACTION_CYCLE_REPEAT)
            await("tekrar modu uygulanmadı") { PlaybackStateHolder.repeatMode == "all" }
            result.putString("widget_modes", "passed")
            command(VoxenPlaybackService.ACTION_SETTINGS) { putExtra(VoxenPlaybackService.EXTRA_SETTINGS, JSONObject().put("sleepTimerDeadline", System.currentTimeMillis() + 3000).toString()) }
            await("uyku zamanlayıcısı durdurmadı", 7000) { !PlaybackStateHolder.wantsToPlay && !PlaybackStateHolder.isPlaying }
            val paused = PlaybackStateHolder.position
            Thread.sleep(10_000)
            check(!PlaybackStateHolder.wantsToPlay && kotlin.math.abs(PlaybackStateHolder.position - paused) < 250) { "Watchdog zamanlayıcıdan sonra yeniden başlattı" }
            result.putString("native_sleep_timer", "passed")
            command(VoxenPlaybackService.ACTION_SETTINGS) { putExtra(VoxenPlaybackService.EXTRA_SETTINGS, JSONObject().put("sleepTimerTrackEnd", true).toString()) }
            command(VoxenPlaybackService.ACTION_SEEK_TO) { putExtra(VoxenPlaybackService.EXTRA_POSITION, 118_000L) }
            command(VoxenPlaybackService.ACTION_PLAY)
            await("parça sonu zamanlayıcısı durdurmadı", 8000) { !PlaybackStateHolder.wantsToPlay && !PlaybackStateHolder.isPlaying && PlaybackStateHolder.position >= 119_000 }
            check(PlaybackStateHolder.trackId == "instrumentation-1") { "Zamanlayıcı sıradaki parçaya geçti" }
            result.putString("track_end_sleep", "passed")
            result.putString("result", "Success")
        } catch (error: Throwable) { result.putString("result", "Failed: ${error.stackTraceToString()}") }
        finally {
            // Restore native state paused; account-scoped JS data is untouched.
            command(VoxenPlaybackService.ACTION_SETTINGS) { putExtra(VoxenPlaybackService.EXTRA_SETTINGS, audio) }
            command(VoxenPlaybackService.ACTION_SHUFFLE_FLAG) { putExtra(VoxenPlaybackService.EXTRA_SHUFFLE, original["shuffle"] as? Boolean ?: false) }
            command(VoxenPlaybackService.ACTION_REPEAT) { putExtra(VoxenPlaybackService.EXTRA_REPEAT, original["repeat_mode"] as? String ?: "off") }
            command(VoxenPlaybackService.ACTION_SET_QUEUE) { putExtra(VoxenPlaybackService.EXTRA_QUEUE_JSON, original["queue_json"] as? String ?: "[]"); putExtra(VoxenPlaybackService.EXTRA_INDEX, original["queue_index"] as? Int ?: 0); putExtra(VoxenPlaybackService.EXTRA_POSITION, original["position"] as? Long ?: 0L); putExtra(VoxenPlaybackService.EXTRA_PLAY, false) }
            runOnMainSync { targetContext.stopService(Intent(targetContext, VoxenPlaybackService::class.java)) }
            Thread.sleep(500)
            val edit = prefs.edit().clear()
            original.forEach { (key, value) -> when(value) { is String -> edit.putString(key, value); is Long -> edit.putLong(key, value); is Int -> edit.putInt(key, value); is Boolean -> edit.putBoolean(key, value); is Float -> edit.putFloat(key, value) } }
            edit.commit(); file.delete()
        }
        finish(if (result.getString("result") == "Success") -1 else 0, result)
    }
    private fun command(action: String, extras: Intent.() -> Unit = {}) {
        runOnMainSync { targetContext.startService(Intent(targetContext, VoxenPlaybackService::class.java).setAction(action).apply(extras)) }
    }
    private fun await(message: String, timeout: Long = 8000, predicate: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + timeout
        while (!predicate() && SystemClock.elapsedRealtime() < deadline) Thread.sleep(100)
        check(predicate()) { message }
    }
    private fun writeSilence(file: File, seconds: Int) {
        val bytes = seconds * 16000 * 2
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
            .put("RIFF".toByteArray()).putInt(bytes + 36).put("WAVEfmt ".toByteArray()).putInt(16).putShort(1).putShort(1)
            .putInt(16000).putInt(32000).putShort(2).putShort(16).put("data".toByteArray()).putInt(bytes).array()
        RandomAccessFile(file, "rw").use { it.write(header); it.setLength(bytes + 44L) }
    }
}
