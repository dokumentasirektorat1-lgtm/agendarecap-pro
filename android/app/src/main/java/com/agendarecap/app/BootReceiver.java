package com.agendarecap.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import java.util.Map;
import org.json.JSONObject;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action)) {

            Map<String, ?> alarmsMap = AlarmStorage.getAllAlarms(context);
            if (alarmsMap == null || alarmsMap.isEmpty()) return;

            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;

            long nowMs = System.currentTimeMillis();

            for (Map.Entry<String, ?> entry : alarmsMap.entrySet()) {
                try {
                    String jsonStr = (String) entry.getValue();
                    if (jsonStr == null) continue;

                    JSONObject json = new JSONObject(jsonStr);
                    String reminderId = json.optString("reminderId");
                    String occurrenceId = json.optString("occurrenceId");
                    String title = json.optString("title");
                    String note = json.optString("note");
                    String sound = json.optString("sound", "default");
                    long scheduledAtMs = json.optLong("scheduledAtMs");

                    if (scheduledAtMs > nowMs) {
                        Intent alarmIntent = new Intent(context, AlarmReceiver.class);
                        alarmIntent.putExtra("reminderId", reminderId);
                        alarmIntent.putExtra("occurrenceId", occurrenceId);
                        alarmIntent.putExtra("title", title);
                        alarmIntent.putExtra("note", note);
                        alarmIntent.putExtra("sound", sound);

                        int pendingIntentId = Math.abs(occurrenceId.hashCode());

                        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                                context,
                                pendingIntentId,
                                alarmIntent,
                                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                        );

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, scheduledAtMs, pendingIntent);
                        } else {
                            alarmManager.setExact(AlarmManager.RTC_WAKEUP, scheduledAtMs, pendingIntent);
                        }
                    } else {
                        // Cleanup expired alarm entry
                        AlarmStorage.removeAlarm(context, occurrenceId);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }
    }
}

