package com.agendarecap.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/**
 * WidgetRefreshWorker
 *
 * A WorkManager periodic worker that refreshes all home-screen widgets
 * in the background — without requiring the app to be open.
 *
 * Schedule: every 15 minutes (Android minimum for PeriodicWork).
 * On each run it calls updateAllWidgets() on both widget providers,
 * which re-reads SharedPreferences data and notifies RemoteViews adapters.
 *
 * Data is written to SharedPreferences by the JS layer via NativeAlarmPlugin
 * whenever the web app syncs. The worker just ensures the widget display
 * stays in sync with whatever is currently stored.
 */
public class WidgetRefreshWorker extends Worker {

    private static final String TAG = "[AgendaRecap][WidgetRefresh]";
    public static final String WORK_NAME = "agendarecap_widget_refresh";

    public WidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        try {
            Log.d(TAG, "WidgetRefreshWorker: refreshing all widgets");

            // Check if either widget is actually placed on the home screen before doing work
            AppWidgetManager awm = AppWidgetManager.getInstance(context);

            int[] consultIds = awm.getAppWidgetIds(
                    new ComponentName(context, ConsultationWidgetProvider.class));
            if (consultIds != null && consultIds.length > 0) {
                ConsultationWidgetProvider.updateAllWidgets(context);
                Log.d(TAG, "Refreshed ConsultationWidget (" + consultIds.length + " instances)");
            }

            int[] agenda7Ids = awm.getAppWidgetIds(
                    new ComponentName(context, Agenda7DaysWidgetProvider.class));
            if (agenda7Ids != null && agenda7Ids.length > 0) {
                Agenda7DaysWidgetProvider.updateAllWidgets(context);
                Log.d(TAG, "Refreshed Agenda7DaysWidget (" + agenda7Ids.length + " instances)");
            }

            return Result.success();
        } catch (Exception e) {
            Log.e(TAG, "WidgetRefreshWorker failed: " + e.getMessage(), e);
            return Result.retry();
        }
    }

    /**
     * Schedule the periodic widget refresh job.
     * Safe to call multiple times — KEEP policy preserves the existing job
     * if one is already running (avoids duplicate scheduling on every app open).
     *
     * Call this once from MainActivity.onCreate().
     */
    public static void schedule(Context context) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                WidgetRefreshWorker.class,
                15, TimeUnit.MINUTES   // Android minimum interval for periodic work
        ).build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,  // Don't reset if already scheduled
                request
        );
        Log.d(TAG, "WidgetRefreshWorker scheduled (15-minute interval)");
    }

    /**
     * Cancel the periodic refresh job.
     * Useful if you want to stop background updates (e.g., on logout).
     */
    public static void cancel(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME);
        Log.d(TAG, "WidgetRefreshWorker cancelled");
    }
}

