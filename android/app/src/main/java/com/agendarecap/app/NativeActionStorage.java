package com.agendarecap.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Map;

public class NativeActionStorage {
    private static final String PREF_NAME = "agendarecap_native_actions";

    private static SharedPreferences getPrefs(Context context) {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public static void saveAction(Context context, String actionId, String actionJson) {
        SharedPreferences.Editor editor = getPrefs(context).edit();
        editor.putString(actionId, actionJson);
        editor.apply();
    }

    public static void removeAction(Context context, String actionId) {
        SharedPreferences.Editor editor = getPrefs(context).edit();
        editor.remove(actionId);
        editor.apply();
    }

    public static Map<String, ?> getAllActions(Context context) {
        return getPrefs(context).getAll();
    }

    public static void clearAllActions(Context context) {
        SharedPreferences.Editor editor = getPrefs(context).edit();
        editor.clear();
        editor.apply();
    }
}
