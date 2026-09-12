package com.voxen.music.download

object DownloadRange {
    fun total(header: String?, offset: Long): Long? {
        val match = Regex("bytes (\\d+)-(\\d+)/(\\d+)").matchEntire(header?.trim().orEmpty()) ?: return null
        val start = match.groupValues[1].toLongOrNull() ?: return null
        val end = match.groupValues[2].toLongOrNull() ?: return null
        val total = match.groupValues[3].toLongOrNull() ?: return null
        return total.takeIf { start == offset && end >= start && total > end }
    }
}
