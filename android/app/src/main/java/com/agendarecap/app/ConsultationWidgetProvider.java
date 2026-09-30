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
 * Data is fed by NativeAlarmPlugin.updateConsultationWidgetData() via AgendaWidgetStorage.
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

        // Tap on widget → open /consultation page in app
        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra("target_route", "consultation");
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.consultation_widget_container, pendingIntent);

        try {
            String jsonStr = getConsultationData(context);
            JSONArray array = new JSONArray(jsonStr);
            int count = array.length();

            views.setTextViewText(R.id.consultation_count_badge, String.valueOf(count));

            if (count == 0) {
                views.setViewVisibility(R.id.consultation_item1_container, View.GONE);
                views.setViewVisibility(R.id.consultation_item2_container, View.GONE);
                views.setViewVisibility(R.id.consultation_empty_text, View.VISIBLE);
            } else {
                views.setViewVisibility(R.id.consultation_empty_text, View.GONE);

                // Item 1
                if (count >= 1) {
                    JSONObject item = array.getJSONObject(0);
                    views.setTextViewText(R.id.consultation_item1_title, item.optString("title", "Konsultasi"));
                    views.setViewVisibility(R.id.consultation_item1_container, View.VISIBLE);
                }

                // Item 2
                if (count >= 2) {
                    JSONObject item = array.getJSONObject(1);
                    views.setTextViewText(R.id.consultation_item2_title, item.optString("title", "Konsultasi"));
                    views.setViewVisibility(R.id.consultation_item2_container, View.VISIBLE);
                } else {
                    views.setViewVisibility(R.id.consultation_item2_container, View.GONE);
                }
            }

        } catch (Exception e) {
            views.setTextViewText(R.id.consultation_count_badge, "0");
            views.setViewVisibility(R.id.consultation_empty_text, View.VISIBLE);
            views.setViewVisibility(R.id.consultation_item1_container, View.GONE);
            views.setViewVisibility(R.id.consultation_item2_container, View.GONE);
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
