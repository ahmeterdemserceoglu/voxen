package com.voxen.music.playback

import android.app.PendingIntent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.media3.session.DefaultMediaNotificationProvider
import com.voxen.music.R
import android.content.Intent
import android.net.Uri
import android.media.audiofx.Equalizer
import android.net.ConnectivityManager
import android.net.Network
import android.os.Bundle
import android.os.SystemClock
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
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.consumeAsFlow
import kotlinx.coroutines.flow.collectLatest
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
    private var repeatMode = "off"
    private var shuffle = false
    private var originalQueueJson = "[]"
    private var commandId = 0L
    private var sourceLoading = false
    private var pendingPosition = 0L
    private var currentError: String? = null
    private var changingPlayer = false
    private lateinit var progressJob: Job
    private val health = PlaybackHealthMonitor()
    private var audioSettings = JSONObject()
    private var equalizer: Equalizer? = null
    private var loudnessDb: Double? = null
    private var sleepCleared = false
    private var preloadJob: Job? = null
    private var preloaded: Pair<String, ResolvedSource>? = null
    private lateinit var audioJob: Job
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { scope.launch {
            if (desiredPlaying && !sourceLoading && (player.playerError != null || player.playbackState == Player.STATE_BUFFERING))
                recoverPlayback("Network available again", visiblePosition())
        } }
    }
    private val prefs by lazy { getSharedPreferences(PREFS_NAME, MODE_PRIVATE) }

    override fun onCreate() {
        super.onCreate()
        instance = this
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(NOTIFICATION_CHANNEL, "Voxen Music", NotificationManager.IMPORTANCE_LOW))
        }
        setMediaNotificationProvider(DefaultMediaNotificationProvider.Builder(this)
            .setNotificationId(NOTIFICATION_ID).setChannelId(NOTIFICATION_CHANNEL).build())
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
        addSession(mediaSession)
        audioSettings = runCatching { JSONObject(prefs.getString("audio_settings", "{}") ?: "{}") }.getOrDefault(JSONObject())
        runCatching { getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(networkCallback) }
        audioJob = scope.launch { while (true) {
            delay(100)
            val deadline = audioSettings.optLong("sleepTimerDeadline", 0L)
            if (deadline > 0 && System.currentTimeMillis() >= deadline) expireSleep()
            if (!sourceLoading && player.isPlaying) applyVolume()
        } }
        loadWorker = scope.launch {
            loadRequests.consumeAsFlow().collectLatest { request -> processLoad(request) }
        }
        restorePersistedState()
        progressJob = scope.launch {
            var ticks = 0
            while (true) {
                delay(1_000)
                val now = SystemClock.elapsedRealtime()
                val position = visiblePosition()
                val stalled = health.sample(now, position, desiredPlaying,
                    !sourceLoading && player.playWhenReady && player.playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_NONE,
                    player.playbackState == Player.STATE_BUFFERING)
                if (health.progressingFor >= 5_000) retryCount = 0
                if (stalled) recoverPlayback("Playback stopped making progress", position)
                emitState()
                if (++ticks % 5 == 0) persistState()
                updateWidget(queue.getOrNull(queueIndex))
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Widget actions start a foreground service. A slow extractor must not
        // miss Android's notification deadline, even before a MediaItem exists.
        if (intent?.action in setOf(ACTION_PLAY, ACTION_TOGGLE, ACTION_NEXT, ACTION_PREVIOUS, ACTION_SEEK_FORWARD, ACTION_SEEK_BACK, ACTION_SHUFFLE, ACTION_CYCLE_REPEAT) && queue.isNotEmpty()) showPlaybackNotification()
        when (intent?.action) {
            ACTION_SET_QUEUE -> { commandId = intent.getLongExtra(EXTRA_COMMAND, 0L); setQueue(
                intent.getStringExtra(EXTRA_QUEUE_JSON).orEmpty(),
                intent.getIntExtra(EXTRA_INDEX, 0),
                intent.getBooleanExtra(EXTRA_PLAY, false),
                intent.getStringExtra(EXTRA_LOCAL_URI),
                intent.getLongExtra(EXTRA_POSITION, 0L),
                intent.getBooleanExtra(EXTRA_RESTART, false),
            ) }
            ACTION_SETTINGS -> configureAudio(intent.getStringExtra(EXTRA_SETTINGS) ?: "{}")
            ACTION_CYCLE_REPEAT -> { repeatMode = when (repeatMode) { "off" -> "all"; "all" -> "one"; else -> "off" }; persistState(); updateWidget(queue.getOrNull(queueIndex)); emitState() }
            ACTION_SHUFFLE -> toggleShuffle()
            ACTION_SHUFFLE_FLAG -> { val value = intent.getBooleanExtra(EXTRA_SHUFFLE, false); if (value && !shuffle) originalQueueJson = queueJson; shuffle = value; persistState() }
            ACTION_REPEAT -> { repeatMode = intent.getStringExtra(EXTRA_REPEAT) ?: "off"; persistState() }
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
        repeatMode = prefs.getString(KEY_REPEAT, "off") ?: "off"
        shuffle = prefs.getBoolean("shuffle", false)
        originalQueueJson = prefs.getString("original_queue", "[]") ?: "[]"
        queueJson = prefs.getString(KEY_QUEUE_JSON, "[]") ?: "[]"
        queue = parseQueue(queueJson)
        if (queue.isEmpty()) return
        queueIndex = prefs.getInt(KEY_QUEUE_INDEX, 0).coerceIn(0, queue.lastIndex)
        // Restore the selection and position, never a previous process's play intent.
        // An already-running background service keeps its live playback unchanged.
        desiredPlaying = false
        val position = max(0L, prefs.getLong(KEY_POSITION, 0L))
        requestLoad(desiredPlaying, position)
    }

    private fun setQueue(json: String, index: Int, play: Boolean, localUri: String?, position: Long, restart: Boolean) {
        val parsed = parseQueue(json)
        if (parsed.isEmpty()) return
        val target = index.coerceIn(0, parsed.lastIndex)
        queueJson = if (!localUri.isNullOrBlank()) JSONArray(json).apply { getJSONObject(target).put("localUri", localUri) }.toString() else json
        queue = parsed.toMutableList().also { list ->
            if (!localUri.isNullOrBlank()) list[target] = list[target].copy(localUri = localUri)
        }
        val incoming = queue[target]
        val sameTarget = !restart && (player.currentMediaItem?.mediaId == incoming.id || loadingTrackId == incoming.id)
        queueIndex = target
        desiredPlaying = play
        persistState()
        if (sameTarget) {
            if (player.currentMediaItem?.mediaId == incoming.id && !sourceLoading) changePlayer { if (play) player.play() else player.pause() }
            emitState(loading = loadingTrackId == incoming.id)
            return
        }
        retryCount = 0
        health.reset(SystemClock.elapsedRealtime(), position)
        requestLoad(play, max(0L, position))
    }

    private fun requestLoad(play: Boolean, startPosition: Long) {
        val track = queue.getOrNull(queueIndex) ?: return
        val request = LoadRequest(++loadRevision, track, queueIndex, startPosition)
        desiredPlaying = play
        pendingPosition = max(0L, startPosition)
        sourceLoading = true
        loadingTrackId = track.id
        currentError = null
        changePlayer { player.pause() }
        if (play) showPlaybackNotification()
        retryJob?.cancel()
        loadRequests.trySend(request)
        emitState(loading = true)
    }

    private suspend fun processLoad(request: LoadRequest) {
        loadingTrackId = request.track.id
        try {
            val source = withTimeoutOrNull(30_000) { withContext(Dispatchers.IO) { resolveSource(request.track) } }
                ?: throw IllegalStateException("Şarkı bağlantısı zamanında yüklenemedi")
            if (request.revision != loadRevision) return
            loudnessDb = source.loudnessDb
            val track = request.track
            val startPosition = request.startPosition
            val item = buildMediaItem(track, source.uri)
            val httpFactory = DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setDefaultRequestProperties(source.headers)
            val mediaSource = ProgressiveMediaSource.Factory(DefaultDataSource.Factory(this, httpFactory))
                .createMediaSource(item)
            // The current intent wins over commands sent before extraction finished.
            changePlayer {
                player.playWhenReady = desiredPlaying
                player.setMediaSource(mediaSource)
                player.prepare()
                if (startPosition > 0L) player.seekTo(startPosition)
            }
            sourceLoading = false
            if (!player.playWhenReady) desiredPlaying = false
            applyEqualizer(); applyVolume(); preloadNext()
            health.reset(SystemClock.elapsedRealtime(), startPosition)
            persistState()
            updateWidget(track)
            emitState()
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (error: Exception) {
            if (request.revision != loadRevision) return
            Log.e(TAG, "load failed for ${request.track.videoId}", error)
            sourceLoading = false
            recoverPlayback(error.message ?: "Playback load failed", request.startPosition)
        } finally {
            if (request.revision == loadRevision) loadingTrackId = null
        }
    }

    private suspend fun resolveSource(track: NativeTrack): ResolvedSource {
        if (!track.localUri.isNullOrBlank()) return ResolvedSource(track.localUri, emptyMap())
        val cached = preloaded?.takeIf { it.first == track.id && SystemClock.elapsedRealtime() - it.second.resolvedAt < 60_000 }?.second
        if (cached != null) { preloaded = null; return cached }
        val resolved = VoxenStreamResolver.resolveStream(track.videoId)
        return ResolvedSource(resolved.audioUrl, resolved.headers, resolved.loudnessDb)
    }

    private fun buildMediaItem(track: NativeTrack, uri: String): MediaItem {
        val metadata = MediaMetadata.Builder()
            .setTitle(track.title)
            .setArtist(track.artist)
            .setArtworkUri(track.artwork.takeIf { it.isNotBlank() }?.let(Uri::parse))
            .build()
        return MediaItem.Builder().setMediaId(track.id).setUri(uri).setMediaMetadata(metadata).build()
    }

    private inline fun changePlayer(block: () -> Unit) {
        changingPlayer = true
        try { block() } finally { changingPlayer = false }
    }

    private fun visiblePosition(): Long = if (sourceLoading || player.currentMediaItem?.mediaId != queue.getOrNull(queueIndex)?.id)
        pendingPosition else max(0L, player.currentPosition)

    private fun recoverPlayback(reason: String, position: Long) {
        if (queue.isEmpty()) return
        if (!desiredPlaying) { currentError = reason; emitState(); return }
        if (retryJob?.isActive == true) return
        if (retryCount >= MAX_RETRIES) {
            desiredPlaying = false
            currentError = "Şarkı devam ettirilemedi. Tekrar oynatmayı deneyin."
            changePlayer { player.pause() }
            persistState(); emitState()
            Log.e(TAG, reason)
            return
        }
        preloaded = null
        retryCount++
        val revision = loadRevision
        Log.w(TAG, "Recovering playback ($retryCount): $reason at $position")
        retryJob = scope.launch {
            delay(500L * retryCount)
            if (desiredPlaying && revision == loadRevision) requestLoad(true, position)
        }
    }

    private fun toggleShuffle() {
        if (queue.isEmpty()) return
        val currentId = queue.getOrNull(queueIndex)?.id
        val rows = JSONArray(queueJson)
        val byId = (0 until rows.length()).associate { rows.getJSONObject(it).optString("id") to rows.getJSONObject(it) }
        queue = if (!shuffle) {
            originalQueueJson = queueJson
            queue.filter { it.id == currentId } + queue.filter { it.id != currentId }.shuffled()
        } else {
            val ranks = parseQueue(originalQueueJson).mapIndexed { index, track -> track.id to index }.toMap()
            queue.sortedBy { ranks[it.id] ?: Int.MAX_VALUE }
        }
        queueJson = JSONArray().apply { queue.forEach { put(byId[it.id]) } }.toString()
        queueIndex = queue.indexOfFirst { it.id == currentId }.coerceAtLeast(0)
        shuffle = !shuffle
        persistState(); preloadNext(); updateWidget(queue.getOrNull(queueIndex)); emitState()
    }

    private fun configureAudio(json: String) {
        audioSettings = runCatching { JSONObject(json) }.getOrDefault(JSONObject())
        prefs.edit().putString("audio_settings", audioSettings.toString()).apply()
        applyEqualizer(); applyVolume()
    }

    private fun applyEqualizer() {
        runCatching {
            equalizer?.release(); equalizer = null
            if (!audioSettings.optBoolean("equalizerEnabled") || player.audioSessionId == C.AUDIO_SESSION_ID_UNSET) return
            val effect = Equalizer(0, player.audioSessionId)
            equalizer = effect
            val requested = audioSettings.optJSONArray("equalizerBands") ?: JSONArray()
            val frequencies = doubleArrayOf(60.0, 230.0, 910.0, 3600.0, 14000.0)
            val limits = effect.bandLevelRange
            for (band in 0 until effect.numberOfBands.toInt()) {
                val hz = effect.getCenterFreq(band.toShort()) / 1000.0
                val index = frequencies.indices.minByOrNull { kotlin.math.abs(kotlin.math.ln(hz.coerceAtLeast(1.0) / frequencies[it])) } ?: 0
                effect.setBandLevel(band.toShort(), (requested.optDouble(index, 0.0).coerceIn(-12.0, 12.0) * 100).toInt().coerceIn(limits[0].toInt(), limits[1].toInt()).toShort())
            }
            effect.enabled = true
        }.onFailure { Log.w(TAG, "Equalizer unavailable", it) }
    }

    private fun applyVolume() {
        val bands = audioSettings.optJSONArray("equalizerBands")
        val headroom = if (equalizer?.enabled == true) (0 until (bands?.length() ?: 0)).maxOfOrNull { bands!!.optDouble(it, 0.0) } ?: 0.0 else 0.0
        val fade = if (audioSettings.optBoolean("crossfade")) audioSettings.optInt("crossfadeDuration", 3).coerceIn(2, 8) * 1000L else 0L
        player.volume = AudioEnvelope.volume(visiblePosition(), player.duration.takeIf { it > 0 && it != C.TIME_UNSET } ?: 0L, fade, loudnessDb, audioSettings.optBoolean("normalizeVolume"), headroom)
    }

    private fun expireSleep() {
        audioSettings.put("sleepTimerDeadline", 0L).put("sleepTimerTrackEnd", false)
        sleepCleared = true
        prefs.edit().putString("audio_settings", audioSettings.toString()).apply()
        pauseInternal()
    }

    private fun preloadNext() {
        preloadJob?.cancel()
        val next = queue.getOrNull(queueIndex + 1) ?: return
        if (!desiredPlaying || !next.localUri.isNullOrBlank()) return
        val revision = loadRevision
        preloadJob = scope.launch {
            val source = runCatching { withTimeoutOrNull(20_000) { withContext(Dispatchers.IO) {
                val result = VoxenStreamResolver.resolveStream(next.videoId)
                ResolvedSource(result.audioUrl, result.headers, result.loudnessDb)
            } } }.getOrNull()
            if (source != null && revision == loadRevision && queue.getOrNull(queueIndex + 1)?.id == next.id) preloaded = next.id to source
        }
    }

    private fun showPlaybackNotification() {
        val track = queue.getOrNull(queueIndex) ?: return
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val pause = PendingIntent.getService(this, 10, Intent(this, VoxenPlaybackService::class.java).setAction(ACTION_PAUSE),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL)
            .setSmallIcon(R.drawable.ic_widget_music_note).setContentTitle(track.title)
            .setContentText(if (sourceLoading) "Şarkı yükleniyor…" else track.artist)
            .setContentIntent(open).setOnlyAlertOnce(true).setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT).setOngoing(desiredPlaying)
            .addAction(R.drawable.ic_widget_pause, "Duraklat", pause).build()
        startForeground(NOTIFICATION_ID, notification)
    }

    private fun playInternal() {
        if (queue.isEmpty()) return
        currentError = null
        retryCount = 0
        health.reset(SystemClock.elapsedRealtime(), visiblePosition())
        desiredPlaying = true
        if (sourceLoading) { showPlaybackNotification(); emitState(loading = true); return }
        if (player.currentMediaItem == null || player.playerError != null) requestLoad(true, max(visiblePosition(), prefs.getLong(KEY_POSITION, 0L)))
        else changePlayer { player.play() }
        persistState(); emitState()
    }

    private fun pauseInternal() { desiredPlaying = false; retryJob?.cancel(); changePlayer { player.pause() }; persistState(); emitState() }
    private fun toggleInternal() { if (player.isPlaying || desiredPlaying) pauseInternal() else playInternal() }

    private fun nextInternal() {
        if (queue.isEmpty()) return
        if (queueIndex >= queue.lastIndex && repeatMode != "all") { pauseInternal(); return }
        queueIndex = (queueIndex + 1) % queue.size
        retryCount = 0
        desiredPlaying = true
        persistState()
        requestLoad(true, 0L)
    }

    private fun previousInternal() {
        if (queue.isEmpty()) return
        if (visiblePosition() > 3_000L) { seekTo(0L); return }
        queueIndex = if (queueIndex <= 0) { if (repeatMode == "all") queue.lastIndex else 0 } else queueIndex - 1
        retryCount = 0
        desiredPlaying = true
        persistState()
        requestLoad(true, 0L)
    }

    private fun seekTo(position: Long) {
        pendingPosition = max(0L, position)
        health.reset(SystemClock.elapsedRealtime(), pendingPosition)
        if (sourceLoading) requestLoad(desiredPlaying, pendingPosition)
        else player.seekTo(pendingPosition)
        persistState(); emitState()
    }

    private fun seekRelative(delta: Long) {
        val duration = if (sourceLoading) queue.getOrNull(queueIndex)?.duration?.takeIf { it > 0 } ?: Long.MAX_VALUE
            else player.duration.takeIf { it > 0 && it != C.TIME_UNSET } ?: Long.MAX_VALUE
        seekTo(min(duration, max(0L, visiblePosition() + delta)))
    }

    private fun stopInternal() {
        desiredPlaying = false
        loadRevision++
        retryJob?.cancel()
        sourceLoading = false
        pendingPosition = 0
        queue = emptyList(); queueJson = "[]"; queueIndex = 0
        currentError = null
        changePlayer { player.stop(); player.clearMediaItems() }
        prefs.edit().clear().apply()
        stopForeground(STOP_FOREGROUND_REMOVE)
        getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
        VoxenWidgetProvider.updateAllWidgets(this, "voxen", "Müzik seç", null, false, 0L, 0L, 0, 0, false, "", "", "", "off", false)
        emitState()
        stopSelf()
    }

    private val playerListener = object : Player.Listener {
        override fun onAudioSessionIdChanged(audioSessionId: Int) { applyEqualizer(); applyVolume() }
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            updateWidget(queue.getOrNull(queueIndex))
            persistState(); emitState()
        }
        override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_ENDED && !sourceLoading) {
                if (audioSettings.optBoolean("sleepTimerTrackEnd")) { expireSleep(); return }
                if (repeatMode == "one") { seekTo(0L); playInternal() }
                else if (queueIndex < queue.lastIndex || repeatMode == "all") nextInternal()
                else { pauseInternal(); emitState(ended = true) }
            } else { persistState(); emitState() }
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            if (!changingPlayer && !sourceLoading) {
                // Focus loss/headphone removal is a real pause. Never steal focus back.
                desiredPlaying = playWhenReady
                if (!playWhenReady) retryJob?.cancel()
                persistState(); emitState()
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            if (!sourceLoading) recoverPlayback(error.message ?: error.errorCodeName, visiblePosition())
        }
    }

    private fun emitState(error: String? = null, loading: Boolean = false, ended: Boolean = false) {
        val duration = if (sourceLoading) queue.getOrNull(queueIndex)?.duration ?: 0L
            else player.duration.takeIf { it > 0 && it != C.TIME_UNSET } ?: queue.getOrNull(queueIndex)?.duration ?: 0L
        val track = queue.getOrNull(queueIndex)
        val bundle = Bundle().apply {
            putString("trackId", track?.id)
            putDouble("commandId", commandId.toDouble())
            putInt("queueIndex", queueIndex)
            putBoolean("isPlaying", player.isPlaying && !sourceLoading)
            putBoolean("wantsToPlay", desiredPlaying)
            putBoolean("isBuffering", desiredPlaying && (sourceLoading || player.playbackState == Player.STATE_BUFFERING))
            putBoolean("isLoading", loading || sourceLoading)
            putBoolean("ended", ended)
            putBoolean("sleepCleared", sleepCleared)
            putBoolean("shuffle", shuffle)
            putString("repeatMode", repeatMode)
            putStringArrayList("queueIds", ArrayList(queue.map { it.id }))
            putStringArrayList("shuffleOrderIds", ArrayList(parseQueue(originalQueueJson).map { it.id }))
            putLong("position", visiblePosition())
            putLong("duration", duration)
            (error ?: currentError)?.let { putString("error", it) }
        }
        refreshState()
        VoxenPlaybackModule.emitState(bundle)
        sleepCleared = false
    }

    private fun persistState() {
        if (queue.isEmpty()) return
        prefs.edit()
            .putString(KEY_QUEUE_JSON, queueJson)
            .putInt(KEY_QUEUE_INDEX, queueIndex)
            .putLong(KEY_POSITION, visiblePosition())
            .putString(KEY_REPEAT, repeatMode)
            .putBoolean("shuffle", shuffle).putString("original_queue", originalQueueJson)
            .apply()
    }

    private fun updateWidget(track: NativeTrack?) {
        if (track == null) return
        VoxenWidgetProvider.updateAllWidgets(this, track.title, track.artist, null, player.isPlaying && !sourceLoading,
            visiblePosition(), if (sourceLoading) track.duration else max(0L, player.duration.takeIf { it != C.TIME_UNSET } ?: 0L),
            queueIndex, queue.size, desiredPlaying && (sourceLoading || player.playbackState == Player.STATE_BUFFERING), track.artwork,
            (queue.getOrNull(queueIndex + 1) ?: if (repeatMode == "all") queue.firstOrNull() else null)?.title.orEmpty(),
            (queue.getOrNull(queueIndex + 1) ?: if (repeatMode == "all") queue.firstOrNull() else null)?.artist.orEmpty(), repeatMode, shuffle)
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
                duration = item.optLong("duration", 0L),
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
        if (::progressJob.isInitialized) progressJob.cancel()
        loadRequests.close()
        if (::loadWorker.isInitialized) loadWorker.cancel()
        preloadJob?.cancel()
        if (::audioJob.isInitialized) audioJob.cancel()
        equalizer?.release()
        runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(networkCallback) }
        player.removeListener(playerListener)
        removeSession(mediaSession)
        mediaSession.release()
        player.release()
        scope.cancel()
        super.onDestroy()
    }

    fun refreshState() {
        PlaybackStateHolder.update(player, desiredPlaying, queueIndex, queue.getOrNull(queueIndex)?.id, currentError)
        PlaybackStateHolder.queueIds = queue.map { it.id }
        PlaybackStateHolder.shuffleOrderIds = parseQueue(originalQueueJson).map { it.id }
        PlaybackStateHolder.shuffle = shuffle; PlaybackStateHolder.repeatMode = repeatMode
        PlaybackStateHolder.commandId = commandId
        PlaybackStateHolder.position = visiblePosition()
        PlaybackStateHolder.isLoading = sourceLoading
        PlaybackStateHolder.isBuffering = desiredPlaying && (sourceLoading || player.playbackState == Player.STATE_BUFFERING)
        if (sourceLoading) PlaybackStateHolder.duration = queue.getOrNull(queueIndex)?.duration ?: 0L
    }

    companion object {
        @Volatile var instance: VoxenPlaybackService? = null
        private const val NOTIFICATION_ID = 1101
        private const val NOTIFICATION_CHANNEL = "voxen_music"
        private const val TAG = "VoxenPlaybackService"
        private const val PREFS_NAME = "voxen_playback_state"
        private const val KEY_QUEUE_JSON = "queue_json"
        private const val KEY_QUEUE_INDEX = "queue_index"
        private const val KEY_POSITION = "position"
        private const val KEY_REPEAT = "repeat_mode"
        private const val MAX_RETRIES = 3

        const val ACTION_SHUFFLE = "com.voxen.music.playback.SHUFFLE"
        const val ACTION_SHUFFLE_FLAG = "com.voxen.music.playback.SHUFFLE_FLAG"
        const val EXTRA_SHUFFLE = "shuffle"
        const val ACTION_CYCLE_REPEAT = "com.voxen.music.playback.CYCLE_REPEAT"
        const val ACTION_SETTINGS = "com.voxen.music.playback.SETTINGS"
        const val EXTRA_SETTINGS = "audio_settings"
        const val ACTION_SET_QUEUE = "com.voxen.music.playback.SET_QUEUE"
        const val ACTION_REPEAT = "com.voxen.music.playback.REPEAT"
        const val EXTRA_REPEAT = "repeat_mode"
        const val EXTRA_RESTART = "restart"
        const val EXTRA_COMMAND = "command_id"
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
    val startPosition: Long,
)

data class NativeTrack(
    val id: String,
    val videoId: String,
    val title: String,
    val artist: String,
    val artwork: String,
    val localUri: String? = null,
    val duration: Long = 0L,
)

data class ResolvedSource(val uri: String, val headers: Map<String, String>, val loudnessDb: Double? = null, val resolvedAt: Long = SystemClock.elapsedRealtime())

object PlaybackStateHolder {
    @Volatile var queueIds: List<String> = emptyList()
    @Volatile var shuffleOrderIds: List<String> = emptyList()
    @Volatile var shuffle = false
    @Volatile var repeatMode = "off"
    @Volatile var commandId = 0L
    @Volatile var isLoading = false
    @Volatile var isBuffering = false
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