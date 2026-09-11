package com.voxen.music

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class VoxenStreamModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  init {
    VoxenStreamResolver.initialize(context)
  }

  override fun getName() = "VoxenStream"

  override fun invalidate() {
    scope.cancel()
    super.invalidate()
  }

  @ReactMethod
  fun resolve(videoId: String, promise: Promise) {
    if (!VIDEO_ID.matches(videoId)) {
      promise.reject("INVALID_VIDEO_ID", "Invalid YouTube video id")
      return
    }

    scope.launch {
      try {
        val stream = VoxenStreamResolver.resolveStream(videoId)
        val map = Arguments.createMap().apply {
          putString("uri", stream.audioUrl)
          val headersMap = Arguments.createMap()
          stream.headers.forEach { (k, v) -> headersMap.putString(k, v) }
          putMap("headers", headersMap)
          putString("client", stream.clientName)
          stream.bitrate?.let { putInt("bitrate", it) }
          stream.loudnessDb?.let { putDouble("loudnessDb", it) }
        }
        promise.resolve(map)
      } catch (error: CancellationException) {
        throw error
      } catch (error: Exception) {
        promise.reject("STREAM_RESOLVE_FAILED", error.message ?: "Stream resolution failed", error)
      }
    }
  }

  companion object {
    private val VIDEO_ID = Regex("^[A-Za-z0-9_-]{11}$")
  }
}
