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

@TauriPlugin
class SafPlugin(private val activity: Activity): Plugin(activity) {

    @Command
    fun selectFolder(invoke: Invoke) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            if (!android.os.Environment.isExternalStorageManager()) {
                val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                val pkgUri = Uri.fromParts("package", activity.packageName, null)
                intent.data = pkgUri
                startActivityForResult(invoke, intent, "manageStorageResult")
                return
            }
        }
        launchFolderPicker(invoke)
    }

    @Command
    fun selectFiles(invoke: Invoke) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            if (!android.os.Environment.isExternalStorageManager()) {
                val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                val pkgUri = Uri.fromParts("package", activity.packageName, null)
                intent.data = pkgUri
                startActivityForResult(invoke, intent, "manageStorageFilesResult")
                return
            }
        }
        launchFilePicker(invoke)
    }

    private fun launchFilePicker(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
        intent.addCategory(Intent.CATEGORY_OPENABLE)
        intent.type = "*/*" // allow all files, or we could filter by mimetype
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
    fun manageStorageResult(invoke: Invoke, result: androidx.activity.result.ActivityResult) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            if (android.os.Environment.isExternalStorageManager()) {
                launchFolderPicker(invoke)
            } else {
                invoke.reject("Storage permission denied")
            }
        } else {
            launchFolderPicker(invoke)
        }
    }

    @app.tauri.annotation.ActivityCallback
    fun manageStorageFilesResult(invoke: Invoke, result: androidx.activity.result.ActivityResult) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            if (android.os.Environment.isExternalStorageManager()) {
                launchFilePicker(invoke)
            } else {
                invoke.reject("Storage permission denied")
            }
        } else {
            launchFilePicker(invoke)
        }
    }

    private fun getPathFromTreeUri(treeUri: Uri): String {
        val path = treeUri.path ?: return treeUri.toString()
        if (path.startsWith("/tree/primary:")) {
            val relativePath = path.substringAfter("/tree/primary:")
            return "/storage/emulated/0/$relativePath"
        } else if (path.startsWith("/document/primary:")) {
            val relativePath = path.substringAfter("/document/primary:")
            return "/storage/emulated/0/$relativePath"
        } else if (path.startsWith("/tree/")) {
            val parts = path.substringAfter("/tree/").split(":")
            if (parts.size == 2) {
                return "/storage/${parts[0]}/${parts[1]}"
            }
        } else if (path.startsWith("/document/")) {
            val parts = path.substringAfter("/document/").split(":")
            if (parts.size == 2) {
                return "/storage/${parts[0]}/${parts[1]}"
            }
        }
        return treeUri.toString()
    }

    @app.tauri.annotation.ActivityCallback
    fun safFolderResult(invoke: Invoke, result: androidx.activity.result.ActivityResult) {
        if (result.resultCode == Activity.RESULT_OK) {
            val uri: Uri? = result.data?.data
            if (uri != null) {
                // Take persistable permissions
                val takeFlags: Int = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                activity.contentResolver.takePersistableUriPermission(uri, takeFlags)

                val ret = JSObject()
                ret.put("uri", getPathFromTreeUri(uri))
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
                    activity.contentResolver.takePersistableUriPermission(itemUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    paths.put(getPathFromTreeUri(itemUri))
                }
            } else if (uri != null) {
                activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                paths.put(getPathFromTreeUri(uri))
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
    fun solveCloudflare(invoke: Invoke) {
        val url = invoke.getString("url") ?: "https://mangafire.to"
        activity.runOnUiThread {
            val webView = android.webkit.WebView(activity)
            webView.settings.javaScriptEnabled = true
            webView.settings.domStorageEnabled = true
            
            // Generate a more standard user agent (Tauri's default usually contains wv or something, but standard is better)
            val userAgent = webView.settings.userAgentString
            
            var solved = false
            webView.webViewClient = object : android.webkit.WebViewClient() {
                override fun onPageFinished(view: android.webkit.WebView, url: String) {
                    if (solved) return
                    // Evaluate document title to check if we bypassed CF
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
            
            // Timeout after 30 seconds
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
