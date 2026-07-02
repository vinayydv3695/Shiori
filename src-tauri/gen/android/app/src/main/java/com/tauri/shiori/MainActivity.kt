package com.tauri.shiori

import android.os.Bundle
import android.view.ActionMode
import android.view.Menu
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // Disable native text-selection popup by clearing the action mode menu
  override fun onActionModeStarted(mode: ActionMode?) {
      mode?.menu?.clear()
      super.onActionModeStarted(mode)
  }
}
