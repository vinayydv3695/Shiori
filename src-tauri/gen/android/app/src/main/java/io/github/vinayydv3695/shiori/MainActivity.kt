package io.github.vinayydv3695.shiori

import android.content.Intent
import android.os.Bundle
import android.view.ActionMode
import android.view.Menu
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var memoryEventWebView: WebView? = null

  override fun onWebViewCreate(webView: WebView) {
    memoryEventWebView = webView
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Keep the screen awake while reading (default ON). The reader can
    // clear/re-add this flag at runtime via the set_keep_screen_on command
    // when the "Keep Screen On" reading setting is toggled.
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    // Edge-to-edge is enforced on targetSdk 35+; pad the decor view below the
    // system status bar so page content is never hidden behind it. (The WebView
    // reports no safe-area env() insets, so CSS cannot do this.)
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      view.setPadding(0, bars.top, 0, 0)
      insets
    }
  }

  override fun onNewIntent(intent: Intent) {
    // Update the activity's intent so that plugins checking activity.intent
    // (e.g., AuthPlugin.load() for cold-start scenarios) see the latest intent.
    setIntent(intent)
    super.onNewIntent(intent)
  }

  // Disable native text-selection popup by clearing the action mode menu
  override fun onActionModeStarted(mode: ActionMode?) {
      mode?.menu?.clear()
      super.onActionModeStarted(mode)
  }

  // Forward system low-memory pressure to the webview so the reader can purge
  // large cached blobs and processed chapters before the OS kills the process.
  override fun onLowMemory() {
    super.onLowMemory()
    memoryEventWebView?.post {
      runCatching {
        memoryEventWebView?.evaluateJavascript(
          "window.dispatchEvent(new Event('shiori-low-memory'))",
          null,
        )
      }
    }
  }
}

