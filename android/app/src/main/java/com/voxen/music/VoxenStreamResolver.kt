package com.voxen.music

import android.content.Context
import android.util.Log
import com.metrolist.innertubex.InnerTube as InnerTubeX
import com.metrolist.innertubex.InnerTubeLogLevel
import com.metrolist.innertubex.InnerTubeLogger
import com.metrolist.innertubex.cipher.PlayerConfigRepository
import com.metrolist.innertubex.cipher.RemotePlayerConfigStore
import com.metrolist.innertubex.cipher.YouTubeCipherService
import com.metrolist.innertubex.extraction.AudioQuality
import com.metrolist.innertubex.extraction.ContentHints
import com.metrolist.innertubex.extraction.ExtractedStream
import com.metrolist.innertubex.extraction.InnerTubeExtractor
import com.metrolist.innertubex.extraction.PoTokenResult as InnerTubeXPoTokenResult
import com.metrolist.innertubex.extraction.StreamResolveException
import com.metrolist.innertubex.extraction.TokenProvider
import com.metrolist.innertubex.extraction.TokenProviderCapabilities
import com.metrolist.innertubex.extraction.YtConfigParser
import com.metrolist.innertubex.extraction.YtConfigParserImpl
import com.metrolist.innertubex.extraction.generateClientPlaybackNonce
import com.metrolist.innertubex.extraction.strategy.PoTokenProviderKind
import com.voxen.music.potoken.PoTokenGenerator
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.compression.ContentEncoding
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.header
import io.ktor.client.request.url
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import java.util.concurrent.TimeUnit

object VoxenStreamResolver {
    private const val TAG = "VoxenStreamResolver"

    @Volatile
    private var applicationContext: Context? = null

    @Volatile
    private var currentBundle: ExtractionBundle? = null

    private val bundleMutex = Mutex()

    @Synchronized
    fun initialize(context: Context) {
        if (applicationContext == null) {
            applicationContext = context.applicationContext
        }
    }

    suspend fun resolveStream(videoId: String): ExtractedStream {
        val hints = ContentHints().withStreamCapabilities(
            allowHls = false,
            allowSabr = false,
            allowBoundedRange = false,
        )

        return try {
            val bundle = getBundle()
            val stream = requireNotNull(
                bundle.extractor.extract(
                    videoId = videoId,
                    hints = hints,
                    excludedClients = emptySet(),
                    audioQuality = AudioQuality.HIGH,
                    clientPlaybackNonce = generateClientPlaybackNonce(),
                )
            ) { "InnerTubeX returned no playable stream for videoId: $videoId" }
            stream
        } catch (error: CancellationException) {
            throw error
        } catch (error: StreamResolveException) {
            Log.e(TAG, "StreamResolveException: ${error.reason}", error)
            runCatching { getBundle().cipherService.refreshAfterStreamRejection() }
            throw error
        } catch (error: Exception) {
            Log.e(TAG, "Extraction failed for videoId $videoId", error)
            throw error
        }
    }

    private suspend fun getBundle(): ExtractionBundle {
        currentBundle?.let { return it }
        return bundleMutex.withLock {
            currentBundle?.let { return@withLock it }

            val context = requireNotNull(applicationContext) { "VoxenStreamResolver is not initialized" }
            val httpClient = createHttpClient()
            val innerTube = InnerTubeX(httpClient)
            val configRepo = AndroidPlayerConfigRepository(context)
            val remoteStore = RemotePlayerConfigStore(httpClient, configRepo, logger)
            val cipherService = YouTubeCipherService(httpClient, remoteStore, logger)

            val poTokenGen = PoTokenGenerator(context)
            val tokenProvider = object : TokenProvider {
                override val capabilities = TokenProviderCapabilities(
                    providers = setOf(PoTokenProviderKind.WEB_BOTGUARD),
                    usesWebView = true,
                )

                override suspend fun getPoToken(
                    videoId: String,
                    visitorData: String,
                    cookie: String?,
                ): InnerTubeXPoTokenResult? =
                    poTokenGen.getWebClientPoToken(videoId, visitorData)?.let { token ->
                        InnerTubeXPoTokenResult(
                            playerRequestToken = token.playerRequestPoToken,
                            streamingDataToken = token.streamingDataPoToken,
                            visitorData = visitorData,
                        )
                    }

                override suspend fun close() {
                    poTokenGen.close()
                }
            }

            val configParser = YtConfigParserImpl(
                httpClient,
                innerTube,
                remoteStore,
                logger,
            ).withEmbeddedConfigFallback()

            val extractor = InnerTubeExtractor(
                configParser = configParser,
                cipherService = cipherService,
                innerTube = innerTube,
                tokenProvider = tokenProvider,
                logger = logger,
            )

            ExtractionBundle(httpClient, cipherService, extractor).also { currentBundle = it }
        }
    }

    @OptIn(ExperimentalSerializationApi::class)
    private fun createHttpClient(): HttpClient =
        HttpClient(OkHttp) {
            expectSuccess = false

            install(ContentNegotiation) {
                json(
                    Json {
                        ignoreUnknownKeys = true
                        explicitNulls = false
                        encodeDefaults = true
                    }
                )
            }

            install(ContentEncoding) {
                gzip(0.9F)
                deflate(0.8F)
            }

            engine {
                config {
                    connectionPool(okhttp3.ConnectionPool(10, 5, TimeUnit.MINUTES))
                    connectTimeout(30, TimeUnit.SECONDS)
                    readTimeout(60, TimeUnit.SECONDS)
                    writeTimeout(60, TimeUnit.SECONDS)
                    protocols(listOf(okhttp3.Protocol.HTTP_2, okhttp3.Protocol.HTTP_1_1))
                    retryOnConnectionFailure(true)
                }
            }

            install(HttpTimeout) {
                requestTimeoutMillis = 60_000
                connectTimeoutMillis = 30_000
                socketTimeoutMillis = 60_000
            }

            defaultRequest {
                url("https://music.youtube.com/youtubei/v1/")
                header("Accept", "application/json")
                header("Cache-Control", "no-cache")
            }
        }

    private fun YtConfigParser.withEmbeddedConfigFallback(): YtConfigParser =
        object : YtConfigParser by this {
            override suspend fun fetchConfig(
                videoId: String,
                useLoginCookies: Boolean,
            ) =
                try {
                    this@withEmbeddedConfigFallback.fetchConfig(videoId, useLoginCookies)
                } catch (_: IllegalStateException) {
                    this@withEmbeddedConfigFallback.fetchEmbeddedConfig(videoId, useLoginCookies = false)
                }
        }

    private val logger = InnerTubeLogger { event ->
        val details = event.details.entries.joinToString(prefix = " [", postfix = "]") { "${it.key}=${it.value}" }
        val msg = event.message + details.takeUnless { event.details.isEmpty() }.orEmpty()
        when (event.level) {
            InnerTubeLogLevel.DEBUG -> Log.d(TAG, msg)
            InnerTubeLogLevel.INFO -> Log.i(TAG, msg)
            InnerTubeLogLevel.WARN -> Log.w(TAG, msg)
            InnerTubeLogLevel.ERROR -> Log.e(TAG, msg)
        }
    }

    private data class ExtractionBundle(
        val httpClient: HttpClient,
        val cipherService: YouTubeCipherService,
        val extractor: InnerTubeExtractor,
    )

    private class AndroidPlayerConfigRepository(context: Context) : PlayerConfigRepository {
        private val preferences = context.getSharedPreferences("innertubex_player_config", Context.MODE_PRIVATE)

        override val enabled: Boolean = true
        override val sourceUrl: String = PLAYER_CONFIG_URL
        override val defaultSourceUrl: String = PLAYER_CONFIG_URL
        override var cachedJson: String
            get() = preferences.getString("json", "").orEmpty()
            set(value) = preferences.edit().putString("json", value).apply()
        override var cachedAtMs: Long
            get() = preferences.getLong("cached_at_ms", 0L)
            set(value) = preferences.edit().putLong("cached_at_ms", value).apply()
        override var cachedSourceUrl: String
            get() = preferences.getString("source_url", "").orEmpty()
            set(value) = preferences.edit().putString("source_url", value).apply()
        override var cachedEtag: String
            get() = preferences.getString("etag", "").orEmpty()
            set(value) = preferences.edit().putString("etag", value).apply()

        private companion object {
            const val PLAYER_CONFIG_URL =
                "https://raw.githubusercontent.com/ZemerTeam/zemer-cipher/master/library/src/main/assets/player_configs.json"
        }
    }
}
