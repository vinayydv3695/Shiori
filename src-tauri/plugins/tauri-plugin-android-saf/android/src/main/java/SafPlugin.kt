package com.tauri.shiori.saf

import android.app.Activity
import android.content.Intent
import android.net.Uri
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.JSArray
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import java.io.File
import java.io.FileOutputStream

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

    private fun launchFilePicker(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
        intent.addCategory(Intent.CATEGORY_OPENABLE)
        intent.type = "*/*"
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        startActivityForResult(invoke, intent, "safFilesResult")
    }

    private fun launchFolderPicker(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        startActivityForResult(invoke, intent, "safFolderResult")
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
            val paths = JSArray()

            if (clipData != null) {
                for (i in 0 until clipData.itemCount) {
                    val itemUri = clipData.getItemAt(i).uri
                    try { activity.contentResolver.takePersistableUriPermission(itemUri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (e: Exception) {}
                    paths.put(itemUri.toString())
                }
            } else if (uri != null) {
                try { activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (e: Exception) {}
                paths.put(uri.toString())
            }

            if (paths.length() > 0) {
                val ret = JSObject()
                ret.put("uris", paths)
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

        val supportedExtensions = listOf("epub", "pdf", "mobi", "azw3", "cbz", "cbr", "zip")
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

                val destFile = File(cacheDir, name)
                
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
