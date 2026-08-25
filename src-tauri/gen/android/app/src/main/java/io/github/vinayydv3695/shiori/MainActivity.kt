package io.github.vinayydv3695.shiori

import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.ActionMode
import android.view.Menu
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private var memoryEventWebView: WebView? = null

  override fun onWebViewCreate(webView: WebView) {
    memoryEventWebView = webView
    webView.setBackgroundColor(Color.TRANSPARENT)
    webView.addJavascriptInterface(object {
      @JavascriptInterface
      fun setStatusBarTheme(colorHex: String, isLight: Boolean) {
        runOnUiThread {
          runCatching {
            val parsedColor = Color.parseColor(colorHex)
            window.statusBarColor = parsedColor
            window.navigationBarColor = parsedColor
            window.decorView.setBackgroundColor(parsedColor)

            val controller = WindowInsetsControllerCompat(window, window.decorView)
            controller.isAppearanceLightStatusBars = isLight
            controller.isAppearanceLightNavigationBars = isLight
          }
        }
      }
    }, "ShioriAndroidTheme")
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Keep the screen awake while reading (default ON). The reader can
    // clear/re-add this flag at runtime via the set_keep_screen_on command
    // when the "Keep Screen On" reading setting is toggled.
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isStatusBarContrastEnforced = false
      window.isNavigationBarContrastEnforced = false
    }

    // Pad decorView below system status bar so header buttons never collide with status bar icons.
    // Setting decorView background color to the active theme hex (via setStatusBarTheme) guarantees
    // 100% seamless color blending with zero rounded corners or dividing lines.
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

