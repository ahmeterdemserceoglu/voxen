package com.voxen.music.download

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File

class DownloadTransferTest {
    @Test fun validatesResumeRanges() {
        assertEquals(10L, DownloadRange.total("bytes 3-9/10", 3))
        assertNull(DownloadRange.total("bytes 0-9/10", 3))
        assertNull(DownloadRange.total("bytes 3-2/10", 3))
        assertNull(DownloadRange.total("bytes 3-10/10", 3))
        assertNull(DownloadRange.total("bytes 3-9/*", 3))
    }
    @Test fun resumesWithoutDuplicatingBytes() {
        val file = File.createTempFile("voxen-resume", ".part")
        try {
            file.writeText("abc")
            assertEquals(6L, StreamingFile.copy(ByteArrayInputStream("def".toByteArray()), file, 3))
            assertEquals("abcdef", file.readText())
        } finally { file.delete() }
    }
    @Test fun fullResponsesReplaceAPartialFile() {
        val file = File.createTempFile("voxen-replace", ".part")
        try { file.writeText("obsolete partial data"); StreamingFile.copy(ByteArrayInputStream("new".toByteArray()), file, 0); assertEquals("new", file.readText()) }
        finally { file.delete() }
    }
    @Test fun interruptionRetainsOnlyTheWrittenPrefix() {
        val file = File.createTempFile("voxen-cancel", ".part")
        try {
            var written = 0L
            try { StreamingFile.copy(ByteArrayInputStream(ByteArray(200000) { 7 }), file, 0, { if (written > 0) error("cancelled") }, { written = it }); fail() }
            catch (_: IllegalStateException) {}
            assertEquals(65536L, file.length())
            assertTrue(file.readBytes().all { it == 7.toByte() })
        } finally { file.delete() }
    }
}
