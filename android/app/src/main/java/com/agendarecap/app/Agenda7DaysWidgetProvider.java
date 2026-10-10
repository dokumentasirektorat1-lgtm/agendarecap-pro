package com.agendarecap.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Agenda7DaysWidgetProvider
 * Displays agendas for today (or offset day up to +7) on the Android home screen.
 * Supports date navigation via ACTION_PREV_DAY and ACTION_NEXT_DAY.
 * Data stored under each date-key in SharedPreferences, populated from NativeAlarmPlugin.
 */
public class Agenda7DaysWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_NAME = "agendarecap_agenda7_widget_prefs";
    private static final String KEY_OFFSET = "agenda7_day_offset";
    private static final String KEY_DATA_PREFIX = "agenda7_data_";
    private static final String KEY_ALL_DATA = "agenda7_all_items_json";

    public static final String ACTION_PREV_DAY = "com.agendarecap.app.AGENDA7_PREV_DAY";
    public static final String ACTION_NEXT_DAY = "com.agendarecap.app.AGENDA7_NEXT_DAY";

    public static void saveAgendaData(Context context, String json) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_ALL_DATA, json).putInt(KEY_OFFSET, 0).apply();
    }

    public static String getAgendaData(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_ALL_DATA, "[]");
    }

    private static int getCurrentOffset(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getInt(KEY_OFFSET, 0);
    }

    private static void setOffset(Context context, int offset) {
        // Clamp offset between 0 and 6 (today + next 6 days)
        int clamped = Math.max(0, Math.min(6, offset));
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putInt(KEY_OFFSET, clamped).apply();
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_PREV_DAY.equals(action)) {
            int curr = getCurrentOffset(context);
            setOffset(context, curr - 1);
            updateAllWidgets(context);
        } else if (ACTION_NEXT_DAY.equals(action)) {
            int curr = getCurrentOffset(context);
            setOffset(context, curr + 1);
            updateAllWidgets(context);
        } else {
            super.onReceive(context, intent);
        }
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
        int offset = getCurrentOffset(context);

        // Dynamic app branding
        String appName = NativeAlarmPlugin.getSavedAppName(context);
        views.setTextViewText(R.id.agenda7_widget_label, appName.toUpperCase());

        // Tap on widget → open main app
        Intent mainIntent = new Intent(context, MainActivity.class);
        PendingIntent mainPendingIntent = PendingIntent.getActivity(
                context, 0, mainIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.agenda7_widget_container, mainPendingIntent);

        // Prev day intent
        Intent prevIntent = new Intent(context, Agenda7DaysWidgetProvider.class);
        prevIntent.setAction(ACTION_PREV_DAY);
        PendingIntent prevPendingIntent = PendingIntent.getBroadcast(
                context, appWidgetId * 10 + 1, prevIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.agenda7_btn_prev, prevPendingIntent);

        // Next day intent
        Intent nextIntent = new Intent(context, Agenda7DaysWidgetProvider.class);
        nextIntent.setAction(ACTION_NEXT_DAY);
        PendingIntent nextPendingIntent = PendingIntent.getBroadcast(
                context, appWidgetId * 10 + 2, nextIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.agenda7_btn_next, nextPendingIntent);

        // Compute display date
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.DAY_OF_YEAR, offset);
        String dateKey = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(cal.getTime());

        String dateLabel;
        if (offset == 0) {
            dateLabel = "Hari ini";
        } else if (offset == 1) {
            dateLabel = "Besok";
        } else {
            dateLabel = new SimpleDateFormat("EEE, d MMM", new Locale("id")).format(cal.getTime());
        }
        views.setTextViewText(R.id.agenda7_date_label, dateLabel);

        // Disable prev button at offset=0
        // (We can't actually disable alpha in RemoteViews easily, just allow click but clamp)
        try {
            String jsonStr = getAgendaData(context);
            JSONArray allItems = new JSONArray(jsonStr);

            // Filter items matching the current date key
            JSONArray filtered = new JSONArray();
            for (int i = 0; i < allItems.length(); i++) {
                JSONObject item = allItems.getJSONObject(i);
                String itemDate = item.optString("date", "");
                if (dateKey.equals(itemDate)) {
                    filtered.put(item);
                }
            }

            if (filtered.length() == 0) {
                views.setViewVisibility(R.id.agenda7_empty_text, View.VISIBLE);
                views.setViewVisibility(R.id.agenda7_item1_container, View.GONE);
                views.setViewVisibility(R.id.agenda7_item2_container, View.GONE);
                views.setViewVisibility(R.id.agenda7_item3_container, View.GONE);
            } else {
                views.setViewVisibility(R.id.agenda7_empty_text, View.GONE);

                // Item 1
                JSONObject item1 = filtered.getJSONObject(0);
                views.setTextViewText(R.id.agenda7_item1_time, item1.optString("time", "--:--"));
                views.setTextViewText(R.id.agenda7_item1_title, item1.optString("title", "Agenda"));
                views.setViewVisibility(R.id.agenda7_item1_container, View.VISIBLE);

                // Item 2
                if (filtered.length() >= 2) {
                    JSONObject item2 = filtered.getJSONObject(1);
                    views.setTextViewText(R.id.agenda7_item2_time, item2.optString("time", "--:--"));
                    views.setTextViewText(R.id.agenda7_item2_title, item2.optString("title", "Agenda"));
                    views.setViewVisibility(R.id.agenda7_item2_container, View.VISIBLE);
                } else {
                    views.setViewVisibility(R.id.agenda7_item2_container, View.GONE);
                }

                // Item 3
                if (filtered.length() >= 3) {
                    JSONObject item3 = filtered.getJSONObject(2);
                    views.setTextViewText(R.id.agenda7_item3_time, item3.optString("time", "--:--"));
                    views.setTextViewText(R.id.agenda7_item3_title, item3.optString("title", "Agenda"));
                    views.setViewVisibility(R.id.agenda7_item3_container, View.VISIBLE);
                } else {
                    views.setViewVisibility(R.id.agenda7_item3_container, View.GONE);
                }
            }
        } catch (Exception e) {
            views.setViewVisibility(R.id.agenda7_empty_text, View.VISIBLE);
            views.setViewVisibility(R.id.agenda7_item1_container, View.GONE);
            views.setViewVisibility(R.id.agenda7_item2_container, View.GONE);
            views.setViewVisibility(R.id.agenda7_item3_container, View.GONE);
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
