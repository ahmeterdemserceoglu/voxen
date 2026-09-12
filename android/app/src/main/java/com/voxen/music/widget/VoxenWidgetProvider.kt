package com.voxen.music.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import com.voxen.music.MainActivity
import com.voxen.music.R
import com.voxen.music.playback.VoxenPlaybackService
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import java.util.concurrent.Executors

class VoxenWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        renderSaved(context)
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        renderSaved(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_PLAY_PAUSE -> control(context, VoxenPlaybackService.ACTION_TOGGLE, "playPause")
            ACTION_SEEK_BACK -> control(context, VoxenPlaybackService.ACTION_SEEK_BACK, null)
            ACTION_SEEK_FORWARD -> control(context, VoxenPlaybackService.ACTION_SEEK_FORWARD, null)
            ACTION_NEXT -> control(context, VoxenPlaybackService.ACTION_NEXT, "next")
            ACTION_SHUFFLE -> control(context, VoxenPlaybackService.ACTION_SHUFFLE, "queue")
            ACTION_REPEAT -> control(context, VoxenPlaybackService.ACTION_CYCLE_REPEAT, "queue")
            ACTION_PREV -> control(context, VoxenPlaybackService.ACTION_PREVIOUS, "prev")
        }
    }

    companion object {
        const val ACTION_PLAY_PAUSE = "com.voxen.music.ACTION_WIDGET_PLAY_PAUSE"
        const val ACTION_NEXT = "com.voxen.music.ACTION_WIDGET_NEXT"
        const val ACTION_SHUFFLE = "com.voxen.music.ACTION_WIDGET_SHUFFLE"
        const val ACTION_REPEAT = "com.voxen.music.ACTION_WIDGET_REPEAT"
        const val ACTION_PREV = "com.voxen.music.ACTION_WIDGET_PREV"
        const val ACTION_SEEK_BACK = "com.voxen.music.ACTION_WIDGET_SEEK_BACK"
        const val ACTION_SEEK_FORWARD = "com.voxen.music.ACTION_WIDGET_SEEK_FORWARD"
        const val PREFS_NAME = "voxen_widget_prefs"
        const val KEY_TITLE = "title"
        const val KEY_ARTIST = "artist"
        const val KEY_IS_PLAYING = "is_playing"
        const val KEY_ARTWORK_URL = "artwork_url"
        private const val KEY_POSITION = "position"
        private const val KEY_DURATION = "duration"
        private const val KEY_INDEX = "queue_index"
        private const val KEY_COUNT = "queue_count"
        private const val KEY_BUFFERING = "buffering"
        private const val KEY_NEXT_TITLE = "next_title"
        private const val KEY_NEXT_ARTIST = "next_artist"
        private const val KEY_SIGNATURE = "track_signature"
        private val artworkWorker = Executors.newSingleThreadExecutor()
        private var artworkUrl = ""
        private var bitmap: Bitmap? = null
        private var pendingArtwork: String? = null
        private var retryArtworkAt = 0L

        private fun control(context: Context, action: String, fallback: String?) {
            val savedQueue = context.getSharedPreferences("voxen_playback_state", Context.MODE_PRIVATE).getString("queue_json", "[]")
            val canResume = VoxenPlaybackService.instance != null || runCatching { JSONArray(savedQueue).length() > 0 }.getOrDefault(false)
            if (!canResume) {
                if (fallback != null) VoxenWidgetModule.onAction(fallback, context)
                else context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return
            }
            try {
                val intent = Intent(context, VoxenPlaybackService::class.java).setAction(action)
                ContextCompat.startForegroundService(context, intent)
            } catch (_: Exception) { fallback?.let { VoxenWidgetModule.onAction(it, context) } }
        }

        private fun time(ms: Long): String {
            val seconds = ms.coerceAtLeast(0L) / 1000
            return if (seconds >= 3600) "%d:%02d:%02d".format(seconds / 3600, seconds / 60 % 60, seconds % 60)
                else "%d:%02d".format(seconds / 60, seconds % 60)
        }

        private fun renderSaved(context: Context) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            updateAllWidgets(context, prefs.getString(KEY_TITLE, "voxen"), prefs.getString(KEY_ARTIST, "Müzik seç"), null,
                prefs.getBoolean(KEY_IS_PLAYING, false), artwork = prefs.getString(KEY_ARTWORK_URL, ""))
        }

        @Synchronized
        fun updateAllWidgets(context: Context, title: String?, artist: String?, artworkBitmap: Bitmap?, isPlaying: Boolean,
            position: Long? = null, duration: Long? = null, queueIndex: Int? = null, queueCount: Int? = null,
            buffering: Boolean? = null, artwork: String? = null, nextTitle: String? = null, nextArtist: String? = null, repeatMode: String? = null, shuffle: Boolean? = null) {
            val app = context.applicationContext
            val prefs = app.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val safeTitle = title?.takeIf { it.isNotBlank() } ?: "Müziğine dön"
            val safeArtist = artist?.takeIf { it.isNotBlank() } ?: "Bir şarkı seç ve başla"
            val signature = "$safeTitle|$safeArtist"
            val changed = prefs.getString(KEY_SIGNATURE, "") != signature
            val pos = (position ?: if (changed) 0L else prefs.getLong(KEY_POSITION, 0L)).coerceAtLeast(0L)
            val total = (duration ?: if (changed) 0L else prefs.getLong(KEY_DURATION, 0L)).coerceAtLeast(0L)
            val index = queueIndex ?: prefs.getInt(KEY_INDEX, 0)
            val count = queueCount ?: prefs.getInt(KEY_COUNT, 0)
            val loading = buffering ?: prefs.getBoolean(KEY_BUFFERING, false)
            val url = artwork ?: prefs.getString(KEY_ARTWORK_URL, "").orEmpty()
            val repeat = repeatMode ?: prefs.getString("repeat_mode", "off").orEmpty()
            val shuffled = shuffle ?: prefs.getBoolean("shuffle", false)
            val upNextTitle = nextTitle ?: prefs.getString(KEY_NEXT_TITLE, "").orEmpty()
            val upNextArtist = nextArtist ?: prefs.getString(KEY_NEXT_ARTIST, "").orEmpty()
            prefs.edit().putString(KEY_TITLE, safeTitle).putString(KEY_ARTIST, safeArtist).putString(KEY_SIGNATURE, signature)
                .putBoolean(KEY_IS_PLAYING, isPlaying).putLong(KEY_POSITION, pos).putLong(KEY_DURATION, total)
                .putString("repeat_mode", repeat).putBoolean("shuffle", shuffled)
                .putString(KEY_NEXT_TITLE, upNextTitle).putString(KEY_NEXT_ARTIST, upNextArtist)
                .putInt(KEY_INDEX, index).putInt(KEY_COUNT, count).putBoolean(KEY_BUFFERING, loading).putString(KEY_ARTWORK_URL, url).apply()
            if (url != artworkUrl) { artworkUrl = url; bitmap = null }
            if (artworkBitmap != null) { bitmap = artworkBitmap }
            val manager = AppWidgetManager.getInstance(app)
            val ids = manager.getAppWidgetIds(ComponentName(app, VoxenWidgetProvider::class.java))
            ids.forEach { id ->
                val options = manager.getAppWidgetOptions(id)
                val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 340)
                val expanded = height >= 330
                val compact = height < 180
                val narrow = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250) < 280
                val wide = compact && options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250) >= 340
                val layout = if (expanded) R.layout.voxen_app_widget_expanded else if (wide) R.layout.voxen_app_widget_wide else if (compact) R.layout.voxen_app_widget_compact else R.layout.voxen_app_widget
                // Send complete views: some launchers cache partial updates across service restarts.
                val views = RemoteViews(app.packageName, layout)
                run {
                    views.setTextViewText(R.id.widget_track_title, safeTitle)
                    views.setTextViewText(R.id.widget_track_artist, safeArtist)
                    bitmap?.let { views.setImageViewBitmap(R.id.widget_album_art, it) }
                        ?: views.setImageViewResource(R.id.widget_album_art, R.drawable.ic_widget_music_note)
                    val open = PendingIntent.getActivity(app, 0, Intent(app, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                    views.setOnClickPendingIntent(R.id.widget_info_container, open)
                    views.setOnClickPendingIntent(R.id.widget_album_art, open)
                    fun action(view: Int, name: String, request: Int) {
                        views.setOnClickPendingIntent(view, PendingIntent.getBroadcast(app, request,
                            Intent(app, VoxenWidgetProvider::class.java).setAction(name), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
                    }
                    action(R.id.widget_btn_prev, ACTION_PREV, 3)
                    action(R.id.widget_btn_seek_back, ACTION_SEEK_BACK, 4)
                    action(R.id.widget_btn_play_pause, ACTION_PLAY_PAUSE, 1)
                    action(R.id.widget_btn_seek_forward, ACTION_SEEK_FORWARD, 5)
                    action(R.id.widget_btn_next, ACTION_NEXT, 2)
                    views.setViewVisibility(R.id.widget_btn_seek_back, if (narrow) View.GONE else View.VISIBLE)
                    views.setViewVisibility(R.id.widget_btn_seek_forward, if (narrow) View.GONE else View.VISIBLE)
                }
                views.setImageViewResource(R.id.widget_btn_play_pause, if (isPlaying) R.drawable.ic_widget_pause else R.drawable.ic_widget_play)
                views.setContentDescription(R.id.widget_btn_play_pause, if (isPlaying) "Duraklat" else "Oynat")
                views.setTextViewText(R.id.widget_status, if (loading) "BAĞLANIYOR" else if (isPlaying) "ŞİMDİ ÇALIYOR" else "MÜZİĞİN HAZIR")
                views.setTextViewText(R.id.widget_elapsed, time(pos))
                views.setTextViewText(R.id.widget_duration, time(total))
                views.setTextViewText(R.id.widget_queue_count, if (count > 0) "${index + 1} / $count" else "VOXEN MUSIC")
                views.setProgressBar(R.id.widget_progress, 1000, if (total > 0) (pos.coerceAtMost(total) * 1000 / total).toInt() else 0, false)
                if (expanded) {
                    views.setOnClickPendingIntent(R.id.widget_btn_shuffle, PendingIntent.getBroadcast(app, 7, Intent(app, VoxenWidgetProvider::class.java).setAction(ACTION_SHUFFLE), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
                    views.setOnClickPendingIntent(R.id.widget_btn_repeat, PendingIntent.getBroadcast(app, 8, Intent(app, VoxenWidgetProvider::class.java).setAction(ACTION_REPEAT), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
                    views.setImageViewResource(R.id.widget_btn_shuffle, if (shuffled) R.drawable.ic_widget_shuffle_active else R.drawable.ic_widget_shuffle)
                    views.setImageViewResource(R.id.widget_btn_repeat, if (repeat == "one") R.drawable.ic_widget_repeat_one else if (repeat == "all") R.drawable.ic_widget_repeat_active else R.drawable.ic_widget_repeat)
                    views.setContentDescription(R.id.widget_btn_shuffle, if (shuffled) "Karışık çalma açık" else "Karışık çalma kapalı")
                    views.setContentDescription(R.id.widget_btn_repeat, if (repeat == "one") "Tek şarkıyı tekrarla" else if (repeat == "all") "Sırayı tekrarla" else "Tekrar kapalı")
                    views.setTextViewText(R.id.widget_next_title, upNextTitle.ifBlank { "Kuyruğunu oluştur" })
                    views.setTextViewText(R.id.widget_next_artist, upNextArtist.ifBlank { "Uygulamadan sıradaki şarkıları ekle" })
                    val openQueue = PendingIntent.getActivity(app, 6, Intent(app, MainActivity::class.java).putExtra("widget_action", "queue"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                    views.setOnClickPendingIntent(R.id.widget_next_container, openQueue)
                    views.setContentDescription(R.id.widget_next_container, if (upNextTitle.isBlank()) "Şarkı seçmek için Voxen'i aç" else "Sıradaki: $upNextTitle, $upNextArtist")
                }
                manager.updateAppWidget(id, views)
            }
            if (ids.isNotEmpty() && bitmap == null && url.startsWith("https://") && pendingArtwork != url && System.currentTimeMillis() >= retryArtworkAt) {
                pendingArtwork = url
                artworkWorker.execute {
                    val loaded = runCatching {
                        val connection = URL(url).openConnection() as HttpURLConnection
                        connection.connectTimeout = 5000; connection.readTimeout = 5000
                        try { connection.inputStream.use { input -> BitmapFactory.decodeStream(input)?.let { Bitmap.createScaledBitmap(it, 320, 320, true) } } }
                        finally { connection.disconnect() }
                    }.getOrNull()
                    synchronized(this) {
                        if (pendingArtwork == url) pendingArtwork = null
                        if (artworkUrl == url) {
                            bitmap = loaded
                            retryArtworkAt = if (loaded == null) System.currentTimeMillis() + 30_000 else 0
                            renderSaved(app)
                        }
                    }
                }
            }
        }
    }
}
