package com.tauri.shiori.auth

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Log
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
    private val TAG = "AuthPlugin"
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
        handleOAuthIntent(intent)
    }

    /**
     * Also check the launching intent on create, in case the app was cold-started
     * by the OAuth redirect (app was killed while Custom Tab was open).
     */
    override fun load(webView: android.webkit.WebView) {
        super.load(webView)
        val launchIntent = activity.intent
        if (launchIntent != null) {
            handleOAuthIntent(launchIntent)
        }
    }

    private fun handleOAuthIntent(intent: Intent) {
        val action = intent.action
        val data = intent.data
        
        Log.d(TAG, "handleOAuthIntent: action=$action, data=$data")
        
        if (Intent.ACTION_VIEW == action && data != null) {
            if (data.scheme == "shiori" && data.host == "auth") {
                Log.d(TAG, "Received shiori://auth redirect")
                
                // For Implicit Grant, the token is in the fragment part of the URL
                // e.g., shiori://auth#access_token=...&token_type=Bearer&expires_in=...
                val fragment = data.encodedFragment ?: data.fragment
                if (fragment != null) {
                    Log.d(TAG, "Fragment found: $fragment")
                    val params = fragment.split("&").mapNotNull { 
                        val parts = it.split("=", limit = 2)
                        if (parts.size == 2) parts[0] to parts[1] else null
                    }.toMap()
                    
                    val accessToken = params["access_token"]
                    if (accessToken != null) {
                        Log.d(TAG, "Got access_token from fragment (implicit grant)")
                        pendingToken = accessToken
                        pendingExpiresIn = params["expires_in"] ?: ""
                        pendingTokenType = params["token_type"] ?: ""
                        
                        val ret = JSObject()
                        ret.put("access_token", accessToken)
                        ret.put("expires_in", pendingExpiresIn)
                        ret.put("token_type", pendingTokenType)
                        trigger("oauth-token-received", ret)
                        return
                    }
                }
                
                // Authorization Code Grant: code is a query parameter
                // e.g., shiori://auth?code=...
                val code = data.getQueryParameter("code")
                if (code != null) {
                    Log.d(TAG, "Got code from query parameter (authorization code grant)")
                    pendingCode = code
                    
                    val ret = JSObject()
                    ret.put("code", code)
                    trigger("oauth-code-received", ret)
                } else {
                    Log.w(TAG, "No access_token in fragment and no code in query. Full URI: $data")
                }
            }
        }
    }

    @Command
    fun getPendingOAuthData(invoke: Invoke) {
        val ret = JSObject()
        if (pendingToken != null) {
            Log.d(TAG, "Returning pending access_token")
            ret.put("access_token", pendingToken)
            ret.put("expires_in", pendingExpiresIn)
            ret.put("token_type", pendingTokenType)
            
            // Clear after reading
            pendingToken = null
            pendingExpiresIn = null
            pendingTokenType = null
        } else if (pendingCode != null) {
            Log.d(TAG, "Returning pending code")
            ret.put("code", pendingCode)
            
            // Clear after reading
            pendingCode = null
        } else {
            Log.d(TAG, "No pending OAuth data")
        }
        invoke.resolve(ret)
    }

    @Command
    fun startOAuthLogin(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(StartOAuthArgs::class.java)
            val uri = Uri.parse(args.url)
            Log.d(TAG, "Starting OAuth login with URL: $uri")
            
            activity.runOnUiThread {
                try {
                    val customTabsIntent = CustomTabsIntent.Builder().build()
                    customTabsIntent.launchUrl(activity, uri)
                    invoke.resolve()
                } catch (e: Exception) {
                    Log.w(TAG, "Custom Tabs failed, falling back to browser intent", e)
                    try {
                        val browserIntent = Intent(Intent.ACTION_VIEW, uri)
                        activity.startActivity(browserIntent)
                        invoke.resolve()
                    } catch (e2: Exception) {
                        Log.e(TAG, "Failed to launch auth URL", e2)
                        invoke.reject("Failed to launch auth URL: ${e2.message}")
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse args", e)
            invoke.reject("Failed to parse args: ${e.message}")
        }
    }

    @Command
    fun setSecureToken(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetSecureTokenArgs::class.java)
            sharedPreferences.edit().putString("anilist_token", args.token).apply()
            Log.d(TAG, "Secure token saved successfully")
            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set secure token", e)
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
            Log.e(TAG, "Failed to get secure token", e)
            invoke.reject("Failed to get secure token: ${e.message}")
        }
    }

    @Command
    fun clearSecureToken(invoke: Invoke) {
        try {
            sharedPreferences.edit().remove("anilist_token").apply()
            Log.d(TAG, "Secure token cleared")
            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear secure token", e)
            invoke.reject("Failed to clear secure token: ${e.message}")
        }
    }
}
