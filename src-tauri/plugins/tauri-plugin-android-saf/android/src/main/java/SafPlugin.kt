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
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        
        startActivityForResult(invoke, intent, "safFolderResult")
    }

    @app.tauri.annotation.ActivityCallback
    fun safFolderResult(invoke: Invoke, result: app.tauri.plugin.ActivityResult) {
        if (result.resultCode == Activity.RESULT_OK) {
            val uri: Uri? = result.data?.data
            if (uri != null) {
                // Take persistable permissions
                val takeFlags: Int = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                activity.contentResolver.takePersistableUriPermission(uri, takeFlags)

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
}
