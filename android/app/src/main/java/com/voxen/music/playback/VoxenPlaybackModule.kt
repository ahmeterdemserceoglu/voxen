package com.voxen.music.playback

import android.content.Intent
import android.os.Bundle
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class VoxenPlaybackModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    init { instance = this }
    override fun getName(): String = "VoxenPlayback"

    private fun send(action: String, configure: (Intent.() -> Unit)? = null) {
        val intent = Intent(reactContext, VoxenPlaybackService::class.java).setAction(action)
        configure?.invoke(intent)
        reactContext.startService(intent)
    }

    @ReactMethod
    fun setQueue(queueJson: String, index: Double, play: Boolean, localUri: String?) {
        send(VoxenPlaybackService.ACTION_SET_QUEUE) {
            putExtra(VoxenPlaybackService.EXTRA_QUEUE_JSON, queueJson)
            putExtra(VoxenPlaybackService.EXTRA_INDEX, index.toInt())
            putExtra(VoxenPlaybackService.EXTRA_PLAY, play)
            putExtra(VoxenPlaybackService.EXTRA_LOCAL_URI, localUri)
        }
    }

    @ReactMethod fun play() = send(VoxenPlaybackService.ACTION_PLAY)
    @ReactMethod fun pause() = send(VoxenPlaybackService.ACTION_PAUSE)
    @ReactMethod fun toggle() = send(VoxenPlaybackService.ACTION_TOGGLE)
    @ReactMethod fun next() = send(VoxenPlaybackService.ACTION_NEXT)
    @ReactMethod fun previous() = send(VoxenPlaybackService.ACTION_PREVIOUS)
    @ReactMethod fun seek(position: Double) = send(VoxenPlaybackService.ACTION_SEEK_TO) { putExtra(VoxenPlaybackService.EXTRA_POSITION, position.toLong()) }
    @ReactMethod fun seekForward() = send(VoxenPlaybackService.ACTION_SEEK_FORWARD)
    @ReactMethod fun seekBack() = send(VoxenPlaybackService.ACTION_SEEK_BACK)
    @ReactMethod fun stop() = send(VoxenPlaybackService.ACTION_STOP)
    @ReactMethod
    fun getStatus(promise: Promise) {
        reactContext.runOnUiQueueThread {
            val service = VoxenPlaybackService.instance
            service?.refreshState()
            promise.resolve(Arguments.createMap().apply {
                putBoolean("serviceAvailable", service != null)
                putBoolean("isPlaying", PlaybackStateHolder.isPlaying)
                putBoolean("wantsToPlay", PlaybackStateHolder.wantsToPlay)
                putDouble("position", PlaybackStateHolder.position.toDouble())
                putDouble("duration", PlaybackStateHolder.duration.toDouble())
                putInt("queueIndex", PlaybackStateHolder.queueIndex)
                putString("trackId", PlaybackStateHolder.trackId)
                putString("error", PlaybackStateHolder.error)
            })
        }
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    override fun invalidate() {
        if (instance === this) instance = null
        super.invalidate()
    }

    companion object {
        @Volatile private var instance: VoxenPlaybackModule? = null

        fun emitState(bundle: Bundle) {
            val module = instance ?: return
            if (!module.reactContext.hasActiveReactInstance()) return
            val map = Arguments.fromBundle(bundle) ?: return
            module.reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("voxenPlaybackState", map)
        }
    }
}
