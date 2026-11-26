package com.ussdcast.bridge;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final int REQ_MEDIA_PROJECTION = 1001;
    private static final int REQ_PERMISSIONS = 1002;
    private static final String DEFAULT_PWA_URL = "https://nativeappderieburayu.vercel.app/#mode=sender&room=";

    private TextView statusText;
    private EditText roomInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(48, 48, 48, 48);

        statusText = new TextView(this);
        statusText.setText("UssdCast Web + MediaProjection Bridge\nAndroid 8-16 | Port 127.0.0.1:8765");
        statusText.setTextSize(15f);
        statusText.setPadding(0, 0, 0, 24);

        roomInput = new EditText(this);
        roomInput.setHint("Room ID (e.g. demo1234)");
        roomInput.setText("demo1234");
        roomInput.setSingleLine(true);

        Button startBtn = new Button(this);
        startBtn.setText("1. Start MediaProjection & USSD Bridge");
        startBtn.setOnClickListener(v -> requestPermissionsAndProjection());

        Button openWebBtn = new Button(this);
        openWebBtn.setText("2. Open Web PWA (Sender)");
        openWebBtn.setOnClickListener(v -> openSenderPwa());

        Button stopBtn = new Button(this);
        stopBtn.setText("Stop Bridge");
        stopBtn.setOnClickListener(v -> {
            stopService(new Intent(this, BridgeService.class));
            statusText.setText("Bridge Stopped");
        });

        layout.addView(statusText);
        layout.addView(roomInput);
        layout.addView(startBtn);
        layout.addView(openWebBtn);
        layout.addView(stopBtn);
        setContentView(layout);
        applyDeepLinkRoom(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyDeepLinkRoom(intent);
    }

    private void applyDeepLinkRoom(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data != null && roomInput != null) {
            String room = data.getQueryParameter("room");
            if (room != null && !room.trim().isEmpty()) {
                roomInput.setText(room.trim());
            }
        }
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
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED;

        if (needCall || needNotif) {
            if (Build.VERSION.SDK_INT >= 33) {
                requestPermissions(new String[]{
                        Manifest.permission.CALL_PHONE,
                        Manifest.permission.POST_NOTIFICATIONS
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
            statusText.setText("Bridge Live on http://127.0.0.1:8765\nOpening Web PWA...");
            openSenderPwa();
        }
    }
}
