package com.voxen.music.download

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import org.json.JSONObject

class VoxenDownloadModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "VoxenDownloader"
    @ReactMethod fun download(json: String, uri: String, promise: Promise) {
        try {
            val requestId = java.util.UUID.randomUUID().toString()
            val request = PendingDownload(promise, requestId)
            val job = JSONObject(json).put("uri", uri).put("state", "queued").put("requestId", requestId)
            val key = job.getString("key")
            if (pending.putIfAbsent(key, request) != null) { promise.reject("DOWNLOAD_ACTIVE", "Bu şarkı zaten indiriliyor"); return }
            try { ContextCompat.startForegroundService(context, Intent(context, VoxenDownloadService::class.java).putExtra("job", job.toString())) }
            catch (error: Exception) { pending.remove(key, request); throw error }
        } catch (error: Exception) { promise.reject("DOWNLOAD_START", error) }
    }
    @ReactMethod fun cancel(key: String) = VoxenDownloadService.cancel(context, key)
    @ReactMethod fun cancelAll() = VoxenDownloadService.cancel(context, null)
    @ReactMethod fun results(promise: Promise) { promise.resolve(VoxenDownloadService.saved(context).toString()) }
    @ReactMethod fun acknowledge(key: String) = VoxenDownloadService.acknowledge(context, key)
    @ReactMethod fun clearPartial(owner: String) {
        val jobs = VoxenDownloadService.saved(context)
        jobs.keys().forEach { key -> val job = jobs.getJSONObject(key)
            if (job.optString("owner") == owner) {
                VoxenDownloadService.discard(context, key)
                val path = android.net.Uri.parse(job.optString("uri")).path
                if (path != null && java.io.File(path).canonicalPath.startsWith(context.filesDir.canonicalPath + java.io.File.separator)) {
                    java.io.File(path).delete(); java.io.File(path + ".part").delete(); java.io.File(path + ".part.json").delete()
                }
                VoxenDownloadService.acknowledge(context, key)
            }
        }
    }
    @ReactMethod fun addListener(name: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
    companion object {
        private data class PendingDownload(val promise: Promise, val requestId: String)
        private val pending = java.util.concurrent.ConcurrentHashMap<String, PendingDownload>()
        fun finish(key: String, json: String?, error: String?, requestId: String? = null) {
            val request = pending[key] ?: return
            if (requestId != null && request.requestId != requestId) return
            if (!pending.remove(key, request)) return
            val promise = request.promise
            if (json != null) promise.resolve(json) else promise.reject("DOWNLOAD_FAILED", error ?: "İndirme durduruldu")
        }
    }
}
