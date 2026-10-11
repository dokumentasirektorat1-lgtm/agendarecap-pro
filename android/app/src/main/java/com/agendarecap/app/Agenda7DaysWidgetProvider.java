package com.agendarecap.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * Agenda7DaysWidgetProvider
 * Displays a cumulative list of agendas from today through the next 7 days
 * on the Android home screen. Shows up to 5 items sorted chronologically.
 * Data stored as flat array in SharedPreferences, populated from NativeAlarmPlugin.
 */
public class Agenda7DaysWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_NAME = "agendarecap_agenda7_widget_prefs";
    private static final String KEY_ALL_DATA = "agenda7_all_items_json";

    // Keep these action strings for backwards-compat even though buttons are removed
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

        // Tap on widget → open main app
        Intent mainIntent = new Intent(context, MainActivity.class);
        PendingIntent mainPendingIntent = PendingIntent.getActivity(
                context, 0, mainIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.agenda7_widget_container, mainPendingIntent);

        // Compute today and +7 day window
        Calendar today = Calendar.getInstance();
        Calendar endDay = Calendar.getInstance();
        endDay.add(Calendar.DAY_OF_YEAR, 7);

        SimpleDateFormat keyFmt = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault());
        String todayKey = keyFmt.format(today.getTime());
        String endKey = keyFmt.format(endDay.getTime());

        // Collect all items within the next 7 days, sorted by date+time
        int[] containerIds = {
            R.id.agenda7_item1_container, R.id.agenda7_item2_container,
            R.id.agenda7_item3_container, R.id.agenda7_item4_container,
            R.id.agenda7_item5_container
        };
        int[] dateIds = {
            R.id.agenda7_item1_date, R.id.agenda7_item2_date,
            R.id.agenda7_item3_date, R.id.agenda7_item4_date,
            R.id.agenda7_item5_date
        };
        int[] timeIds = {
            R.id.agenda7_item1_time, R.id.agenda7_item2_time,
            R.id.agenda7_item3_time, R.id.agenda7_item4_time,
            R.id.agenda7_item5_time
        };
        int[] titleIds = {
            R.id.agenda7_item1_title, R.id.agenda7_item2_title,
            R.id.agenda7_item3_title, R.id.agenda7_item4_title,
            R.id.agenda7_item5_title
        };

        // Hide all slots initially
        for (int cid : containerIds) {
            views.setViewVisibility(cid, View.GONE);
        }
        views.setViewVisibility(R.id.agenda7_empty_text, View.GONE);
        views.setViewVisibility(R.id.agenda7_more_text, View.GONE);

        try {
            String jsonStr = getAgendaData(context);
            JSONArray allItems = new JSONArray(jsonStr);

            // Filter to today..+7 days window
            JSONArray filtered = new JSONArray();
            for (int i = 0; i < allItems.length(); i++) {
                JSONObject item = allItems.getJSONObject(i);
                String itemDate = item.optString("date", "");
                // Include if date is >= today and <= endDay
                if (itemDate.compareTo(todayKey) >= 0 && itemDate.compareTo(endKey) <= 0) {
                    filtered.put(item);
                }
            }

            int total = filtered.length();

            if (total == 0) {
                views.setViewVisibility(R.id.agenda7_empty_text, View.VISIBLE);
            } else {
                int displayCount = Math.min(total, 5);
                SimpleDateFormat labelFmt = new SimpleDateFormat("d/M", Locale.getDefault());

                for (int i = 0; i < displayCount; i++) {
                    JSONObject item = filtered.getJSONObject(i);
                    String itemDate = item.optString("date", "");
                    String time = item.optString("time", "--:--");
                    String title = item.optString("title", "Agenda");

                    // Human-readable date label
                    String dateLabel;
                    if (todayKey.equals(itemDate)) {
                        dateLabel = "Hari\nini";
                    } else {
                        // Format as "d/M"
                        try {
                            java.util.Date d = keyFmt.parse(itemDate);
                            dateLabel = d != null ? labelFmt.format(d) : itemDate.substring(5);
                        } catch (Exception ex) {
                            dateLabel = itemDate.length() >= 10 ? itemDate.substring(5) : itemDate;
                        }
                    }

                    views.setTextViewText(dateIds[i], dateLabel);
                    views.setTextViewText(timeIds[i], time);
                    views.setTextViewText(titleIds[i], title);
                    views.setViewVisibility(containerIds[i], View.VISIBLE);
                }

                if (total > 5) {
                    views.setViewVisibility(R.id.agenda7_more_text, View.VISIBLE);
                    views.setTextViewText(R.id.agenda7_more_text, "+" + (total - 5) + " agenda lainnya");
                }
            }
        } catch (Exception e) {
            views.setViewVisibility(R.id.agenda7_empty_text, View.VISIBLE);
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
