package uts.sdk.modules.uniChooseSystemImage

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest


object FileUtils {
    data class OpenableInfo(val name: String, val size: Long, val mime: String)

    fun getFilePathByUri(context: Context, uri: Uri): String? {
        var path: String? = null
        if (ContentResolver.SCHEME_FILE == uri.scheme) {
            path = uri.path
            return path
        }
        if (ContentResolver.SCHEME_CONTENT == uri.scheme && Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) {
            val cursor = context.contentResolver.query(
                uri,
                arrayOf(MediaStore.Images.Media.DATA),
                null,
                null,
                null
            )
            if (cursor != null) {
                if (cursor.moveToFirst()) {
                    val columnIndex = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATA)
                    if (columnIndex > -1) {
                        path = cursor.getString(columnIndex)
                    }
                }
                cursor.close()
            }
            return path
        }
        if (ContentResolver.SCHEME_CONTENT == uri.scheme && Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            if (DocumentsContract.isDocumentUri(context, uri)) {
                if (isExternalStorageDocument(uri)) {
                    val docId = DocumentsContract.getDocumentId(uri)
                    val split =
                        docId.split(":".toRegex()).dropLastWhile { it.isEmpty() }.toTypedArray()
                    val type = split[0]
                    if ("primary".equals(type, ignoreCase = true)) {
                        path = Environment.getExternalStorageDirectory().toString() + "/" + split[1]
                        return path
                    }
                } else if (isDownloadsDocument(uri)) {
                    val id = DocumentsContract.getDocumentId(uri)
                    val contentUri = ContentUris.withAppendedId(
                        Uri.parse("content://downloads/public_downloads"),
                        id.toLong()
                    )
                    path = getDataColumn(context, contentUri, null, null)
                    return path
                } else if (isMediaDocument(uri)) {
                    val docId = DocumentsContract.getDocumentId(uri)
                    val split =
                        docId.split(":".toRegex()).dropLastWhile { it.isEmpty() }.toTypedArray()
                    val type = split[0]
                    var contentUri: Uri? = null
                    if ("image" == type) {
                        contentUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                    } else if ("video" == type) {
                        contentUri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                    } else if ("audio" == type) {
                        contentUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                    }
                    val selection = "_id=?"
                    val selectionArgs = arrayOf(split[1])
                    path = getDataColumn(context, contentUri, selection, selectionArgs)
                    return path
                }
            }
        }
        return null
    }

    fun readOpenableInfo(context: Context, uri: Uri): OpenableInfo {
        var name = "file.bin"
        var size = -1L
        var mime = ""
        val resolver = context.contentResolver
        try {
            mime = resolver.getType(uri) ?: ""
        } catch (_: Exception) {
        }
        var cursor: Cursor? = null
        try {
            cursor = resolver.query(uri, null, null, null, null)
            if (cursor != null && cursor.moveToFirst()) {
                val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (nameIdx >= 0) {
                    val n = cursor.getString(nameIdx)
                    if (!n.isNullOrBlank()) name = n
                }
                if (sizeIdx >= 0) {
                    size = cursor.getLong(sizeIdx)
                }
            }
        } catch (_: Exception) {
        } finally {
            cursor?.close()
        }
        return OpenableInfo(name, size, mime)
    }

    /**
     * 将 content/file URI 流式拷贝到应用私有缓存目录，返回绝对路径。
     * 不再整文件读入内存，避免大视频/文件 OOM。
     */
    fun copyUriToDir(context: Context, parentDirStr: String, uriString: String): String? {
        try {
            val uri = Uri.parse(uriString)
            val parentDir = File(parentDirStr)
            val resolver = context.contentResolver
            val info = readOpenableInfo(context, uri)

            var mime: String? = info.mime.ifBlank { null }
            if (mime.isNullOrBlank()) {
                try {
                    mime = resolver.getType(uri)
                } catch (_: Exception) {
                }
            }

            var ext: String? = null
            if (!mime.isNullOrBlank()) {
                ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)
            }
            if (ext.isNullOrEmpty()) {
                val idx = info.name.lastIndexOf('.')
                if (idx != -1 && idx + 1 < info.name.length) {
                    ext = info.name.substring(idx + 1).lowercase()
                }
            }
            if (ext.isNullOrEmpty()) {
                try {
                    val originalPath = getFilePathByUri(context, uri)
                    if (!originalPath.isNullOrEmpty()) {
                        val idx = originalPath.lastIndexOf('.')
                        if (idx != -1 && idx + 1 < originalPath.length) {
                            ext = originalPath.substring(idx + 1).lowercase()
                        }
                    }
                } catch (_: Exception) {
                }
            }
            val extSuffix = if (!ext.isNullOrEmpty()) ".${ext}" else ""
            val name = md5(uri.toString()) + extSuffix

            if (!parentDir.exists()) {
                parentDir.mkdirs()
            }
            val destFile = File(parentDir, name)
            if (destFile.exists() && destFile.isFile && destFile.length() > 0) {
                return destFile.absolutePath
            }

            val inputStream = resolver.openInputStream(uri) ?: return null
            inputStream.use { ins ->
                FileOutputStream(destFile).use { fos ->
                    val buf = ByteArray(64 * 1024)
                    var len: Int
                    while (ins.read(buf).also { len = it } != -1) {
                        fos.write(buf, 0, len)
                    }
                    fos.flush()
                }
            }
            if (!destFile.isFile || destFile.length() <= 0L) {
                destFile.delete()
                return null
            }
            return destFile.absolutePath
        } catch (e: Exception) {
            return null
        }
    }

    private fun md5(input: String): String {
        val md = MessageDigest.getInstance("MD5")
        val bytes = md.digest(input.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun getDataColumn(
        context: Context,
        uri: Uri?,
        selection: String?,
        selectionArgs: Array<String>?,
    ): String? {
        var cursor: Cursor? = null
        val column = "_data"
        val projection = arrayOf(column)
        try {
            cursor =
                context.contentResolver.query(uri!!, projection, selection, selectionArgs, null)
            if (cursor != null && cursor.moveToFirst()) {
                val column_index = cursor.getColumnIndexOrThrow(column)
                return cursor.getString(column_index)
            }
        } finally {
            cursor?.close()
        }
        return null
    }

    private fun isExternalStorageDocument(uri: Uri): Boolean {
        return "com.android.externalstorage.documents" == uri.authority
    }

    private fun isDownloadsDocument(uri: Uri): Boolean {
        return "com.android.providers.downloads.documents" == uri.authority
    }

    private fun isMediaDocument(uri: Uri): Boolean {
        return "com.android.providers.media.documents" == uri.authority
    }
}
