package com.ussdcast.bridge;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
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
        a11yBtn.setOnClickListener(v -> showAccessibilityDisclosure());

        Button restrictedBtn = new Button(this);
        restrictedBtn.setText("App Info (Allow restricted settings)");
        restrictedBtn.setOnClickListener(v -> openAppInfoSettings());

        Button startBtn = new Button(this);
        startBtn.setText("2. Start MediaProjection (Background)");
        startBtn.setOnClickListener(v -> {
            autoFlowArmed = true;
            requestPermissionsAndProjection();
        });

        Button openWebBtn = new Button(this);
        openWebBtn.setText("3. Open Web PWA (Sender)");
        openWebBtn.setOnClickListener(v -> openSenderPwa());

        Button stopBtn = new Button(this);
        stopBtn.setText("Stop Bridge");
        stopBtn.setOnClickListener(v -> {
            autoFlowArmed = false;
            projectionPromptedOnce = false;
            stopService(new Intent(this, BridgeService.class));
            refreshStatus();
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
        // Auto-continue to MediaProjection as soon as Accessibility turns ON
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
                .setMessage("UssdCast Bridge uses Android AccessibilityService only when you start a session, to perform remote tap, scroll, Back, and Home actions you authorize from your Controller across Dialer, USSD, and Home screens. If disabled on Android 13+, tap 'App Info -> ⋮ -> Allow restricted settings' first.")
                .setPositiveButton("Open Accessibility", (dialog, which) -> {
                    autoFlowArmed = true;
                    startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
                })
                .setNeutralButton("Allow Restricted (App Info)", (dialog, which) -> {
                    autoFlowArmed = true;
                    openAppInfoSettings();
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
            autoFlowArmed = false;
            refreshStatus();
            // Sit quietly in background without covering or disturbing the phone user
            moveTaskToBack(true);
            if (launchedFromWeb) {
                finish();
            }
        } else if (requestCode == REQ_MEDIA_PROJECTION) {
            projectionPromptedOnce = false;
        }
    }
}
