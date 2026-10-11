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

/**
 * ConsultationWidgetProvider
 * Displays the list of active consultation items on the Android home screen.
 * Each item shows agenda title + consultation notes (if available).
 * Provides a "+ Catatan" button to open the consultation page for adding notes.
 * Data is fed by NativeAlarmPlugin.updateConsultationWidgetData().
 */
public class ConsultationWidgetProvider extends AppWidgetProvider {

    private static final String CONSULTATION_PREFS = "agendarecap_consultation_widget_prefs";
    private static final String KEY_CONSULTATION_JSON = "consultation_items_json";

    public static void saveConsultationData(Context context, String json) {
        context.getSharedPreferences(CONSULTATION_PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_CONSULTATION_JSON, json).apply();
    }

    public static String getConsultationData(Context context) {
        return context.getSharedPreferences(CONSULTATION_PREFS, Context.MODE_PRIVATE)
            .getString(KEY_CONSULTATION_JSON, "[]");
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName componentName = new ComponentName(context, ConsultationWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(componentName);
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    private static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.consultation_widget);

        // Dynamic app branding
        String appName = NativeAlarmPlugin.getSavedAppName(context);
        views.setTextViewText(R.id.consultation_widget_title, appName.toUpperCase());

        // Tap on widget body → open consultation page
        Intent consultIntent = new Intent(context, MainActivity.class);
        consultIntent.putExtra("target_route", "consultation");
        PendingIntent consultPendingIntent = PendingIntent.getActivity(
                context,
                0,
                consultIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.consultation_widget_container, consultPendingIntent);

        // "+ Catatan" button → open consultation page for adding notes
        Intent addNoteIntent = new Intent(context, MainActivity.class);
        addNoteIntent.putExtra("target_route", "consultation");
        addNoteIntent.putExtra("action", "add_note");
        PendingIntent addNotePendingIntent = PendingIntent.getActivity(
                context,
                appWidgetId + 100,
                addNoteIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.consultation_btn_add_note, addNotePendingIntent);

        // Item container/title/notes IDs
        int[] containerIds = {
            R.id.consultation_item1_container,
            R.id.consultation_item2_container,
            R.id.consultation_item3_container
        };
        int[] titleIds = {
            R.id.consultation_item1_title,
            R.id.consultation_item2_title,
            R.id.consultation_item3_title
        };
        int[] notesIds = {
            R.id.consultation_item1_notes,
            R.id.consultation_item2_notes,
            R.id.consultation_item3_notes
        };

        // Hide all item slots initially
        for (int cid : containerIds) {
            views.setViewVisibility(cid, View.GONE);
        }
        views.setViewVisibility(R.id.consultation_empty_text, View.GONE);

        try {
            String jsonStr = getConsultationData(context);
            JSONArray array = new JSONArray(jsonStr);
            int count = array.length();

            views.setTextViewText(R.id.consultation_count_badge, String.valueOf(count));

            if (count == 0) {
                views.setViewVisibility(R.id.consultation_empty_text, View.VISIBLE);
            } else {
                int displayCount = Math.min(count, 3);
                for (int i = 0; i < displayCount; i++) {
                    JSONObject item = array.getJSONObject(i);
                    String title = item.optString("title", "Konsultasi");
                    String notes = item.optString("notes", "").trim();

                    views.setTextViewText(titleIds[i], title);
                    views.setViewVisibility(containerIds[i], View.VISIBLE);

                    // Show notes sub-row only if notes is non-empty
                    if (!notes.isEmpty()) {
                        views.setTextViewText(notesIds[i], notes);
                        views.setViewVisibility(notesIds[i], View.VISIBLE);
                    } else {
                        views.setViewVisibility(notesIds[i], View.GONE);
                    }
                }
            }

        } catch (Exception e) {
            views.setTextViewText(R.id.consultation_count_badge, "0");
            views.setViewVisibility(R.id.consultation_empty_text, View.VISIBLE);
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
