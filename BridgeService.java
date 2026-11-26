package com.ussdcast.bridge;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.telephony.TelephonyManager;
import android.util.DisplayMetrics;
import android.view.WindowManager;

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

public class BridgeService extends Service {
    private static final String CHANNEL_ID = "ussdcast_bridge_channel";
    private static final int PORT = 8765;

    private volatile boolean running = false;
    private volatile byte[] latestJpeg = null;
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(101, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
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
            new Thread(this::runHttpServer, "BridgeHttpThread").start();
        }
        return START_STICKY;
    }

    private void startProjection(int resultCode, Intent data) {
        MediaProjectionManager mgr = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (mgr == null) return;
        mediaProjection = mgr.getMediaProjection(resultCode, data);
        if (mediaProjection == null) return;

        // Required on Android 14-16 (API 34+) before createVirtualDisplay
        mediaProjection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                stopSelf();
            }
        }, mainHandler);

        DisplayMetrics dm = new DisplayMetrics();
        WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (wm != null) {
            wm.getDefaultDisplay().getRealMetrics(dm);
        }
        int width = Math.max(360, dm.widthPixels > 0 ? dm.widthPixels / 2 : 540);
        int height = Math.max(640, dm.heightPixels > 0 ? dm.heightPixels / 2 : 960);
        int density = dm.densityDpi > 0 ? dm.densityDpi : 320;

        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        imageReader.setOnImageAvailableListener(reader -> {
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
                new Thread(() -> handleClient(client)).start();
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

            if (path.startsWith("/ping")) {
                writeText(out, 200, "application/json", "{\"ok\":true}");
            } else if (path.startsWith("/frame.jpg")) {
                byte[] jpeg = latestJpeg;
                if (jpeg != null && jpeg.length > 0) {
                    writeBytes(out, 200, "image/jpeg", jpeg);
                } else {
                    writeText(out, 503, "text/plain", "Waiting for frame");
                }
            } else if (path.startsWith("/home")) {
                Intent home = new Intent(Intent.ACTION_MAIN);
                home.addCategory(Intent.CATEGORY_HOME);
                home.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(home);
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
        return b.setContentTitle("UssdCast Bridge Active")
                .setContentText("MediaProjection & USSD listening on 127.0.0.1:8765")
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setOngoing(true)
                .build();
    }

    @Override
    public void onDestroy() {
        running = false;
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
