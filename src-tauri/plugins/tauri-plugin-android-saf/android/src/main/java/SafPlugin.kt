package com.tauri.shiori.saf

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.JSArray
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import java.io.File
import java.io.FileOutputStream
import androidx.documentfile.provider.DocumentFile

@TauriPlugin
class SafPlugin(private val activity: Activity): Plugin(activity) {

    @Command
    fun selectFolder(invoke: Invoke) {
        launchFolderPicker(invoke)
    }

    @Command
    fun selectFiles(invoke: Invoke) {
        launchFilePicker(invoke)
    }

    /**
     * Reports whether the standard Android "Files and media" runtime permission is currently
     * granted. This is a UX nudge only — the SAF folder/file pickers (ACTION_OPEN_DOCUMENT_TREE /
     * ACTION_OPEN_DOCUMENT) do NOT require this permission to work, since picking a folder/file
     * is itself the access grant. Callers must not gate the picker on this result.
     */
    @Command
    fun checkStoragePermission(invoke: Invoke) {
        val ret = JSObject()
        ret.put("granted", hasStoragePermission())
        invoke.resolve(ret)
    }

    @Command
    fun requestStoragePermission(invoke: Invoke) {
        if (hasStoragePermission()) {
            val ret = JSObject()
            ret.put("granted", true)
            invoke.resolve(ret)
            return
        }

        val permissions = if (Build.VERSION.SDK_INT >= 33) {
            arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_AUDIO)
        } else {
            arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }

        activity.requestPermissions(permissions, 9999)
        
        val ret = JSObject()
        ret.put("granted", false)
        ret.put("requested", true)
        invoke.resolve(ret)
    }

    /**
     * Opens the app's own "App info" system Settings screen (ACTION_APPLICATION_DETAILS_SETTINGS,
     * scoped to this app's package) so the user can grant storage/media permissions manually.
     */
    @Command
    fun openAppSettings(invoke: Invoke) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            intent.data = Uri.fromParts("package", activity.packageName, null)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to open app settings: ${e.message}")
        }
    }

    private fun hasStoragePermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= 33) {
            // Android 13+ (API 33+): "Files and media" maps to the READ_MEDIA_* permissions.
            // These only cover MediaStore-indexed photos/videos/audio, not document formats
            // like .epub/.pdf/.cbz/.cbr/.mobi/.azw3 — hence this is a nudge, not a gate.
            ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_MEDIA_VIDEO) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun launchFilePicker(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
        intent.addCategory(Intent.CATEGORY_OPENABLE)
        intent.type = "*/*"
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        activity.runOnUiThread {
            try {
                startActivityForResult(invoke, intent, "safFilesResult")
            } catch (e: Exception) {
                invoke.reject("Failed to open file picker: ${e.message}")
            }
        }
    }

    private fun launchFolderPicker(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        activity.runOnUiThread {
            try {
                startActivityForResult(invoke, intent, "safFolderResult")
            } catch (e: Exception) {
                invoke.reject("Failed to open folder picker: ${e.message}")
            }
        }
    }

    @app.tauri.annotation.ActivityCallback
    fun safFolderResult(invoke: Invoke, result: androidx.activity.result.ActivityResult) {
        if (result.resultCode == Activity.RESULT_OK) {
            val uri: Uri? = result.data?.data
            if (uri != null) {
                val takeFlags: Int = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                try {
                    activity.contentResolver.takePersistableUriPermission(uri, takeFlags)
                } catch (e: Exception) {
                    // Ignore if we can't take persistable permission
                }

                val ret = JSObject()
                ret.put("uri", uri.toString())
                invoke.resolve(ret)
            } else {
                invoke.reject("No folder selected or URI is null")
            }
        } else {
            invoke.reject("User cancelled folder selection")
        }
    }

    @app.tauri.annotation.ActivityCallback
    fun safFilesResult(invoke: Invoke, result: androidx.activity.result.ActivityResult) {
        if (result.resultCode == Activity.RESULT_OK) {
            val clipData = result.data?.clipData
            val uri = result.data?.data
            val files = JSArray()

            fun appendFile(uri: Uri) {
                try {
                    activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                } catch (e: Exception) {
                }

                val docFile = DocumentFile.fromSingleUri(activity, uri)
                val name = docFile?.name ?: uri.lastPathSegment ?: "selected-file"
                val obj = JSObject()
                obj.put("uri", uri.toString())
                obj.put("name", name)
                obj.put("size", docFile?.length() ?: 0)
                files.put(obj)
            }

            if (clipData != null) {
                for (i in 0 until clipData.itemCount) {
                    appendFile(clipData.getItemAt(i).uri)
                }
            } else if (uri != null) {
                appendFile(uri)
            }

            if (files.length() > 0) {
                val ret = JSObject()
                ret.put("files", files)
                invoke.resolve(ret)
            } else {
                invoke.reject("No files selected")
            }
        } else {
            invoke.reject("User cancelled file selection")
        }
    }

    @Command
    fun enumerateTree(invoke: Invoke) {
        val treeUriStr = invoke.getArgs().getString("uri", null)
        if (treeUriStr == null) {
            invoke.reject("Missing uri")
            return
        }
        val treeUri = Uri.parse(treeUriStr)
        val docFile = androidx.documentfile.provider.DocumentFile.fromTreeUri(activity, treeUri)
        if (docFile == null) {
            invoke.reject("Invalid tree uri")
            return
        }

        val supportedExtensions = listOf("epub", "pdf", "mobi", "azw", "azw3", "txt", "fb2", "docx", "html", "htm", "md", "djvu", "cbz", "cbr", "zip")
        val results = JSArray()

        fun traverse(dir: androidx.documentfile.provider.DocumentFile) {
            val files = dir.listFiles()
            for (file in files) {
                if (file.isDirectory) {
                    traverse(file)
                } else {
                    val name = file.name ?: ""
                    val ext = name.substringAfterLast('.', "").lowercase()
                    if (supportedExtensions.contains(ext)) {
                        val obj = JSObject()
                        obj.put("uri", file.uri.toString())
                        obj.put("name", name)
                        obj.put("size", file.length())
                        results.put(obj)
                    }
                }
            }
        }

        Thread {
            try {
                traverse(docFile)
                val ret = JSObject()
                ret.put("files", results)
                invoke.resolve(ret)
            } catch (e: Exception) {
                invoke.reject(e.message ?: "Unknown error during enumeration")
            }
        }.start()
    }

    @Command
    fun copyDocument(invoke: Invoke) {
        val uriStr = invoke.getArgs().getString("uri", null)
        if (uriStr == null) {
            invoke.reject("Missing uri")
            return
        }
        val name = invoke.getArgs().getString("name", null)
        if (name == null) {
            invoke.reject("Missing name")
            return
        }

        Thread {
            try {
                val uri = Uri.parse(uriStr)
                val inputStream = activity.contentResolver.openInputStream(uri)
                if (inputStream == null) {
                    invoke.reject("Could not open input stream for $uriStr")
                    return@Thread
                }

                // Shiori app cache directory for imported books
                val cacheDir = File(activity.cacheDir, "imported_books")
                if (!cacheDir.exists()) {
                    cacheDir.mkdirs()
                }

                val sourceFile = File(name)
                val baseName = sourceFile.nameWithoutExtension
                val extension = sourceFile.extension

                var destFile = File(cacheDir, name)
                var duplicateIndex = 1
                while (destFile.exists()) {
                    val candidateName = if (extension.isNotEmpty()) {
                        "$baseName ($duplicateIndex).$extension"
                    } else {
                        "$baseName ($duplicateIndex)"
                    }
                    destFile = File(cacheDir, candidateName)
                    duplicateIndex += 1
                }

                val outputStream = FileOutputStream(destFile)
                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                }

                outputStream.flush()
                outputStream.close()
                inputStream.close()

                val ret = JSObject()
                ret.put("path", destFile.absolutePath)
                invoke.resolve(ret)
            } catch (e: Exception) {
                invoke.reject(e.message ?: "Unknown error copying document")
            }
        }.start()
    }

    @Command
    fun createDocument(invoke: Invoke) {
        val mimeType = invoke.getArgs().getString("mimeType", "*/*")
        val fileName = invoke.getArgs().getString("fileName", "export.zip")
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mimeType
            putExtra(Intent.EXTRA_TITLE, fileName)
        }
        activity.runOnUiThread {
            startActivityForResult(invoke, intent, "safCreateDocumentResult")
        }
    }

    @app.tauri.annotation.ActivityCallback
    fun safCreateDocumentResult(invoke: Invoke, result: androidx.activity.result.ActivityResult) {
        if (result.resultCode == Activity.RESULT_OK) {
            val uri = result.data?.data
            if (uri != null) {
                try {
                    activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                } catch (e: Exception) {
                }
                val ret = JSObject()
                ret.put("uri", uri.toString())
                invoke.resolve(ret)
            } else {
                invoke.reject("No location selected")
            }
        } else {
            invoke.reject("User cancelled save location selection")
        }
    }

    @Command
    fun writeDocument(invoke: Invoke) {
        val uriStr = invoke.getArgs().getString("uri", null)
        val srcPath = invoke.getArgs().getString("path", null)
        if (uriStr == null || srcPath == null) {
            invoke.reject("Missing uri or path")
            return
        }

        Thread {
            try {
                val uri = Uri.parse(uriStr)
                val srcFile = File(srcPath)
                if (!srcFile.exists()) {
                    invoke.reject("Source file does not exist")
                    return@Thread
                }
                
                val outputStream = activity.contentResolver.openOutputStream(uri)
                if (outputStream == null) {
                    invoke.reject("Could not open output stream for $uriStr")
                    return@Thread
                }
                
                srcFile.inputStream().use { input ->
                    outputStream.use { output ->
                        input.copyTo(output)
                    }
                }
                invoke.resolve()
            } catch (e: Exception) {
                invoke.reject(e.message ?: "Unknown error writing document")
            }
        }.start()
    }

    @Command
    fun solveCloudflare(invoke: Invoke) {
        val url = invoke.getArgs().getString("url", null) ?: "https://mangafire.to"
        activity.runOnUiThread {
            val webView = android.webkit.WebView(activity)
            webView.settings.javaScriptEnabled = true
            webView.settings.domStorageEnabled = true

            val userAgent = webView.settings.userAgentString

            var solved = false
            webView.webViewClient = object : android.webkit.WebViewClient() {
                override fun onPageFinished(view: android.webkit.WebView, url: String) {
                    if (solved) return
                    view.evaluateJavascript("document.title") { title ->
                        if (title != null && !title.contains("Just a moment") && !title.contains("Attention Required")) {
                            solved = true
                            val cookies = android.webkit.CookieManager.getInstance().getCookie(url)
                            val ret = JSObject()
                            ret.put("cookies", cookies ?: "")
                            ret.put("userAgent", userAgent)
                            invoke.resolve(ret)
                            view.destroy()
                        }
                    }
                }
            }
            webView.loadUrl(url)

            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                if (!solved) {
                    solved = true
                    invoke.reject("Cloudflare solver timed out on Android WebView")
                    webView.destroy()
                }
            }, 30000)
        }
    }
}
