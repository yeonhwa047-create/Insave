package com.instafav.app

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
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
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val ioExecutor = Executors.newFixedThreadPool(2)
    private val prefs by lazy { getSharedPreferences("insta_fav_prefs", Context.MODE_PRIVATE) }

    private val mobileUserAgent =
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"

    private val hookJs: String by lazy {
        assets.open("hook.js").bufferedReader().use { it.readText() }
    }

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

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                if (url != null && url.contains("instagram.com")) {
                    webView.evaluateJavascript(hookJs, null)
                }
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

        webView.evaluateJavascript(hookJs, null)
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
        fun getSyncUrl(): String {
            return prefs.getString("google_sync_url", "") ?: ""
        }

        @JavascriptInterface
        fun setSyncUrl(url: String) {
            prefs.edit().putString("google_sync_url", url.trim()).apply()
        }

        @JavascriptInterface
        fun syncPull() {
            val endpoint = getSyncUrl()
            if (endpoint.isEmpty()) return
            ioExecutor.execute {
                val result = performSyncGet(endpoint)
                runOnUiThread {
                    if (result != null) {
                        val safeJson = JSONObject.quote(result)
                        webView.evaluateJavascript(
                            "window.__igOnSyncPullResult && window.__igOnSyncPullResult(true, $safeJson);",
                            null
                        )
                    } else {
                        webView.evaluateJavascript(
                            "window.__igOnSyncPullResult && window.__igOnSyncPullResult(false, '[]');",
                            null
                        )
                    }
                }
            }
        }

        @JavascriptInterface
        fun syncPush(json: String) {
            val endpoint = getSyncUrl()
            if (endpoint.isEmpty()) return
            ioExecutor.execute {
                val ok = performSyncPost(endpoint, json)
                runOnUiThread {
                    webView.evaluateJavascript(
                        "window.__igOnSyncPushResult && window.__igOnSyncPushResult($ok);",
                        null
                    )
                }
            }
        }

        @JavascriptInterface
        fun downloadImage(imageUrl: String, filename: String) {
            downloadMedia(imageUrl, filename, false)
        }

        @JavascriptInterface
        fun downloadMedia(mediaUrl: String, filename: String, isVideo: Boolean) {
            ioExecutor.execute {
                val ok = saveOriginalMediaToGallery(mediaUrl, filename, isVideo)
                runOnUiThread {
                    if (ok) {
                        val msg = if (isVideo) {
                            "갤러리에 원본 영상이 저장되었어요!"
                        } else {
                            "갤러리에 원본 사진이 저장되었어요!"
                        }
                        Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show()
                        webView.evaluateJavascript(
                            "window.__igOnDownloadResult && window.__igOnDownloadResult(true, $isVideo);",
                            null
                        )
                    } else if (!isVideo) {
                        // 사진 직접 연결 실패 시 WebView 내부 fetch 폴백 시도
                        val safeUrl = JSONObject.quote(mediaUrl)
                        val safeName = JSONObject.quote(filename)
                        webView.evaluateJavascript(
                            "window.__igFallbackFetch && window.__igFallbackFetch($safeUrl, $safeName);",
                            null
                        )
                    } else {
                        Toast.makeText(this@MainActivity, "영상 저장에 실패했어요. 영상을 재생한 뒤 다시 눌러 주세요.", Toast.LENGTH_SHORT).show()
                        webView.evaluateJavascript(
                            "window.__igOnDownloadResult && window.__igOnDownloadResult(false, true);",
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
                    writeBytesToGallery(bytes, filename, false)
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
                        "window.__igOnDownloadResult && window.__igOnDownloadResult($ok, false);",
                        null
                    )
                }
            }
        }
    }

    private fun performSyncGet(endpoint: String): String? {
        var connection: HttpURLConnection? = null
        return try {
            var currentUrl = endpoint
            for (i in 0 until 5) {
                connection?.disconnect()
                connection = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 15000
                    readTimeout = 20000
                    requestMethod = "GET"
                    instanceFollowRedirects = false
                }
                val code = connection.responseCode
                if (code in 301..303 || code == 307 || code == 308) {
                    val loc = connection.getHeaderField("Location") ?: return null
                    currentUrl = loc
                    continue
                }
                if (code !in 200..299) return null
                return connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            }
            null
        } catch (e: Exception) {
            e.printStackTrace()
            null
        } finally {
            connection?.disconnect()
        }
    }

    private fun performSyncPost(endpoint: String, jsonBody: String): Boolean {
        var connection: HttpURLConnection? = null
        return try {
            val payload = jsonBody.toByteArray(Charsets.UTF_8)
            connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15000
                readTimeout = 20000
                requestMethod = "POST"
                instanceFollowRedirects = false
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            }
            connection.outputStream.use { it.write(payload) }
            val code = connection.responseCode
            if (code in 200..299) {
                true
            } else if (code in 301..303 || code == 307 || code == 308) {
                // Google Apps Script는 POST 처리 후 302 리다이렉트를 반환함
                val redirectUrl = connection.getHeaderField("Location")
                if (!redirectUrl.isNullOrEmpty()) {
                    performSyncGet(redirectUrl) != null
                } else {
                    true
                }
            } else {
                false
            }
        } catch (e: Exception) {
            e.printStackTrace()
            false
        } finally {
            connection?.disconnect()
        }
    }

    private fun saveOriginalMediaToGallery(mediaUrl: String, filename: String, isVideo: Boolean): Boolean {
        var connection: HttpURLConnection? = null
        return try {
            var currentUrl = mediaUrl
            for (i in 0 until 5) {
                connection?.disconnect()
                connection = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20000
                    readTimeout = if (isVideo) 60000 else 20000
                    requestMethod = "GET"
                    instanceFollowRedirects = false
                    setRequestProperty("User-Agent", mobileUserAgent)
                    setRequestProperty("Referer", "https://www.instagram.com/")
                    setRequestProperty(
                        "Accept",
                        if (isVideo) "video/mp4,video/*;q=0.9,*/*;q=0.8"
                        else "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
                    )
                    val cookies = CookieManager.getInstance().getCookie(currentUrl)
                    if (!cookies.isNullOrEmpty()) {
                        setRequestProperty("Cookie", cookies)
                    }
                }
                val code = connection.responseCode
                if (code in 301..303 || code == 307 || code == 308) {
                    val loc = connection.getHeaderField("Location") ?: return false
                    currentUrl = loc
                    continue
                }
                if (code !in 200..299) return false

                return connection.inputStream.use { input ->
                    writeStreamToGallery(input, filename, isVideo)
                }
            }
            false
        } catch (e: Exception) {
            e.printStackTrace()
            false
        } finally {
            connection?.disconnect()
        }
    }

    private fun writeBytesToGallery(bytes: ByteArray, filename: String, isVideo: Boolean): Boolean {
        return bytes.inputStream().use { input ->
            writeStreamToGallery(input, filename, isVideo)
        }
    }

    private fun writeStreamToGallery(input: InputStream, filename: String, isVideo: Boolean): Boolean {
        return try {
            val mimeType = if (isVideo) {
                "video/mp4"
            } else {
                when {
                    filename.endsWith(".png", ignoreCase = true) -> "image/png"
                    filename.endsWith(".webp", ignoreCase = true) -> "image/webp"
                    else -> "image/jpeg"
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val collection = if (isVideo) {
                    MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                } else {
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                }
                val relDir = if (isVideo) {
                    Environment.DIRECTORY_MOVIES + "/InstaFav"
                } else {
                    Environment.DIRECTORY_PICTURES + "/InstaFav"
                }

                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, relDir)
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }

                val resolver = contentResolver
                val uri = resolver.insert(collection, values) ?: return false

                var totalBytes = 0L
                resolver.openOutputStream(uri)?.use { out: OutputStream ->
                    totalBytes = input.copyTo(out, bufferSize = 16384)
                } ?: run {
                    resolver.delete(uri, null, null)
                    return false
                }

                if (totalBytes <= 0L) {
                    resolver.delete(uri, null, null)
                    return false
                }

                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                true
            } else {
                val baseDir = Environment.getExternalStoragePublicDirectory(
                    if (isVideo) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_PICTURES
                )
                val dir = File(baseDir, "InstaFav")
                if (!dir.exists()) dir.mkdirs()
                val file = File(dir, filename)
                var totalBytes = 0L
                FileOutputStream(file).use { out ->
                    totalBytes = input.copyTo(out, bufferSize = 16384)
                }
                if (totalBytes <= 0L) {
                    file.delete()
                    return false
                }
                MediaScannerConnection.scanFile(this, arrayOf(file.absolutePath), arrayOf(mimeType), null)
                true
            }
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
