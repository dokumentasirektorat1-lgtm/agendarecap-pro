package com.agendarecap.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * Agenda7DaysWidgetProvider
 * Displays a scrollable list of agendas from today through the next 7 days
 * using a ListView backed by Agenda7DaysWidgetService (RemoteViewsService).
 * Data stored as flat array in SharedPreferences, populated from NativeAlarmPlugin.
 */
public class Agenda7DaysWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_NAME = "agendarecap_agenda7_widget_prefs";
    private static final String KEY_ALL_DATA = "agenda7_all_items_json";

    // Keep for backwards-compat
    public static final String ACTION_PREV_DAY = "com.agendarecap.app.AGENDA7_PREV_DAY";
    public static final String ACTION_NEXT_DAY = "com.agendarecap.app.AGENDA7_NEXT_DAY";

    public static void saveAgendaData(Context context, String json) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_ALL_DATA, json).apply();
    }

    public static String getAgendaData(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_ALL_DATA, "[]");
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, id);
        }
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName componentName = new ComponentName(context, Agenda7DaysWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(componentName);
        for (int id : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, id);
        }
    }

    private static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.agenda_7days_widget);

        // Dynamic app branding
        String appName = NativeAlarmPlugin.getSavedAppName(context);
        views.setTextViewText(R.id.agenda7_widget_label, appName.toUpperCase());

        // Tap on widget header → open main app
        Intent mainIntent = new Intent(context, MainActivity.class);
        PendingIntent mainPendingIntent = PendingIntent.getActivity(
                context, 0, mainIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.agenda7_widget_container, mainPendingIntent);

        // ---- Check if there are any items to show ----
        boolean hasItems = false;
        try {
            String jsonStr = getAgendaData(context);
            JSONArray allItems = new JSONArray(jsonStr);

            Calendar today = Calendar.getInstance();
            Calendar endDay = Calendar.getInstance();
            endDay.add(Calendar.DAY_OF_YEAR, 8);

            SimpleDateFormat keyFmt = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault());
            String todayKey = keyFmt.format(today.getTime());
            String endKey = keyFmt.format(endDay.getTime());

            for (int i = 0; i < allItems.length(); i++) {
                JSONObject item = allItems.getJSONObject(i);
                String itemDate = item.optString("date", "");
                if (itemDate.compareTo(todayKey) >= 0 && itemDate.compareTo(endKey) <= 0) {
                    hasItems = true;
                    break;
                }
            }
        } catch (Exception ignored) {}

        if (hasItems) {
            // ---- Set up RemoteAdapter for scrollable ListView ----
            // Use unique URI per widget ID so each widget gets its own data set
            Intent serviceIntent = new Intent(context, Agenda7DaysWidgetService.class);
            serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            serviceIntent.setData(Uri.fromParts("content", String.valueOf(appWidgetId), null));

            views.setRemoteAdapter(R.id.agenda7_list_view, serviceIntent);

            // Pending intent template for item taps → open main app
            Intent itemClickIntent = new Intent(context, MainActivity.class);
            PendingIntent itemPendingIntent = PendingIntent.getActivity(
                    context, 1, itemClickIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setPendingIntentTemplate(R.id.agenda7_list_view, itemPendingIntent);

            views.setViewVisibility(R.id.agenda7_list_view, View.VISIBLE);
            views.setViewVisibility(R.id.agenda7_empty_text, View.GONE);

            // Notify that data changed so the factory refreshes
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.agenda7_list_view);
        } else {
            views.setViewVisibility(R.id.agenda7_list_view, View.GONE);
            views.setViewVisibility(R.id.agenda7_empty_text, View.VISIBLE);
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
