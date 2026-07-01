package com.tauri.shiori.saf

import android.app.Activity
import android.content.Intent
import android.net.Uri
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
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

    private fun getPathFromTreeUri(treeUri: Uri): String {
        val path = treeUri.path ?: return treeUri.toString()
        if (path.startsWith("/tree/primary:")) {
            val relativePath = path.substringAfter("/tree/primary:")
            return "/storage/emulated/0/$relativePath"
        } else if (path.startsWith("/tree/")) {
            val parts = path.substringAfter("/tree/").split(":")
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
}
