package com.voxen.music.playback

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.voxen.music.MainActivity
import com.voxen.music.VoxenStreamResolver
import com.voxen.music.widget.VoxenWidgetProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.channels.Channel
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min

@OptIn(UnstableApi::class)
class VoxenPlaybackService : MediaSessionService() {
    private lateinit var player: ExoPlayer
    private lateinit var mediaSession: MediaSession
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val loadRequests = Channel<LoadRequest>(Channel.CONFLATED)
    private lateinit var loadWorker: Job
    private var retryJob: Job? = null
    private var loadRevision = 0L
    private var loadingTrackId: String? = null
    private var queue: List<NativeTrack> = emptyList()
    private var queueJson = "[]"
    private var queueIndex = 0
    private var desiredPlaying = false
    private var retryCount = 0
    private val prefs by lazy { getSharedPreferences(PREFS_NAME, MODE_PRIVATE) }

    override fun onCreate() {
        super.onCreate()
        instance = this
        VoxenStreamResolver.initialize(this)
        val attrs = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()
        player = ExoPlayer.Builder(this).build().apply {
            setAudioAttributes(attrs, true)
            setHandleAudioBecomingNoisy(true)
            setWakeMode(C.WAKE_MODE_NETWORK)
            addListener(playerListener)
        }
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        mediaSession = MediaSession.Builder(this, player)
            .setSessionActivity(pendingIntent)
            .build()
        loadWorker = scope.launch {
            for (request in loadRequests) processLoad(request)
        }
        restorePersistedState()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SET_QUEUE -> setQueue(
                intent.getStringExtra(EXTRA_QUEUE_JSON).orEmpty(),
                intent.getIntExtra(EXTRA_INDEX, 0),
                intent.getBooleanExtra(EXTRA_PLAY, true),
                intent.getStringExtra(EXTRA_LOCAL_URI),
            )
            ACTION_PLAY -> playInternal()
            ACTION_PAUSE -> pauseInternal()
            ACTION_TOGGLE -> toggleInternal()
            ACTION_NEXT -> nextInternal()
            ACTION_PREVIOUS -> previousInternal()
            ACTION_SEEK_TO -> seekTo(intent.getLongExtra(EXTRA_POSITION, 0L))
            ACTION_SEEK_FORWARD -> seekRelative(10_000L)
            ACTION_SEEK_BACK -> seekRelative(-10_000L)
            ACTION_STOP -> stopInternal()
        }
        return START_STICKY
    }

    private fun restorePersistedState() {
        queueJson = prefs.getString(KEY_QUEUE_JSON, "[]") ?: "[]"
        queue = parseQueue(queueJson)
        if (queue.isEmpty()) return
        queueIndex = prefs.getInt(KEY_QUEUE_INDEX, 0).coerceIn(0, queue.lastIndex)
        desiredPlaying = prefs.getBoolean(KEY_WAS_PLAYING, false)
        val position = max(0L, prefs.getLong(KEY_POSITION, 0L))
        requestLoad(desiredPlaying, position)
    }

    private fun setQueue(json: String, index: Int, play: Boolean, localUri: String?) {
        val parsed = parseQueue(json)
        if (parsed.isEmpty()) return
        val target = index.coerceIn(0, parsed.lastIndex)
        queueJson = json
        queue = parsed.toMutableList().also { list ->
            if (!localUri.isNullOrBlank()) list[target] = list[target].copy(localUri = localUri)
        }
        val incoming = queue[target]
        val sameTarget = queueIndex == target && (player.currentMediaItem?.mediaId == incoming.id || loadingTrackId == incoming.id)
        queueIndex = target
        desiredPlaying = play
        persistState()
        if (sameTarget) {
            if (player.currentMediaItem?.mediaId == incoming.id) { if (play) player.play() else player.pause() }
            emitState(loading = loadingTrackId == incoming.id)
            return
        }
        requestLoad(play, 0L)
    }

    private fun requestLoad(play: Boolean, startPosition: Long) {
        val track = queue.getOrNull(queueIndex) ?: return
        val request = LoadRequest(++loadRevision, track, queueIndex, play, startPosition)
        desiredPlaying = play
        retryJob?.cancel()
        loadRequests.trySend(request)
        emitState(loading = true)
    }

    private suspend fun processLoad(request: LoadRequest) {
        loadingTrackId = request.track.id
        try {
            val source = withContext(Dispatchers.IO) { resolveSource(request.track) }
            if (request.revision != loadRevision) return
            val track = request.track
            val play = request.play
            val startPosition = request.startPosition
            val item = buildMediaItem(track, source.uri)
            val httpFactory = DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setDefaultRequestProperties(source.headers)
            val mediaSource = ProgressiveMediaSource.Factory(DefaultDataSource.Factory(this, httpFactory))
                .createMediaSource(item)
            player.setMediaSource(mediaSource)
            player.prepare()
            if (startPosition > 0L) player.seekTo(startPosition)
            player.playWhenReady = play
            retryCount = 0
            persistState()
            updateWidget(track)
            emitState()
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (error: Exception) {
            if (request.revision != loadRevision) return
            Log.e(TAG, "load failed for ${request.track.videoId}", error)
            desiredPlaying = false
            emitState(error = error.message ?: "Playback load failed")
        } finally {
            if (loadingTrackId == request.track.id) loadingTrackId = null
        }
    }

    private suspend fun resolveSource(track: NativeTrack): ResolvedSource {
        if (!track.localUri.isNullOrBlank()) return ResolvedSource(track.localUri, emptyMap())
        val resolved = VoxenStreamResolver.resolveStream(track.videoId)
        return ResolvedSource(resolved.audioUrl, resolved.headers)
    }

    private fun buildMediaItem(track: NativeTrack, uri: String): MediaItem {
        val metadata = MediaMetadata.Builder()
            .setTitle(track.title)
            .setArtist(track.artist)
            .setArtworkUri(track.artwork.takeIf { it.isNotBlank() }?.let(Uri::parse))
            .build()
        return MediaItem.Builder().setMediaId(track.id).setUri(uri).setMediaMetadata(metadata).build()
    }

    private fun playInternal() {
        desiredPlaying = true
        if (player.currentMediaItem == null) requestLoad(true, prefs.getLong(KEY_POSITION, 0L))
        else player.play()
        persistState(); emitState()
    }

    private fun pauseInternal() { desiredPlaying = false; player.pause(); persistState(); emitState() }
    private fun toggleInternal() { if (player.isPlaying || desiredPlaying) pauseInternal() else playInternal() }

    private fun nextInternal() {
        if (queue.isEmpty()) return
        if (queueIndex >= queue.lastIndex) { pauseInternal(); return }
        queueIndex += 1
        desiredPlaying = true
        persistState()
        requestLoad(true, 0L)
    }

    private fun previousInternal() {
        if (queue.isEmpty()) return
        if (player.currentPosition > 3_000L) { seekTo(0L); return }
        queueIndex = if (queueIndex <= 0) queue.lastIndex else queueIndex - 1
        desiredPlaying = true
        persistState()
        requestLoad(true, 0L)
    }

    private fun seekTo(position: Long) {
        player.seekTo(max(0L, position)); persistState(); emitState()
    }

    private fun seekRelative(delta: Long) {
        val duration = player.duration.takeIf { it > 0 && it != C.TIME_UNSET } ?: Long.MAX_VALUE
        seekTo(min(duration, max(0L, player.currentPosition + delta)))
    }

    private fun stopInternal() {
        desiredPlaying = false
        player.stop(); player.clearMediaItems()
        prefs.edit().clear().apply()
        emitState()
    }

    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            updateWidget(queue.getOrNull(queueIndex))
            persistState(); emitState()
        }
        override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_ENDED) nextInternal()
            else { persistState(); emitState() }
        }

        override fun onPlayerError(error: PlaybackException) {
            val position = max(0L, player.currentPosition)
            if (retryCount < MAX_RETRIES && queue.isNotEmpty()) {
                retryCount += 1
                val expectedTrackId = queue.getOrNull(queueIndex)?.id
                retryJob?.cancel()
                retryJob = scope.launch {
                    delay(500L * retryCount)
                    if (expectedTrackId == queue.getOrNull(queueIndex)?.id) requestLoad(desiredPlaying, position)
                }
            } else {
                desiredPlaying = false
                emitState(error = error.message ?: error.errorCodeName)
            }
        }
    }

    private fun emitState(error: String? = null, loading: Boolean = false) {
        val duration = player.duration.takeIf { it > 0 && it != C.TIME_UNSET } ?: 0L
        val track = queue.getOrNull(queueIndex)
        val bundle = Bundle().apply {
            putString("trackId", track?.id)
            putInt("queueIndex", queueIndex)
            putBoolean("isPlaying", player.isPlaying)
            putBoolean("wantsToPlay", desiredPlaying)
            putBoolean("isBuffering", player.playbackState == Player.STATE_BUFFERING)
            putBoolean("isLoading", loading)
            putLong("position", max(0L, player.currentPosition))
            putLong("duration", duration)
            error?.let { putString("error", it) }
        }
        PlaybackStateHolder.update(player, desiredPlaying, queueIndex, track?.id, error)
        VoxenPlaybackModule.emitState(bundle)
    }

    private fun persistState() {
        if (queue.isEmpty()) return
        prefs.edit()
            .putString(KEY_QUEUE_JSON, queueJson)
            .putInt(KEY_QUEUE_INDEX, queueIndex)
            .putLong(KEY_POSITION, max(0L, player.currentPosition))
            .putBoolean(KEY_WAS_PLAYING, desiredPlaying)
            .apply()
    }

    private fun updateWidget(track: NativeTrack?) {
        if (track == null) return
        getSharedPreferences(VoxenWidgetProvider.PREFS_NAME, MODE_PRIVATE).edit()
            .putString(VoxenWidgetProvider.KEY_TITLE, track.title)
            .putString(VoxenWidgetProvider.KEY_ARTIST, track.artist)
            .putString(VoxenWidgetProvider.KEY_ARTWORK_URL, track.artwork)
            .putBoolean(VoxenWidgetProvider.KEY_IS_PLAYING, player.isPlaying)
            .apply()
        VoxenWidgetProvider.updateAllWidgets(this, track.title, track.artist, null, player.isPlaying)
    }

    private fun parseQueue(json: String): List<NativeTrack> = runCatching {
        val array = JSONArray(json)
        List(array.length()) { index ->
            val item = array.getJSONObject(index)
            NativeTrack(
                id = item.optString("id"),
                videoId = item.optString("videoId", item.optString("id")),
                title = item.optString("title", "Unknown"),
                artist = item.optString("artist", "Unknown Artist"),
                artwork = item.optString("artwork", ""),
                localUri = item.optString("localUri").takeIf { it.isNotBlank() },
            )
        }
    }.getOrElse { emptyList() }

    override fun onTaskRemoved(rootIntent: Intent?) {
        persistState()
        if (!desiredPlaying && !player.isPlaying) stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        instance = null
        persistState()
        retryJob?.cancel()
        loadRequests.close()
        if (::loadWorker.isInitialized) loadWorker.cancel()
        player.removeListener(playerListener)
        mediaSession.release()
        player.release()
        scope.cancel()
        super.onDestroy()
    }

    fun refreshState() = PlaybackStateHolder.update(player, desiredPlaying, queueIndex, queue.getOrNull(queueIndex)?.id, null)

    companion object {
        @Volatile var instance: VoxenPlaybackService? = null
        private const val TAG = "VoxenPlaybackService"
        private const val PREFS_NAME = "voxen_playback_state"
        private const val KEY_QUEUE_JSON = "queue_json"
        private const val KEY_QUEUE_INDEX = "queue_index"
        private const val KEY_POSITION = "position"
        private const val KEY_WAS_PLAYING = "was_playing"
        private const val MAX_RETRIES = 3

        const val ACTION_SET_QUEUE = "com.voxen.music.playback.SET_QUEUE"
        const val ACTION_PLAY = "com.voxen.music.playback.PLAY"
        const val ACTION_PAUSE = "com.voxen.music.playback.PAUSE"
        const val ACTION_TOGGLE = "com.voxen.music.playback.TOGGLE"
        const val ACTION_NEXT = "com.voxen.music.playback.NEXT"
        const val ACTION_PREVIOUS = "com.voxen.music.playback.PREVIOUS"
        const val ACTION_SEEK_TO = "com.voxen.music.playback.SEEK_TO"
        const val ACTION_SEEK_FORWARD = "com.voxen.music.playback.SEEK_FORWARD"
        const val ACTION_SEEK_BACK = "com.voxen.music.playback.SEEK_BACK"
        const val ACTION_STOP = "com.voxen.music.playback.STOP"
        const val EXTRA_QUEUE_JSON = "queue_json"
        const val EXTRA_INDEX = "index"
        const val EXTRA_PLAY = "play"
        const val EXTRA_LOCAL_URI = "local_uri"
        const val EXTRA_POSITION = "position"
    }
}

private data class LoadRequest(
    val revision: Long,
    val track: NativeTrack,
    val index: Int,
    val play: Boolean,
    val startPosition: Long,
)

data class NativeTrack(
    val id: String,
    val videoId: String,
    val title: String,
    val artist: String,
    val artwork: String,
    val localUri: String? = null,
)

data class ResolvedSource(val uri: String, val headers: Map<String, String>)

object PlaybackStateHolder {
    @Volatile var isPlaying = false
    @Volatile var wantsToPlay = false
    @Volatile var position = 0L
    @Volatile var duration = 0L
    @Volatile var queueIndex = 0
    @Volatile var trackId: String? = null
    @Volatile var error: String? = null

    fun update(player: Player, wants: Boolean, index: Int, id: String?, currentError: String?) {
        isPlaying = player.isPlaying
        wantsToPlay = wants
        position = max(0L, player.currentPosition)
        duration = player.duration.takeIf { it > 0 && it != C.TIME_UNSET } ?: 0L
        queueIndex = index
        trackId = id
        error = currentError
    }
}