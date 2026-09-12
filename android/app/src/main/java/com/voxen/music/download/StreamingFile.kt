package com.voxen.music.download

import java.io.File
import java.io.InputStream
import java.io.RandomAccessFile

object StreamingFile {
    fun copy(input: InputStream, file: File, offset: Long, checkActive: () -> Unit = {}, onBytes: (Long) -> Unit = {}): Long {
        var received = offset
        RandomAccessFile(file, "rw").use { output ->
            if (offset == 0L) output.setLength(0L)
            output.seek(offset)
            val buffer = ByteArray(64 * 1024)
            while (true) {
                checkActive()
                val count = input.read(buffer)
                if (count < 0) break
                output.write(buffer, 0, count); received += count; onBytes(received)
            }
            output.fd.sync()
        }
        return received
    }
}
