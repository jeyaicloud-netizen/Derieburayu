package com.ussdcast.bridge;

import android.Manifest;
import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.telephony.TelephonyManager;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
    private static final int REQ_MEDIA_PROJECTION = 1001;
    private static final int REQ_PERMISSIONS = 1002;
    private static final String DEFAULT_PWA_URL = "https://nativeappderieburayu.vercel.app/#mode=sender&room=";

    private TextView statusText;
    private Button a11yBtn;
    private EditText roomInput;
    private boolean autoFlowArmed = false;
    private boolean launchedFromWeb = false;
    private boolean projectionPromptedOnce = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(48, 48, 48, 48);

        statusText = new TextView(this);
        statusText.setTextSize(14f);
        statusText.setPadding(0, 0, 0, 24);

        roomInput = new EditText(this);
        roomInput.setHint("Room ID (e.g. demo1234)");
        roomInput.setText("demo1234");
        roomInput.setSingleLine(true);

        a11yBtn = new Button(this);
        a11yBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showAccessibilityDisclosure();
            }
        });

        Button restrictedBtn = new Button(this);
        restrictedBtn.setText("App Info (Allow restricted settings)");
        restrictedBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openAppInfoSettings();
            }
        });

        Button startBtn = new Button(this);
        startBtn.setText("2. Start MediaProjection (Background)");
        startBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                autoFlowArmed = true;
                requestPermissionsAndProjection();
            }
        });

        Button openWebBtn = new Button(this);
        openWebBtn.setText("3. Open Web PWA (Sender)");
        openWebBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openSenderPwa();
            }
        });

        Button stopBtn = new Button(this);
        stopBtn.setText("Stop Bridge");
        stopBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                autoFlowArmed = false;
                projectionPromptedOnce = false;
                stopService(new Intent(MainActivity.this, BridgeService.class));
                refreshStatus();
            }
        });

        layout.addView(statusText);
        layout.addView(roomInput);
        layout.addView(a11yBtn);
        layout.addView(restrictedBtn);
        layout.addView(startBtn);
        layout.addView(openWebBtn);
        layout.addView(stopBtn);
        setContentView(layout);

        handleIncomingIntent(getIntent());
        refreshStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
        if (autoFlowArmed && AccessibilityControlService.isRunning()
                && !BridgeService.isProjectionActive() && !projectionPromptedOnce) {
            projectionPromptedOnce = true;
            requestPermissionsAndProjection();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data != null && roomInput != null) {
            launchedFromWeb = true;
            String room = data.getQueryParameter("room");
            if (room != null && !room.trim().isEmpty()) {
                roomInput.setText(room.trim());
            }
            if ("1".equals(data.getQueryParameter("autostart"))) {
                autoFlowArmed = true;
                if (!AccessibilityControlService.isRunning()) {
                    showAccessibilityDisclosure();
                } else if (!BridgeService.isProjectionActive() && !projectionPromptedOnce) {
                    projectionPromptedOnce = true;
                    requestPermissionsAndProjection();
                }
            }
        }
    }

    private void refreshStatus() {
        boolean a11yOn = AccessibilityControlService.isRunning();
        boolean projOn = BridgeService.isProjectionActive();
        if (a11yBtn != null) {
            a11yBtn.setText(a11yOn
                    ? "1. Remote Touch (Accessibility): ON ✅"
                    : "1. Enable Remote Touch (Accessibility)");
        }
        if (statusText != null) {
            statusText.setText("UssdCast Background Bridge (Android 8-16)\n"
                    + "Screen Cast: " + (projOn ? "BACKGROUND ACTIVE" : "OFF") + "\n"
                    + "Remote Touch (Home/Dialer): " + (a11yOn ? "ACTIVE" : "OFF"));
        }
    }

    private void openAppInfoSettings() {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getPackageName(), null));
        startActivity(i);
    }

    private void showAccessibilityDisclosure() {
        if (AccessibilityControlService.isRunning()) {
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Accessibility Disclosure")
                .setMessage("UssdCast Bridge uses AccessibilityService to perform remote tap, scroll, Back, and Home actions you authorize from your Controller across Dialer, USSD, and Home screens.")
                .setPositiveButton("Open Accessibility", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        autoFlowArmed = true;
                        startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
                    }
                })
                .setNeutralButton("Allow Restricted (App Info)", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        autoFlowArmed = true;
                        openAppInfoSettings();
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void openSenderPwa() {
        String room = roomInput.getText().toString().trim();
        if (room.isEmpty()) room = "demo1234";
        Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse(DEFAULT_PWA_URL + Uri.encode(room)));
        startActivity(browser);
    }

    private void requestPermissionsAndProjection() {
        boolean needCall = checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED;
        boolean needNotif = Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED;

        if (needCall || needNotif) {
            if (Build.VERSION.SDK_INT >= 33) {
                requestPermissions(new String[]{
                        Manifest.permission.CALL_PHONE,
                        "android.permission.POST_NOTIFICATIONS"
                }, REQ_PERMISSIONS);
            } else {
                requestPermissions(new String[]{Manifest.permission.CALL_PHONE}, REQ_PERMISSIONS);
            }
            return;
        }
        launchMediaProjectionPrompt();
    }

    private void launchMediaProjectionPrompt() {
        MediaProjectionManager mgr = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (mgr != null) {
            startActivityForResult(mgr.createScreenCaptureIntent(), REQ_MEDIA_PROJECTION);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMISSIONS) {
            launchMediaProjectionPrompt();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_MEDIA_PROJECTION && resultCode == RESULT_OK && data != null) {
            Intent svc = new Intent(this, BridgeService.class);
            svc.putExtra("resultCode", resultCode);
            svc.putExtra("data", data);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(svc);
            } else {
                startService(svc);
            }
            autoFlowArmed = false;
            refreshStatus();
            moveTaskToBack(true);
            if (launchedFromWeb) {
                finish();
            }
        } else if (requestCode == REQ_MEDIA_PROJECTION) {
            projectionPromptedOnce = false;
        }
    }
}

class BridgeService extends Service {
    private static final String CHANNEL_ID = "ussdcast_bridge_channel";
    private static final int PORT = 8765;

    private volatile boolean running = false;
    private static volatile boolean projectionActive = false;
    private volatile byte[] latestJpeg = null;

    public static boolean isProjectionActive() {
        return projectionActive;
    }

    private ServerSocket serverSocket;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private Handler mainHandler;

    @Override
    public void onCreate() {
        super.onCreate();
        mainHandler = new Handler(Looper.getMainLooper());
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(101, notification, 0x00000020); // FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
        } else {
            startForeground(101, notification);
        }

        if (intent != null && mediaProjection == null) {
            int resultCode = intent.getIntExtra("resultCode", Activity.RESULT_CANCELED);
            Intent data = Build.VERSION.SDK_INT >= 33
                    ? intent.getParcelableExtra("data", Intent.class)
                    : intent.getParcelableExtra("data");
            if (resultCode == Activity.RESULT_OK && data != null) {
                startProjection(resultCode, data);
            }
        }

        if (!running) {
            running = true;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    runHttpServer();
                }
            }, "BridgeHttpThread").start();
        }
        return START_STICKY;
    }

    private void startProjection(int resultCode, Intent data) {
        MediaProjectionManager mgr = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (mgr == null) return;
        mediaProjection = mgr.getMediaProjection(resultCode, data);
        if (mediaProjection == null) return;

        projectionActive = true;
        mediaProjection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                projectionActive = false;
                stopSelf();
            }
        }, mainHandler);

        DisplayMetrics dm = new DisplayMetrics();
        WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        int rawW = 1080;
        int rawH = 1920;
        if (wm != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    Rect bounds = wm.getCurrentWindowMetrics().getBounds();
                    rawW = bounds.width();
                    rawH = bounds.height();
                } catch (Throwable t) {
                    wm.getDefaultDisplay().getRealMetrics(dm);
                    rawW = dm.widthPixels;
                    rawH = dm.heightPixels;
                }
            } else {
                wm.getDefaultDisplay().getRealMetrics(dm);
                if (dm.widthPixels > 0) rawW = dm.widthPixels;
                if (dm.heightPixels > 0) rawH = dm.heightPixels;
            }
        }
        final int width = Math.max(360, rawW > 0 ? rawW / 2 : 540);
        final int height = Math.max(640, rawH > 0 ? rawH / 2 : 960);
        int density = dm.densityDpi > 0 ? dm.densityDpi : 320;

        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        imageReader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
            @Override
            public void onImageAvailable(ImageReader reader) {
                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    if (image == null) return;
                    Image.Plane[] planes = image.getPlanes();
                    ByteBuffer buffer = planes[0].getBuffer();
                    int pixelStride = planes[0].getPixelStride();
                    int rowStride = planes[0].getRowStride();
                    int rowPadding = rowStride - pixelStride * width;

                    Bitmap full = Bitmap.createBitmap(
                            width + rowPadding / pixelStride,
                            height,
                            Bitmap.Config.ARGB_8888
                    );
                    full.copyPixelsFromBuffer(buffer);
                    Bitmap cropped = Bitmap.createBitmap(full, 0, 0, width, height);
                    full.recycle();

                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    cropped.compress(Bitmap.CompressFormat.JPEG, 55, baos);
                    cropped.recycle();
                    latestJpeg = baos.toByteArray();
                } catch (Throwable ignored) {
                } finally {
                    if (image != null) {
                        try { image.close(); } catch (Throwable ignored) {}
                    }
                }
            }
        }, mainHandler);

        virtualDisplay = mediaProjection.createVirtualDisplay(
                "UssdCastProjection",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                null,
                mainHandler
        );
    }

    private void runHttpServer() {
        try {
            serverSocket = new ServerSocket(PORT, 16, InetAddress.getByName("127.0.0.1"));
            while (running) {
                Socket client = serverSocket.accept();
                final Socket sock = client;
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        handleClient(sock);
                    }
                }).start();
            }
        } catch (Throwable ignored) {
        }
    }

    private void handleClient(Socket client) {
        try (Socket s = client;
             BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream()));
             OutputStream out = s.getOutputStream()) {

            String reqLine = in.readLine();
            if (reqLine == null) return;
            String[] parts = reqLine.split(" ");
            String method = parts.length > 0 ? parts[0] : "GET";
            String path = parts.length > 1 ? parts[1] : "/";

            if ("OPTIONS".equalsIgnoreCase(method)) {
                writeText(out, 200, "text/plain", "");
                return;
            }

            AccessibilityControlService a11y = AccessibilityControlService.getInstance();

            if (path.startsWith("/ping")) {
                String json = "{\"ok\":true,\"projection\":" + (mediaProjection != null)
                        + ",\"accessibility\":" + (a11y != null) + "}";
                writeText(out, 200, "application/json", json);
            } else if (path.startsWith("/frame.jpg")) {
                byte[] jpeg = latestJpeg;
                if (jpeg != null && jpeg.length > 0) {
                    writeBytes(out, 200, "image/jpeg", jpeg);
                } else {
                    writeText(out, 503, "text/plain", "Waiting for frame");
                }
            } else if (path.startsWith("/tap")) {
                float xp = parseFloatParam(path, "xp", 50f);
                float yp = parseFloatParam(path, "yp", 50f);
                boolean ok = a11y != null && a11y.tapPercent(xp, yp);
                writeText(out, 200, "application/json", "{\"ok\":" + ok + "}");
            } else if (path.startsWith("/scroll")) {
                int dy = (int) parseFloatParam(path, "dy", 240f);
                boolean ok = a11y != null && a11y.scrollVertical(dy);
                writeText(out, 200, "application/json", "{\"ok\":" + ok + "}");
            } else if (path.startsWith("/back")) {
                boolean ok = a11y != null && a11y.performBack();
                writeText(out, 200, "application/json", "{\"ok\":" + ok + "}");
            } else if (path.startsWith("/home")) {
                boolean ok = a11y != null && a11y.performHome();
                if (!ok) {
                    Intent home = new Intent(Intent.ACTION_MAIN);
                    home.addCategory(Intent.CATEGORY_HOME);
                    home.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(home);
                }
                writeText(out, 200, "application/json", "{\"ok\":true}");
            } else if (path.startsWith("/ussd")) {
                String code = extractQueryParam(path, "code");
                String result = executeUssdBlocking(code);
                writeText(out, 200, "text/plain", result);
            } else {
                writeText(out, 404, "text/plain", "Not found");
            }
        } catch (Throwable ignored) {
        }
    }

    private float parseFloatParam(String path, String key, float fallback) {
        try {
            String raw = extractQueryParam(path, key);
            if (!raw.isEmpty()) return Float.parseFloat(raw);
        } catch (Throwable ignored) {}
        return fallback;
    }

    private String executeUssdBlocking(String code) {
        if (code == null || code.trim().isEmpty()) return "Empty USSD code";
        TelephonyManager tm = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
        if (tm == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return "USSD API requires Android 8+";
        }
        final String[] responseHolder = new String[]{"USSD request sent"};
        final CountDownLatch latch = new CountDownLatch(1);
        try {
            tm.sendUssdRequest(code, new TelephonyManager.UssdResponseCallback() {
                @Override
                public void onReceiveUssdResponse(TelephonyManager telephonyManager, String request, CharSequence response) {
                    responseHolder[0] = response != null ? response.toString() : "OK";
                    latch.countDown();
                }

                @Override
                public void onReceiveUssdResponseFailed(TelephonyManager telephonyManager, String request, int failureCode) {
                    responseHolder[0] = "USSD failed (code " + failureCode + ")";
                    latch.countDown();
                }
            }, mainHandler);
            latch.await(12, TimeUnit.SECONDS);
        } catch (SecurityException se) {
            return "CALL_PHONE permission not granted";
        } catch (Throwable t) {
            return "Error: " + t.getMessage();
        }
        return responseHolder[0];
    }

    private String extractQueryParam(String path, String key) {
        try {
            int q = path.indexOf('?');
            if (q < 0) return "";
            String query = path.substring(q + 1);
            for (String pair : query.split("&")) {
                int eq = pair.indexOf('=');
                if (eq > 0 && pair.substring(0, eq).equals(key)) {
                    return URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
                }
            }
        } catch (Throwable ignored) {}
        return "";
    }

    private void writeText(OutputStream out, int code, String mime, String body) throws Exception {
        writeBytes(out, code, mime + "; charset=utf-8", body.getBytes(StandardCharsets.UTF_8));
    }

    private void writeBytes(OutputStream out, int code, String mime, byte[] data) throws Exception {
        String headers = "HTTP/1.1 " + code + " OK\r\n"
                + "Content-Type: " + mime + "\r\n"
                + "Content-Length: " + data.length + "\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Access-Control-Allow-Private-Network: true\r\n"
                + "Access-Control-Allow-Headers: *\r\n"
                + "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
        out.write(headers.getBytes(StandardCharsets.US_ASCII));
        out.write(data);
        out.flush();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "UssdCast Screen Bridge",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification() {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b.setOnlyAlertOnce(true);
        }
        return b.setContentTitle("UssdCast Bridge")
                .setContentText("Running quietly in background")
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setOngoing(true)
                .build();
    }

    @Override
    public void onDestroy() {
        running = false;
        projectionActive = false;
        try { if (serverSocket != null) serverSocket.close(); } catch (Throwable ignored) {}
        try { if (virtualDisplay != null) virtualDisplay.release(); } catch (Throwable ignored) {}
        try { if (imageReader != null) imageReader.close(); } catch (Throwable ignored) {}
        try { if (mediaProjection != null) mediaProjection.stop(); } catch (Throwable ignored) {}
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

class AccessibilityControlService extends AccessibilityService {
    private static volatile AccessibilityControlService instance;

    public static AccessibilityControlService getInstance() {
        return instance;
    }

    public static boolean isRunning() {
        return instance != null;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.onDestroy();
    }

    private int[] getScreenDimensions() {
        WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (wm != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    Rect bounds = wm.getCurrentWindowMetrics().getBounds();
                    if (bounds.width() > 0 && bounds.height() > 0) {
                        return new int[]{bounds.width(), bounds.height()};
                    }
                } catch (Throwable t) {
                    DisplayMetrics dm = new DisplayMetrics();
                    wm.getDefaultDisplay().getRealMetrics(dm);
                    if (dm.widthPixels > 0 && dm.heightPixels > 0) {
                        return new int[]{dm.widthPixels, dm.heightPixels};
                    }
                }
            } else {
                DisplayMetrics dm = new DisplayMetrics();
                wm.getDefaultDisplay().getRealMetrics(dm);
                if (dm.widthPixels > 0 && dm.heightPixels > 0) {
                    return new int[]{dm.widthPixels, dm.heightPixels};
                }
            }
        }
        return new int[]{1080, 2400};
    }

    public boolean tapPercent(float xPct, float yPct) {
        int[] dims = getScreenDimensions();
        float clampedX = Math.max(1f, Math.min(dims[0] - 1f, (xPct / 100f) * dims[0]));
        float clampedY = Math.max(1f, Math.min(dims[1] - 1f, (yPct / 100f) * dims[1]));

        Path path = new Path();
        path.moveTo(clampedX, clampedY);
        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(path, 0, 65);
        GestureDescription gesture = new GestureDescription.Builder()
                .addStroke(stroke)
                .build();
        return dispatchGesture(gesture, null, null);
    }

    public boolean scrollVertical(int deltaY) {
        int[] dims = getScreenDimensions();
        float centerX = dims[0] * 0.5f;
        float startY = deltaY >= 0 ? dims[1] * 0.65f : dims[1] * 0.35f;
        float endY = deltaY >= 0 ? dims[1] * 0.35f : dims[1] * 0.65f;

        Path path = new Path();
        path.moveTo(centerX, startY);
        path.lineTo(centerX, endY);
        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(path, 0, 240);
        GestureDescription gesture = new GestureDescription.Builder()
        .addStroke(stroke)
                .build();
        return dispatchGesture(gesture, null, null);
    }

    public boolean performBack() {
        return performGlobalAction(GLOBAL_ACTION_BACK);
    }

    public boolean performHome() {
        return performGlobalAction(GLOBAL_ACTION_HOME);
    }
}
