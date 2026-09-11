package com.voxen.music.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import com.voxen.music.MainActivity
import com.voxen.music.R
import com.voxen.music.playback.VoxenPlaybackService

class VoxenWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        updateAllWidgets(
            context,
            prefs.getString(KEY_TITLE, "voxen"),
            prefs.getString(KEY_ARTIST, "Müzik başlatın"),
            null,
            prefs.getBoolean(KEY_IS_PLAYING, false)
        )
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action ?: return) {
            ACTION_PLAY_PAUSE -> controlPlaybackService(context, VoxenPlaybackService.ACTION_TOGGLE, "playPause")
            ACTION_SEEK_BACK -> controlPlaybackService(context, VoxenPlaybackService.ACTION_SEEK_BACK, null)
            ACTION_SEEK_FORWARD -> controlPlaybackService(context, VoxenPlaybackService.ACTION_SEEK_FORWARD, null)
            ACTION_NEXT -> controlPlaybackService(context, VoxenPlaybackService.ACTION_NEXT, "next")
            ACTION_PREV -> controlPlaybackService(context, VoxenPlaybackService.ACTION_PREVIOUS, "prev")
        }
    }

    companion object {
        const val ACTION_PLAY_PAUSE = "com.voxen.music.ACTION_WIDGET_PLAY_PAUSE"
        const val ACTION_NEXT = "com.voxen.music.ACTION_WIDGET_NEXT"
        const val ACTION_PREV = "com.voxen.music.ACTION_WIDGET_PREV"
        const val ACTION_SEEK_BACK = "com.voxen.music.ACTION_WIDGET_SEEK_BACK"
        const val ACTION_SEEK_FORWARD = "com.voxen.music.ACTION_WIDGET_SEEK_FORWARD"

        const val PREFS_NAME = "voxen_widget_prefs"
        const val KEY_TITLE = "title"
        const val KEY_ARTIST = "artist"
        const val KEY_IS_PLAYING = "is_playing"
        const val KEY_ARTWORK_URL = "artwork_url"

                private var lastBitmap: Bitmap? = null

        private fun controlPlaybackService(context: Context, serviceAction: String, fallbackJsAction: String?) {
            try {
                val serviceIntent = Intent(context, VoxenPlaybackService::class.java).apply {
                    action = serviceAction
                }
                ContextCompat.startForegroundService(context, serviceIntent)
            } catch (_: Exception) {
                fallbackJsAction?.let { VoxenWidgetModule.onAction(it, context) }
            }
        }

        fun updateAllWidgets(
            context: Context,
            title: String?,
            artist: String?,
            artworkBitmap: Bitmap?,
            isPlaying: Boolean
        ) {
            lastBitmap = artworkBitmap ?: lastBitmap
            val appWidgetManager = AppWidgetManager.getInstance(context) ?: return
            val appWidgetIds = appWidgetManager.getAppWidgetIds(
                ComponentName(context, VoxenWidgetProvider::class.java)
            )
            if (appWidgetIds.isEmpty()) return

            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else PendingIntent.FLAG_UPDATE_CURRENT

            for (appWidgetId in appWidgetIds) {
                val views = RemoteViews(context.packageName, R.layout.voxen_app_widget)
                views.setTextViewText(R.id.widget_track_title, title?.takeIf { it.isNotBlank() } ?: "voxen")
                views.setTextViewText(R.id.widget_track_artist, artist?.takeIf { it.isNotBlank() } ?: "Müzik başlatın")
                views.setImageViewResource(
                    R.id.widget_btn_play_pause,
                    if (isPlaying) R.drawable.ic_widget_pause else R.drawable.ic_widget_play
                )
                lastBitmap?.let { views.setImageViewBitmap(R.id.widget_album_art, it) }
                    ?: views.setImageViewResource(R.id.widget_album_art, R.drawable.ic_widget_music_note)

                val openAppIntent = Intent(context, MainActivity::class.java).apply {
                    this.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
                val openAppPendingIntent = PendingIntent.getActivity(context, 0, openAppIntent, flags)
                views.setOnClickPendingIntent(R.id.widget_album_art, openAppPendingIntent)
                views.setOnClickPendingIntent(R.id.widget_info_container, openAppPendingIntent)

                fun actionIntent(action: String, requestCode: Int): PendingIntent {
                    val intent = Intent(context, VoxenWidgetProvider::class.java).apply { this.action = action }
                    return PendingIntent.getBroadcast(context, requestCode, intent, flags)
                }

                views.setOnClickPendingIntent(R.id.widget_btn_prev, actionIntent(ACTION_PREV, 3))
                views.setOnClickPendingIntent(R.id.widget_btn_seek_back, actionIntent(ACTION_SEEK_BACK, 4))
                views.setOnClickPendingIntent(R.id.widget_btn_play_pause, actionIntent(ACTION_PLAY_PAUSE, 1))
                views.setOnClickPendingIntent(R.id.widget_btn_seek_forward, actionIntent(ACTION_SEEK_FORWARD, 5))
                views.setOnClickPendingIntent(R.id.widget_btn_next, actionIntent(ACTION_NEXT, 2))

                appWidgetManager.updateAppWidget(appWidgetId, views)
            }
        }
    }
}

