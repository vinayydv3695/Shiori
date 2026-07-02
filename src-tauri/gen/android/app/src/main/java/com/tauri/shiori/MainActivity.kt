package com.tauri.shiori

import android.os.Bundle
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onResume() {
    super.onResume()
    
    // Find WebView and set custom selection action mode callback to disable the native popup
    val rootView = window.decorView.findViewById<ViewGroup>(android.R.id.content)
    val webView = findWebView(rootView)
    
    val callback = object : ActionMode.Callback {
        override fun onCreateActionMode(mode: ActionMode?, menu: Menu?): Boolean {
            menu?.clear() // Clear all items
            return true // Return true to indicate we handled it, preventing fallback to default WebView handler
        }

        override fun onPrepareActionMode(mode: ActionMode?, menu: Menu?): Boolean {
            menu?.clear()
            return false
        }

        override fun onActionItemClicked(mode: ActionMode?, item: MenuItem?): Boolean {
            return false
        }

        override fun onDestroyActionMode(mode: ActionMode?) {}
    }

    webView?.customSelectionActionModeCallback = callback
    webView?.customInsertionActionModeCallback = callback
  }

  override fun onActionModeStarted(mode: ActionMode?) {
      mode?.menu?.clear()
      super.onActionModeStarted(mode)
  }

  private fun findWebView(viewGroup: ViewGroup): WebView? {
    for (i in 0 until viewGroup.childCount) {
        val child = viewGroup.getChildAt(i)
        if (child is WebView) {
            return child
        } else if (child is ViewGroup) {
            val found = findWebView(child)
            if (found != null) return found
        }
    }
    return null
  }
}

