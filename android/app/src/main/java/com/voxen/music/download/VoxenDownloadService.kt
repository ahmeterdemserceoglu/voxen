package com.voxen.music.download

import android.app.*
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.voxen.music.MainActivity
import com.voxen.music.R
import com.voxen.music.VoxenStreamResolver
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

class VoxenDownloadService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val slots = kotlinx.coroutines.sync.Semaphore(2)
    private val jobs = ConcurrentHashMap<String, Job>()
    private val activeRequests = ConcurrentHashMap<String, String>()
    private val connections = ConcurrentHashMap<String, HttpURLConnection>()
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate(); instance = this; VoxenStreamResolver.initialize(this)
        if (Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL, "Müzik indirmeleri", NotificationManager.IMPORTANCE_LOW))
        notify("İndirmeler hazırlanıyor", 0)
        val old = saved(this)
        old.keys().forEach { key -> old.optJSONObject(key)?.let { if (it.optString("state") in listOf("queued", "downloading")) enqueue(it) } }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, id: Int): Int {
        intent?.getStringExtra("job")?.let { enqueue(JSONObject(it)) }
        return START_STICKY
    }
    private fun notify(title: String, progress: Int) {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        startForeground(ID, NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_widget_music_note).setContentTitle(title)
            .setContentText("${jobs.size.coerceAtLeast(1)} indirme • $progress%")
            .setContentIntent(open).setOnlyAlertOnce(true).setSilent(true).setOngoing(true).setProgress(100, progress, progress == 0).build())
    }
    private fun enqueue(input: JSONObject) {
        val key = input.getString("key")
        val previous = jobs[key]
        if (previous?.isActive == true && saved(this).optJSONObject(key)?.optString("state") in listOf("queued", "downloading")) { activeRequests[key] = input.optString("requestId"); return }
        val version = revisions.incrementAndGet()
        versions[key] = version
        activeRequests[key] = input.optString("requestId")
        input.put("version", version)
        store(this, key, input.put("state", "queued"))
        val job = scope.launch(start = CoroutineStart.LAZY) {
            var acquired = false
            try {
                previous?.join()
                slots.acquire(); acquired = true
                val file = File(Uri.parse(input.getString("uri")).path ?: error("Geçersiz dosya"))
                val root = filesDir.canonicalFile
                require(file.canonicalPath.startsWith(root.path + File.separator)) { "Geçersiz indirme dizini" }
                file.parentFile?.mkdirs()
                val part = File(file.path + ".part")
                val metadata = File(part.path + ".json")
                var last: Exception? = null
                for (attempt in 0..3) {
                    ensureActive()
                    try {
                        val source = withTimeout(30_000) { VoxenStreamResolver.resolveStream(input.getString("videoId")) }
                        val previous = runCatching { JSONObject(metadata.readText()) }.getOrDefault(JSONObject())
                        if (previous.optInt("itag", -1) != source.itag || (source.contentLengthBytes != null && previous.optLong("total", -1) != source.contentLengthBytes)) part.delete()
                        var offset = if (part.exists()) part.length() else 0L
                        metadata.writeText(JSONObject().put("itag", source.itag).put("total", source.contentLengthBytes ?: -1).toString())
                        val connection = URL(source.audioUrl).openConnection() as HttpURLConnection
                        connections[key] = connection
                        connection.connectTimeout = 15_000; connection.readTimeout = 15_000
                        source.headers.forEach { (name, value) -> connection.setRequestProperty(name, value) }
                        if (offset > 0) {
                            connection.setRequestProperty("Range", "bytes=$offset-")
                            previous.optString("etag").takeIf { it.isNotBlank() }?.let { connection.setRequestProperty("If-Range", it) }
                        }
                        try {
                            val code = connection.responseCode
                            if (code == 416 && source.contentLengthBytes == offset && offset > 0) { require(part.renameTo(file)); metadata.delete(); last = null; break }
                            require(code == 200 || code == 206) { "İndirme bağlantısı: HTTP $code" }
                            require(!Regex("text/|json|html", RegexOption.IGNORE_CASE).containsMatchIn(connection.contentType.orEmpty())) { "Geçersiz ses dosyası" }
                            if (code == 200) offset = 0L
                            val etag = connection.getHeaderField("ETag").orEmpty()
                            if (code == 206 && previous.optString("etag").isNotBlank() && etag != previous.optString("etag")) { part.delete(); error("Ses kaynağı değişti; indirme yenileniyor") }
                            metadata.writeText(JSONObject().put("itag", source.itag).put("total", source.contentLengthBytes ?: -1).put("etag", etag).toString())
                            val total = if (code == 206) DownloadRange.total(connection.getHeaderField("Content-Range"), offset) ?: error("Geçersiz indirme aralığı")
                                else connection.contentLengthLong.takeIf { it > 0 } ?: source.contentLengthBytes ?: -1L
                            input.put("state", "downloading").put("bytes", offset).put("total", total); store(this@VoxenDownloadService, key, input)
                            var lastTick = 0L
                            val received = connection.inputStream.use { stream -> StreamingFile.copy(stream, part, offset, { ensureActive() }) { received ->
                                if (System.currentTimeMillis() - lastTick > 750) {
                                    lastTick = System.currentTimeMillis()
                                    input.put("bytes", received); store(this@VoxenDownloadService, key, input)
                                    notify(input.optString("title", "Müzik indiriliyor"), if (total > 0) (received * 100 / total).toInt().coerceIn(0, 99) else 0)
                                }
                            } }
                            require(received > 0 && (total <= 0 || received == total)) { "İndirme yarıda kaldı" }
                            require(part.renameTo(file)) { "Dosya kaydedilemedi" }
                            metadata.delete(); last = null; break
                        } finally { connection.disconnect(); connections.remove(key, connection) }
                    } catch (cancel: CancellationException) { throw cancel }
                    catch (error: Exception) { last = error; if (attempt < 3) delay((attempt + 1) * 1500L) }
                }
                if (last != null) throw last
                input.put("state", "done").put("bytes", file.length()).put("sizeBytes", file.length())
                store(this@VoxenDownloadService, key, input)
                finish(input, input.toString(), null)
            } catch (cancel: CancellationException) {
                input.put("state", "paused"); store(this@VoxenDownloadService, key, input)
                finish(input, null, "İndirme durduruldu; tekrar başlatınca devam eder")
            } catch (error: Exception) {
                input.put("state", "error").put("error", error.message); store(this@VoxenDownloadService, key, input)
                finish(input, null, error.message)
            } finally {
                if (acquired) slots.release()
                if (discarded[key] == input.optLong("version")) {
                    val path = Uri.parse(input.optString("uri")).path
                    if (path != null && File(path).canonicalPath.startsWith(filesDir.canonicalPath + File.separator)) { File(path).delete(); File(path + ".part").delete(); File(path + ".part.json").delete() }
                }
                jobs.remove(key, coroutineContext[Job])
                if (jobs.isEmpty()) { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
            }
        }
        jobs[key] = job; job.start()
    }
    private fun finish(input: JSONObject, json: String?, error: String?) {
        val key = input.getString("key")
        if (versions[key] == input.optLong("version")) VoxenDownloadModule.finish(key, json, error, activeRequests[key] ?: input.optString("requestId"))
    }
    override fun onTimeout(startId: Int, fgsType: Int) { scope.cancel(); stopSelf() }
    override fun onDestroy() { instance = null; connections.values.forEach { it.disconnect() }; scope.cancel(); super.onDestroy() }
    companion object {
        private const val PREFS = "voxen_download_jobs"
        private const val ID = 1202
        private const val CHANNEL = "voxen_downloads"
        private val discarded = ConcurrentHashMap<String, Long>()
        private val versions = ConcurrentHashMap<String, Long>()
        private val revisions = java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis() * 1000)
        @Volatile private var instance: VoxenDownloadService? = null
        @Synchronized fun saved(context: Context) = runCatching { JSONObject(context.getSharedPreferences(PREFS, MODE_PRIVATE).getString("jobs", "{}") ?: "{}") }.getOrDefault(JSONObject())
        @Synchronized private fun store(context: Context, key: String, job: JSONObject) {
            if ((discarded[key] ?: -1L) >= job.optLong("version") || (versions[key] != null && versions[key] != job.optLong("version"))) return
            val all = saved(context).put(key, job)
            context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("jobs", all.toString()).apply()
        }
        @Synchronized fun acknowledge(context: Context, key: String) {
            val all = saved(context); all.remove(key)
            context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("jobs", all.toString()).apply()
        }
        fun discard(context: Context, key: String) { discarded[key] = saved(context).optJSONObject(key)?.optLong("version") ?: 0L; cancel(context, key); acknowledge(context, key) }
        fun cancel(context: Context, key: String?) {
            val all = saved(context)
            all.keys().forEach { id -> if (key == null || key == id) {
                val job = all.getJSONObject(id)
                if (job.optString("state") in listOf("queued", "downloading")) store(context, id, job.put("state", "paused"))
                instance?.connections?.remove(id)?.disconnect(); instance?.jobs?.get(id)?.cancel()
                VoxenDownloadModule.finish(id, null, "İndirme durduruldu")
            } }
        }
    }
}
