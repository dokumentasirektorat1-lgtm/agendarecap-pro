package com.agendarecap.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Map;

public class AlarmStorage {
    private static final String PREF_NAME = "agendarecap_native_alarms";

    private static SharedPreferences getPrefs(Context context) {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public static void saveAlarm(Context context, String occurrenceId, String alarmJson) {
        SharedPreferences.Editor editor = getPrefs(context).edit();
        editor.putString(occurrenceId, alarmJson);
        editor.apply();
    }

    public static void removeAlarm(Context context, String occurrenceId) {
        SharedPreferences.Editor editor = getPrefs(context).edit();
        editor.remove(occurrenceId);
        editor.apply();
    }

    public static String getAlarm(Context context, String occurrenceId) {
        return getPrefs(context).getString(occurrenceId, null);
    }

    public static Map<String, ?> getAllAlarms(Context context) {
        return getPrefs(context).getAll();
    }

    public static void clearAllAlarms(Context context) {
        SharedPreferences.Editor editor = getPrefs(context).edit();
        editor.clear();
        editor.apply();
    }
}
