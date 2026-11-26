package com.ussdcast.bridge;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;

public class AccessibilityControlService extends AccessibilityService {
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
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Only performs explicit user-triggered gestures from the active session.
    }

    @Override
    public void onInterrupt() {
        // No-op
    }

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
                Rect bounds = wm.getCurrentWindowMetrics().getBounds();
                if (bounds.width() > 0 && bounds.height() > 0) {
                    return new int[]{bounds.width(), bounds.height()};
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
