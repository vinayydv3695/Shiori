package com.tauri.shiori.auth

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

@InvokeArg
class StartOAuthArgs {
    var url: String = ""
}

@InvokeArg
class SetSecureTokenArgs {
    var token: String = ""
}

@TauriPlugin
class AuthPlugin(private val activity: Activity) : Plugin(activity) {
    private val PREFS_FILE = "shiori_secure_auth_prefs"
    
    private var pendingToken: String? = null
    private var pendingExpiresIn: String? = null
    private var pendingTokenType: String? = null
    private var pendingCode: String? = null

    private val sharedPreferences by lazy {
        val masterKey = MasterKey.Builder(activity)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        
        EncryptedSharedPreferences.create(
            activity,
            PREFS_FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        
        val action = intent.action
        val data = intent.data
        
        if (Intent.ACTION_VIEW == action && data != null) {
            if (data.scheme == "shiori" && data.host == "auth") {
                // For Implicit Grant, the token is in the fragment part of the URL
                // e.g., shiori://auth#access_token=...&token_type=Bearer&expires_in=...
                val fragment = data.encodedFragment ?: data.fragment
                if (fragment != null) {
                    val params = fragment.split("&").mapNotNull { 
                        val parts = it.split("=")
                        if (parts.size == 2) parts[0] to parts[1] else null
                    }.toMap()
                    
                    val accessToken = params["access_token"]
                    if (accessToken != null) {
                        val ret = JSObject()
                        ret.put("access_token", accessToken)
                        ret.put("expires_in", params["expires_in"] ?: "")
                        ret.put("token_type", params["token_type"] ?: "")
                        
                        pendingToken = accessToken
                        pendingExpiresIn = params["expires_in"] ?: ""
                        pendingTokenType = params["token_type"] ?: ""
                        
                        trigger("oauth-token-received", ret)
                        return
                    }
                }
                
                // Fallback for query param (just in case)
                val code = data.getQueryParameter("code")
                if (code != null) {
                    val ret = JSObject()
                    ret.put("code", code)
                    
                    pendingCode = code
                    
                    trigger("oauth-code-received", ret)
                }
            }
        }
    }

    @Command
    fun getPendingOAuthData(invoke: Invoke) {
        val ret = JSObject()
        if (pendingToken != null) {
            ret.put("access_token", pendingToken)
            ret.put("expires_in", pendingExpiresIn)
            ret.put("token_type", pendingTokenType)
            
            pendingToken = null
            pendingExpiresIn = null
            pendingTokenType = null
        } else if (pendingCode != null) {
            ret.put("code", pendingCode)
            pendingCode = null
        }
        invoke.resolve(ret)
    }

    @Command
    fun startOAuthLogin(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(StartOAuthArgs::class.java)
            val uri = Uri.parse(args.url)
            
            activity.runOnUiThread {
                try {
                    val customTabsIntent = CustomTabsIntent.Builder().build()
                    customTabsIntent.launchUrl(activity, uri)
                    invoke.resolve()
                } catch (e: Exception) {
                    try {
                        val browserIntent = Intent(Intent.ACTION_VIEW, uri)
                        activity.startActivity(browserIntent)
                        invoke.resolve()
                    } catch (e2: Exception) {
                        invoke.reject("Failed to launch auth URL: ${e2.message}")
                    }
                }
            }
        } catch (e: Exception) {
            invoke.reject("Failed to parse args: ${e.message}")
        }
    }

    @Command
    fun setSecureToken(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetSecureTokenArgs::class.java)
            sharedPreferences.edit().putString("anilist_token", args.token).apply()
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to set secure token: ${e.message}")
        }
    }

    @Command
    fun getSecureToken(invoke: Invoke) {
        try {
            val token = sharedPreferences.getString("anilist_token", null)
            val ret = JSObject()
            ret.put("token", token ?: "")
            invoke.resolve(ret)
        } catch (e: Exception) {
            invoke.reject("Failed to get secure token: ${e.message}")
        }
    }

    @Command
    fun clearSecureToken(invoke: Invoke) {
        try {
            sharedPreferences.edit().remove("anilist_token").apply()
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to clear secure token: ${e.message}")
        }
    }
}
