package com.agendarecap.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Map;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativeAlarm")
public class NativeAlarmPlugin extends Plugin {

    @PluginMethod
    public void schedule(PluginCall call) {
        String reminderId = call.getString("reminderId");
        String occurrenceId = call.getString("occurrenceId");
        String title = call.getString("title");
        String note = call.getString("note", "");
        Long scheduledAtMs = call.getLong("scheduledAtMs");

        if (occurrenceId == null || scheduledAtMs == null) {
            call.reject("Must provide occurrenceId and scheduledAtMs");
            return;
        }

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (alarmManager == null) {
            call.reject("AlarmManager service not available");
            return;
        }

        // Exact Alarm Permission check on Android 12+ (API 31+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (!alarmManager.canScheduleExactAlarms()) {
                call.reject("EXACT_ALARM_PERMISSION_NOT_GRANTED");
                return;
            }
        }

        try {
            Intent alarmIntent = new Intent(context, AlarmReceiver.class);
            alarmIntent.putExtra("reminderId", reminderId);
            alarmIntent.putExtra("occurrenceId", occurrenceId);
            alarmIntent.putExtra("title", title);
            alarmIntent.putExtra("note", note);

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

            // Save to native persistent storage
            JSONObject json = new JSONObject();
            json.put("reminderId", reminderId);
            json.put("occurrenceId", occurrenceId);
            json.put("title", title);
            json.put("note", note);
            json.put("scheduledAtMs", scheduledAtMs);
            AlarmStorage.saveAlarm(context, occurrenceId, json.toString());

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("occurrenceId", occurrenceId);
            ret.put("scheduledAtMs", scheduledAtMs);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to schedule native alarm: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String occurrenceId = call.getString("occurrenceId");
        if (occurrenceId == null) {
            call.reject("Must provide occurrenceId");
            return;
        }

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (alarmManager != null) {
            Intent alarmIntent = new Intent(context, AlarmReceiver.class);
            int pendingIntentId = Math.abs(occurrenceId.hashCode());
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                    context,
                    pendingIntentId,
                    alarmIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            alarmManager.cancel(pendingIntent);
        }

        AlarmStorage.removeAlarm(context, occurrenceId);

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("occurrenceId", occurrenceId);
        call.resolve(ret);
    }

    @PluginMethod
    public void snooze(PluginCall call) {
        String reminderId = call.getString("reminderId");
        String occurrenceId = call.getString("occurrenceId");
        Integer minutes = call.getInt("minutes", 5);
        String title = call.getString("title", "Pengingat AgendaRecap Pro");
        String note = call.getString("note", "");

        long snoozeTargetMs = System.currentTimeMillis() + (minutes * 60 * 1000L);

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (alarmManager != null && occurrenceId != null) {
            try {
                Intent alarmIntent = new Intent(context, AlarmReceiver.class);
                alarmIntent.putExtra("reminderId", reminderId);
                alarmIntent.putExtra("occurrenceId", occurrenceId);
                alarmIntent.putExtra("title", title);
                alarmIntent.putExtra("note", note);

                int pendingIntentId = Math.abs(occurrenceId.hashCode());

                PendingIntent pendingIntent = PendingIntent.getBroadcast(
                        context,
                        pendingIntentId,
                        alarmIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeTargetMs, pendingIntent);
                } else {
                    alarmManager.setExact(AlarmManager.RTC_WAKEUP, snoozeTargetMs, pendingIntent);
                }

                JSONObject json = new JSONObject();
                json.put("reminderId", reminderId);
                json.put("occurrenceId", occurrenceId);
                json.put("title", title);
                json.put("note", note);
                json.put("scheduledAtMs", snoozeTargetMs);
                AlarmStorage.saveAlarm(context, occurrenceId, json.toString());

            } catch (Exception e) {
                call.reject("Snooze alarm failed: " + e.getMessage());
                return;
            }
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("snoozedMinutes", minutes);
        ret.put("snoozedUntilMs", snoozeTargetMs);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        Map<String, ?> alarms = AlarmStorage.getAllAlarms(context);
        if (alarmManager != null && alarms != null) {
            for (String occurrenceId : alarms.keySet()) {
                Intent alarmIntent = new Intent(context, AlarmReceiver.class);
                int pendingIntentId = Math.abs(occurrenceId.hashCode());
                PendingIntent pendingIntent = PendingIntent.getBroadcast(
                        context,
                        pendingIntentId,
                        alarmIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                alarmManager.cancel(pendingIntent);
            }
        }

        AlarmStorage.clearAllAlarms(context);

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getScheduled(PluginCall call) {
        Context context = getContext();
        Map<String, ?> alarmsMap = AlarmStorage.getAllAlarms(context);

        JSArray list = new JSArray();
        if (alarmsMap != null) {
            for (Map.Entry<String, ?> entry : alarmsMap.entrySet()) {
                try {
                    String jsonStr = (String) entry.getValue();
                    if (jsonStr != null) {
                        list.put(new JSObject(jsonStr));
                    }
                } catch (Exception ignored) {}
            }
        }

        JSObject ret = new JSObject();
        ret.put("alarms", list);
        call.resolve(ret);
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        Context context = getContext();
        boolean notificationsGranted = NotificationManagerCompat.from(context).areNotificationsEnabled();

        boolean exactAlarmGranted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager != null) {
                exactAlarmGranted = alarmManager.canScheduleExactAlarms();
            }
        }

        JSObject ret = new JSObject();
        ret.put("notifications", notificationsGranted ? "granted" : "denied");
        ret.put("exactAlarm", exactAlarmGranted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestExactAlarmPermission(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager != null && !alarmManager.canScheduleExactAlarms()) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("opened", true);
                call.resolve(ret);
                return;
            }
        }

        JSObject ret = new JSObject();
        ret.put("opened", false);
        ret.put("alreadyGranted", true);
        call.resolve(ret);
    }
}
