package com.voxen.music.widget

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.voxen.music.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.cancel
import java.net.HttpURLConnection
import java.net.URL

class VoxenWidgetModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var lastLoadedUrl: String? = null
    private var cachedBitmap: Bitmap? = null
    private var revision = 0L

    init {
        instance = this
    }

    override fun getName(): String = "VoxenWidget"

    override fun onCatalystInstanceDestroy() {
        scope.cancel()
        super.onCatalystInstanceDestroy()
        if (instance == this) {
            instance = null
        }
    }

    @ReactMethod
    fun consumePendingAction(promise: Promise) {
        reactContext.runOnUiQueueThread {
            val intent = reactContext.currentActivity?.intent
            val action = intent?.getStringExtra("widget_action")
            intent?.removeExtra("widget_action")
            promise.resolve(action)
        }
    }

    @ReactMethod
    @Synchronized
    fun updateWidget(title: String?, artist: String?, artworkUrl: String?, isPlaying: Boolean) {
        val request = ++revision
        val safeTitle = title ?: "voxen"
        val safeArtist = artist ?: "Müzik başlatın"

        // Save into preferences
        val prefs = reactContext.getSharedPreferences(VoxenWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(VoxenWidgetProvider.KEY_TITLE, safeTitle)
            .putString(VoxenWidgetProvider.KEY_ARTIST, safeArtist)
            .putString(VoxenWidgetProvider.KEY_ARTWORK_URL, artworkUrl ?: "")
            .putBoolean(VoxenWidgetProvider.KEY_IS_PLAYING, isPlaying)
            .apply()

        val cached = if (artworkUrl == lastLoadedUrl) cachedBitmap else null
        scope.launch {
            val bitmap = cached ?: artworkUrl?.takeIf { it.isNotBlank() }?.let { fetchAndRoundBitmap(it) }
            synchronized(this@VoxenWidgetModule) {
                if (request == revision) {
                    lastLoadedUrl = artworkUrl
                    cachedBitmap = bitmap
                    VoxenWidgetProvider.updateAllWidgets(reactContext, safeTitle, safeArtist, bitmap, isPlaying)
                }
            }
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN NativeEventEmitter
    }

    private fun fetchAndRoundBitmap(urlStr: String): Bitmap? {
        return try {
            val url = URL(urlStr)
            val connection = url.openConnection() as HttpURLConnection
            connection.doInput = true
            connection.connectTimeout = 4000
            connection.readTimeout = 4000
            connection.connect()

            val input = connection.inputStream
            val original = BitmapFactory.decodeStream(input)
            input.close()
            connection.disconnect()

            if (original != null) {
                // Scale to 160x160 for widget performance & RemoteViews limits
                val scaled = Bitmap.createScaledBitmap(original, 160, 160, true)
                getRoundedCornerBitmap(scaled, 22f)
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun getRoundedCornerBitmap(bitmap: Bitmap, cornerRadius: Float): Bitmap {
        val output = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint().apply {
            isAntiAlias = true
            color = -0x1
        }
        val rect = Rect(0, 0, bitmap.width, bitmap.height)
        val rectF = RectF(rect)

        canvas.drawRoundRect(rectF, cornerRadius, cornerRadius, paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        canvas.drawBitmap(bitmap, rect, rect, paint)
        return output
    }

    companion object {
        @Volatile
        private var instance: VoxenWidgetModule? = null

        fun onAction(action: String, context: Context) {
            val activeModule = instance
            if (activeModule != null && activeModule.reactContext.hasActiveReactInstance()) {
                activeModule.reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit("onWidgetAction", action)
            } else {
                // App is not in foreground/background or destroyed: launch app with action extra
                val intent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                    putExtra("widget_action", action)
                }
                context.startActivity(intent)
            }
        }
    }
}
