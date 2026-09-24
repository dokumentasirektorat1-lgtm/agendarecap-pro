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

public class AgendaWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName componentName = new ComponentName(context, AgendaWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(componentName);
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    private static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.agenda_widget);

        // Intent to launch MainActivity on tap
        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_container, pendingIntent);

        try {
            String jsonStr = AgendaWidgetStorage.getWidgetData(context);
            JSONArray array = new JSONArray(jsonStr);

            if (array.length() == 0) {
                views.setTextViewText(R.id.widget_item1_time, "--:--");
                views.setTextViewText(R.id.widget_item1_title, "Tidak ada agenda terdekat");
                views.setViewVisibility(R.id.widget_item2_container, View.GONE);
                views.setViewVisibility(R.id.widget_item3_container, View.GONE);
            } else {
                // Item 1
                if (array.length() >= 1) {
                    JSONObject item1 = array.getJSONObject(0);
                    views.setTextViewText(R.id.widget_item1_time, item1.optString("time", "08:00"));
                    views.setTextViewText(R.id.widget_item1_title, item1.optString("title", "Agenda"));
                    views.setViewVisibility(R.id.widget_item1_container, View.VISIBLE);
                }

                // Item 2
                if (array.length() >= 2) {
                    JSONObject item2 = array.getJSONObject(1);
                    views.setTextViewText(R.id.widget_item2_time, item2.optString("time", "10:00"));
                    views.setTextViewText(R.id.widget_item2_title, item2.optString("title", "Agenda"));
                    views.setViewVisibility(R.id.widget_item2_container, View.VISIBLE);
                } else {
                    views.setViewVisibility(R.id.widget_item2_container, View.GONE);
                }

                // Item 3
                if (array.length() >= 3) {
                    JSONObject item3 = array.getJSONObject(2);
                    views.setTextViewText(R.id.widget_item3_time, item3.optString("time", "14:00"));
                    views.setTextViewText(R.id.widget_item3_title, item3.optString("title", "Agenda"));
                    views.setViewVisibility(R.id.widget_item3_container, View.VISIBLE);
                } else {
                    views.setViewVisibility(R.id.widget_item3_container, View.GONE);
                }
            }
        } catch (Exception e) {
            views.setTextViewText(R.id.widget_item1_title, "AgendaRecap Pro Active");
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
