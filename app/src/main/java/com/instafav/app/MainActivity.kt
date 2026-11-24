package com.instafav.app

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val ioExecutor = Executors.newSingleThreadExecutor()
    private val prefs by lazy { getSharedPreferences("insta_fav_prefs", Context.MODE_PRIVATE) }

    private val mobileUserAgent =
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"

    private val injectedCss: String by lazy {
        assets.open("inject.css").bufferedReader().use { it.readText() }
    }

    private val injectedJs: String by lazy {
        assets.open("inject.js").bufferedReader().use { it.readText() }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            useWideViewPort = true
            loadWithOverviewMode = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            mediaPlaybackRequiresUserGesture = false
            userAgentString = mobileUserAgent
        }

        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
        webView.webChromeClient = WebChromeClient()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (url != null && url.contains("instagram.com")) {
                    injectUiScripts()
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })

        webView.loadUrl("https://www.instagram.com/")
    }

    private fun injectUiScripts() {
        val escapedCss = injectedCss
            .replace("\\", "\\\\")
            .replace("`", "\\`")
            .replace("$", "\\$")

        val cssLoader = """
            (function() {
              if (!document.getElementById('ig-fav-style')) {
                const style = document.createElement('style');
                style.id = 'ig-fav-style';
                style.textContent = `$escapedCss`;
                document.head.appendChild(style);
              }
            })();
        """.trimIndent()

        webView.evaluateJavascript(cssLoader, null)
        webView.evaluateJavascript(injectedJs, null)
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun loadFavorites(): String {
            return prefs.getString("favorites_json", "[]") ?: "[]"
        }

        @JavascriptInterface
        fun saveFavorites(json: String) {
            prefs.edit().putString("favorites_json", json).apply()
        }

        @JavascriptInterface
        fun loadThemeDark(): Boolean {
            return prefs.getBoolean("theme_dark", true)
        }

        @JavascriptInterface
        fun saveThemeDark(dark: Boolean) {
            prefs.edit().putBoolean("theme_dark", dark).apply()
        }

        @JavascriptInterface
        fun downloadImage(imageUrl: String, filename: String) {
            ioExecutor.execute {
                val ok = saveOriginalImageToGallery(imageUrl, filename)
                runOnUiThread {
                    if (ok) {
                        Toast.makeText(this@MainActivity, "갤러리에 원본 사진이 저장되었어요!", Toast.LENGTH_SHORT).show()
                        webView.evaluateJavascript(
                            "window.__igOnDownloadResult && window.__igOnDownloadResult(true);",
                            null
                        )
                    } else {
                        // 직접 연결 실패 시 WebView 내부 fetch 폴백 시도
                        val safeUrl = JSONObject.quote(imageUrl)
                        val safeName = JSONObject.quote(filename)
                        webView.evaluateJavascript(
                            "window.__igFallbackFetch && window.__igFallbackFetch($safeUrl, $safeName);",
                            null
                        )
                    }
                }
            }
        }

        @JavascriptInterface
        fun saveBase64Image(dataUrl: String, filename: String) {
            ioExecutor.execute {
                val ok = try {
                    val base64Part = dataUrl.substringAfter(",", dataUrl)
                    val bytes = Base64.decode(base64Part, Base64.DEFAULT)
                    writeImageBytesToGallery(bytes, filename)
                } catch (e: Exception) {
                    e.printStackTrace()
                    false
                }
                runOnUiThread {
                    if (ok) {
                        Toast.makeText(this@MainActivity, "갤러리에 원본 사진이 저장되었어요!", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@MainActivity, "사진 저장에 실패했어요.", Toast.LENGTH_SHORT).show()
                    }
                    webView.evaluateJavascript(
                        "window.__igOnDownloadResult && window.__igOnDownloadResult($ok);",
                        null
                    )
                }
            }
        }
    }

    private fun saveOriginalImageToGallery(imageUrl: String, filename: String): Boolean {
        var connection: HttpURLConnection? = null
        return try {
            val url = URL(imageUrl)
            connection = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15000
                readTimeout = 20000
                requestMethod = "GET"
                instanceFollowRedirects = true
                setRequestProperty("User-Agent", mobileUserAgent)
                setRequestProperty("Referer", "https://www.instagram.com/")
                setRequestProperty("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
                val cookies = CookieManager.getInstance().getCookie(imageUrl)
                if (!cookies.isNullOrEmpty()) {
                    setRequestProperty("Cookie", cookies)
                }
            }

            if (connection.responseCode !in 200..299) return false

            val bytes = connection.inputStream.use { it.readBytes() }
            if (bytes.isEmpty()) return false
            writeImageBytesToGallery(bytes, filename)
        } catch (e: Exception) {
            e.printStackTrace()
            false
        } finally {
            connection?.disconnect()
        }
    }

    private fun writeImageBytesToGallery(bytes: ByteArray, filename: String): Boolean {
        return try {
            val mimeType = when {
                filename.endsWith(".png", ignoreCase = true) -> "image/png"
                filename.endsWith(".webp", ignoreCase = true) -> "image/webp"
                else -> "image/jpeg"
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, filename)
                    put(MediaStore.Images.Media.MIME_TYPE, mimeType)
                    put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/InstaFav")
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
                val resolver = contentResolver
                val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                    ?: return false

                resolver.openOutputStream(uri)?.use { out ->
                    out.write(bytes)
                } ?: return false

                values.clear()
                values.put(MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                true
            } else {
                val dir = File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                    "InstaFav"
                )
                if (!dir.exists()) dir.mkdirs()
                val file = File(dir, filename)
                FileOutputStream(file).use { it.write(bytes) }
                MediaScannerConnection.scanFile(this, arrayOf(file.absolutePath), arrayOf(mimeType), null)
                true
            }
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
