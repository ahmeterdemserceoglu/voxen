package com.voxen.music

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * AudioFocusModule
 *
 * Handles Android audio focus changes and headphone removal events,
 * forwarding them to the React Native layer via NativeEventEmitter.
 *
 * JS Events emitted:
 *  - "audioFocusLost"     : Transient or permanent focus loss (phone call, notification, etc.)
 *  - "audioFocusGained"   : Focus returned to this app
 *  - "headphonesRemoved"  : Wired/BT headphones disconnected (ACTION_AUDIO_BECOMING_NOISY)
 */
class AudioFocusModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "AudioFocusModule"
        private const val EVENT_FOCUS_LOST = "audioFocusLost"
        private const val EVENT_FOCUS_GAINED = "audioFocusGained"
        private const val EVENT_HEADPHONES_REMOVED = "headphonesRemoved"
    }

    private val audioManager: AudioManager by lazy {
        reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

    private var isRegistered = false

    // ── Audio focus change listener ──────────────────────────────────────────

    private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                Log.d(TAG, "Audio focus lost: $focusChange")
                sendEvent(EVENT_FOCUS_LOST, null)
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                // Another app needs focus briefly (e.g. navigation prompt).
                // We choose to pause rather than duck for music content.
                Log.d(TAG, "Audio focus loss can duck — pausing")
                sendEvent(EVENT_FOCUS_LOST, null)
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                Log.d(TAG, "Audio focus gained")
                sendEvent(EVENT_FOCUS_GAINED, null)
            }
        }
    }

    // ── Becoming Noisy receiver (headphones removed) ─────────────────────────

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                Log.d(TAG, "Headphones removed (becoming noisy)")
                sendEvent(EVENT_HEADPHONES_REMOVED, null)
            }
        }
    }

    // ── ReactContextBaseJavaModule ───────────────────────────────────────────

    override fun getName(): String = "AudioFocusModule"

    override fun initialize() {
        super.initialize()
        registerListeners()
    }

    override fun invalidate() {
        unregisterListeners()
        super.invalidate()
    }

    // ── JS-accessible methods ────────────────────────────────────────────────

    /**
     * Explicitly request audio focus (optional — expo-audio handles this
     * internally, but exposed for JS-side manual control if needed).
     */
    @ReactMethod
    fun requestFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // On API 26+ use AudioFocusRequest; expo-audio manages this already,
            // so this method is a no-op stub kept for API surface completeness.
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                focusChangeListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN,
            )
        }
    }

    /** Required for NativeEventEmitter on React Native new architecture. */
    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {}

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {}

    // ── Private helpers ──────────────────────────────────────────────────────

    private fun registerListeners() {
        if (isRegistered) return
        try {
            val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
            reactContext.registerReceiver(noisyReceiver, filter)
            isRegistered = true
            Log.d(TAG, "AudioFocusModule listeners registered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register AudioFocusModule listeners", e)
        }
    }

    private fun unregisterListeners() {
        if (!isRegistered) return
        try {
            reactContext.unregisterReceiver(noisyReceiver)
            isRegistered = false
            Log.d(TAG, "AudioFocusModule listeners unregistered")
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering AudioFocusModule listeners", e)
        }
    }

    private fun sendEvent(eventName: String, data: Any?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(eventName, data)
    }
}
