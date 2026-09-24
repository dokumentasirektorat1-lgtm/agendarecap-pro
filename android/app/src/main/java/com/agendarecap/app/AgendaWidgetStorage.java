package com.agendarecap.app;

import android.content.Context;
import android.content.SharedPreferences;

public class AgendaWidgetStorage {
    private static final String PREF_NAME = "agendarecap_widget_prefs";
    private static final String KEY_ITEMS = "upcoming_items_json";

    public static void saveWidgetData(Context context, String jsonItems) {
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_ITEMS, jsonItems).apply();
    }

    public static String getWidgetData(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_ITEMS, "[]");
    }
}
