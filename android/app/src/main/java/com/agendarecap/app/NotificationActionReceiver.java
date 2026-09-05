package com.agendarecap.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONObject;

public class NotificationActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        String reminderId = intent.getStringExtra("reminderId");
        String occurrenceId = intent.getStringExtra("occurrenceId");
        int notificationId = intent.getIntExtra("notificationId", 0);
        String title = intent.getStringExtra("title");
        String note = intent.getStringExtra("note");

        NotificationManagerCompat notificationManager = NotificationManagerCompat.from(context);
        if (notificationId != 0) {
            notificationManager.cancel(notificationId);
        }

        if ("com.agendarecap.app.ACTION_CLOSE".equals(action)) {
            if (occurrenceId != null) {
                AlarmStorage.removeAlarm(context, occurrenceId);
            }
        } else if (action.startsWith("com.agendarecap.app.ACTION_SNOOZE")) {
            int minutes = 5;
            if ("com.agendarecap.app.ACTION_SNOOZE_15".equals(action)) minutes = 15;
            if ("com.agendarecap.app.ACTION_SNOOZE_60".equals(action)) minutes = 60;

            long snoozeTargetTimeMs = System.currentTimeMillis() + (minutes * 60 * 1000L);

            try {
                AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
                if (alarmManager != null) {
                    Intent alarmIntent = new Intent(context, AlarmReceiver.class);
                    alarmIntent.putExtra("reminderId", reminderId);
                    alarmIntent.putExtra("occurrenceId", occurrenceId);
                    alarmIntent.putExtra("title", title);
                    alarmIntent.putExtra("note", note);

                    int pendingIntentId = (occurrenceId != null) ? Math.abs(occurrenceId.hashCode()) : (int) System.currentTimeMillis();

                    PendingIntent pendingIntent = PendingIntent.getBroadcast(
                            context,
                            pendingIntentId,
                            alarmIntent,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    );

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeTargetTimeMs, pendingIntent);
                    } else {
                        alarmManager.setExact(AlarmManager.RTC_WAKEUP, snoozeTargetTimeMs, pendingIntent);
                    }

                    // Save snoozed alarm state natively
                    if (occurrenceId != null) {
                        JSONObject json = new JSONObject();
                        json.put("reminderId", reminderId);
                        json.put("occurrenceId", occurrenceId);
                        json.put("title", title);
                        json.put("note", note);
                        json.put("scheduledAtMs", snoozeTargetTimeMs);
                        AlarmStorage.saveAlarm(context, occurrenceId, json.toString());
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}
