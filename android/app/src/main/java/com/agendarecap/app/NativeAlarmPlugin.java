package com.agendarecap.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Map;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativeAlarm")
public class NativeAlarmPlugin extends Plugin {

    private static MediaPlayer mediaPlayer;

    @PluginMethod
    public void schedule(PluginCall call) {
        String reminderId = call.getString("reminderId");
        String occurrenceId = call.getString("occurrenceId");
        String title = call.getString("title");
        String note = call.getString("note", "");
        String sound = call.getString("sound", "default");
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

            // Save to native persistent storage
            JSONObject json = new JSONObject();
            json.put("reminderId", reminderId);
            json.put("occurrenceId", occurrenceId);
            json.put("title", title);
            json.put("note", note);
            json.put("sound", sound);
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
        String sound = call.getString("sound", "default");

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
                alarmIntent.putExtra("sound", sound);

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
                json.put("sound", sound);
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
    public void getPendingNativeActions(PluginCall call) {
        Context context = getContext();
        Map<String, ?> actionsMap = NativeActionStorage.getAllActions(context);

        JSArray list = new JSArray();
        if (actionsMap != null) {
            for (Map.Entry<String, ?> entry : actionsMap.entrySet()) {
                try {
                    String jsonStr = (String) entry.getValue();
                    if (jsonStr != null) {
                        list.put(new JSObject(jsonStr));
                    }
                } catch (Exception ignored) {}
            }
        }

        JSObject ret = new JSObject();
        ret.put("actions", list);
        call.resolve(ret);
    }

    @PluginMethod
    public void acknowledgeNativeAction(PluginCall call) {
        String actionId = call.getString("actionId");
        if (actionId == null) {
            call.reject("Must provide actionId");
            return;
        }

        Context context = getContext();
        NativeActionStorage.removeAction(context, actionId);

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("actionId", actionId);
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

    @PluginMethod
    public void saveCustomSound(PluginCall call) {
        String base64Data = call.getString("base64Data");
        String fileName = call.getString("fileName", "custom_alarm.mp3");
        String mimeType = call.getString("mimeType", "audio/mpeg");

        if (base64Data == null || base64Data.trim().isEmpty()) {
            call.reject("Must provide base64Data");
            return;
        }

        Context context = getContext();
        try {
            String base64Clean = base64Data.contains(",")
                    ? base64Data.substring(base64Data.indexOf(",") + 1)
                    : base64Data;
            byte[] fileBytes = Base64.decode(base64Clean, Base64.DEFAULT);

            // 1. Simpan ke internal files storage
            File soundDir = new File(context.getFilesDir(), "sounds");
            if (!soundDir.exists()) {
                soundDir.mkdirs();
            }
            File localFile = new File(soundDir, "custom_notification_sound.mp3");
            try (FileOutputStream fos = new FileOutputStream(localFile)) {
                fos.write(fileBytes);
                fos.flush();
            }

            // 2. Pada Android 10+ (Q+), daftarkan ke MediaStore Notifications agar SystemUI dapat membaca
            Uri resolvedUri = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    ContentResolver resolver = context.getContentResolver();
                    ContentValues contentValues = new ContentValues();
                    contentValues.put(MediaStore.Audio.Media.DISPLAY_NAME, fileName);
                    contentValues.put(MediaStore.Audio.Media.MIME_TYPE, mimeType);
                    contentValues.put(MediaStore.Audio.Media.IS_NOTIFICATION, 1);
                    contentValues.put(MediaStore.Audio.Media.IS_ALARM, 1);
                    contentValues.put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_NOTIFICATIONS);

                    Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                    Uri itemUri = resolver.insert(collection, contentValues);
                    if (itemUri != null) {
                        try (OutputStream os = resolver.openOutputStream(itemUri)) {
                            if (os != null) {
                                os.write(fileBytes);
                                os.flush();
                            }
                        }
                        resolvedUri = itemUri;
                    }
                } catch (Exception mediaStoreEx) {
                    // Fallback to localFile
                }
            }

            if (resolvedUri == null) {
                resolvedUri = Uri.fromFile(localFile);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("soundUri", resolvedUri.toString());
            ret.put("soundName", fileName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Gagal menyimpan audio kustom: " + e.getMessage());
        }
    }

    @PluginMethod
    public void playAudioPreview(PluginCall call) {
        String sound = call.getString("sound", "default");
        Context context = getContext();

        try {
            stopMedia();

            if (sound != null && sound.startsWith("data:")) {
                String base64Clean = sound.contains(",") ? sound.substring(sound.indexOf(",") + 1) : sound;
                byte[] decoded = Base64.decode(base64Clean, Base64.DEFAULT);
                File cacheFile = new File(context.getCacheDir(), "preview_audio.mp3");
                try (FileOutputStream fos = new FileOutputStream(cacheFile)) {
                    fos.write(decoded);
                    fos.flush();
                }
                mediaPlayer = new MediaPlayer();
                mediaPlayer.setDataSource(cacheFile.getAbsolutePath());
                mediaPlayer.setAudioStreamType(android.media.AudioManager.STREAM_ALARM);
                mediaPlayer.prepare();
                mediaPlayer.start();

                JSObject ret = new JSObject();
                ret.put("playing", true);
                ret.put("sound", "custom");
                call.resolve(ret);
                return;
            }

            AlarmReceiver.SoundChannelInfo info = AlarmReceiver.getSoundChannelInfo(context, sound);

            if (info.soundUri == null) {
                JSObject ret = new JSObject();
                ret.put("playing", false);
                ret.put("sound", "silent");
                call.resolve(ret);
                return;
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(context, info.soundUri);
            mediaPlayer.setAudioStreamType(android.media.AudioManager.STREAM_ALARM);
            mediaPlayer.prepare();
            mediaPlayer.start();

            JSObject ret = new JSObject();
            ret.put("playing", true);
            ret.put("sound", sound);
            call.resolve(ret);
        } catch (Exception e) {
            stopMedia();
            call.reject("Failed to play audio preview: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopAudioPreview(PluginCall call) {
        stopMedia();
        JSObject ret = new JSObject();
        ret.put("playing", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void getFCMToken(PluginCall call) {
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    if (!task.isSuccessful()) {
                        call.reject("Failed to fetch FCM token: " + task.getException());
                        return;
                    }
                    String token = task.getResult();
                    JSObject ret = new JSObject();
                    ret.put("token", token);
                    call.resolve(ret);
                });
        } catch (Exception e) {
            call.reject("FCM token exception: " + e.getMessage());
        }
    }

    // --- App Branding (for dynamic widget labels) ---
    private static final String BRANDING_PREFS = "agendarecap_branding_prefs";
    public static final String KEY_APP_NAME = "branding_app_name";
    public static final String KEY_APP_LOGO = "branding_app_logo";
    private static final String DEFAULT_APP_NAME = "AgendaRecap Pro";

    public static String getSavedAppName(Context context) {
        return context.getSharedPreferences(BRANDING_PREFS, Context.MODE_PRIVATE)
                .getString(KEY_APP_NAME, DEFAULT_APP_NAME);
    }

    @PluginMethod
    public void setAppBranding(PluginCall call) {
        String appName = call.getString("appName", DEFAULT_APP_NAME);
        String appLogo = call.getString("appLogo", "");
        Context context = getContext();
        context.getSharedPreferences(BRANDING_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_APP_NAME, (appName != null && !appName.trim().isEmpty()) ? appName.trim() : DEFAULT_APP_NAME)
                .putString(KEY_APP_LOGO, appLogo != null ? appLogo : "")
                .apply();

        // Refresh all widgets to pick up new branding
        ConsultationWidgetProvider.updateAllWidgets(context);
        Agenda7DaysWidgetProvider.updateAllWidgets(context);
        AgendaWidgetProvider.updateAllWidgets(context);

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void updateWidgetData(PluginCall call) {
        JSArray items = call.getArray("items");
        Context context = getContext();

        try {
            String jsonStr = (items != null) ? items.toString() : "[]";
            AgendaWidgetStorage.saveWidgetData(context, jsonStr);
            AgendaWidgetProvider.updateAllWidgets(context);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to update widget data: " + e.getMessage());
        }
    }

    @PluginMethod
    public void updateConsultationWidgetData(PluginCall call) {
        JSArray items = call.getArray("items");
        Context context = getContext();

        try {
            String jsonStr = (items != null) ? items.toString() : "[]";
            ConsultationWidgetProvider.saveConsultationData(context, jsonStr);
            ConsultationWidgetProvider.updateAllWidgets(context);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to update consultation widget data: " + e.getMessage());
        }
    }

    @PluginMethod
    public void updateAgenda7DaysWidgetData(PluginCall call) {
        JSArray items = call.getArray("items");
        Context context = getContext();

        try {
            String jsonStr = (items != null) ? items.toString() : "[]";
            Agenda7DaysWidgetProvider.saveAgendaData(context, jsonStr);
            Agenda7DaysWidgetProvider.updateAllWidgets(context);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to update agenda 7days widget data: " + e.getMessage());
        }
    }

    @PluginMethod
    public void saveAndOpenFile(PluginCall call) {
        String fileName = call.getString("fileName");
        String base64Data = call.getString("base64Data");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        boolean openFile = call.getBoolean("openFile", true);

        if (fileName == null || base64Data == null) {
            call.reject("Must provide fileName and base64Data");
            return;
        }

        Context context = getContext();
        try {
            byte[] fileBytes = Base64.decode(base64Data, Base64.DEFAULT);

            // 1. Simpan ke Download folder publik
            boolean savedToPublic = false;
            String savedLocation = "";

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = context.getContentResolver();
                ContentValues contentValues = new ContentValues();
                contentValues.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                contentValues.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                contentValues.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                Uri itemUri = resolver.insert(collection, contentValues);
                if (itemUri != null) {
                    try (OutputStream os = resolver.openOutputStream(itemUri)) {
                        if (os != null) {
                            os.write(fileBytes);
                            os.flush();
                        }
                    }
                    contentValues.clear();
                    contentValues.put(MediaStore.Downloads.IS_PENDING, 0);
                    resolver.update(itemUri, contentValues, null, null);
                    savedToPublic = true;
                    savedLocation = "Folder Download (" + fileName + ")";
                }
            }

            if (!savedToPublic) {
                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (downloadsDir != null) {
                    if (!downloadsDir.exists()) {
                        downloadsDir.mkdirs();
                    }
                    File destFile = new File(downloadsDir, fileName);
                    try (FileOutputStream fos = new FileOutputStream(destFile)) {
                        fos.write(fileBytes);
                        fos.flush();
                    }
                    savedLocation = destFile.getAbsolutePath();
                }
            }

            // 2. Simpan juga ke cache internal untuk dibuka langsung dengan FileProvider
            File cacheDir = context.getCacheDir();
            File shareFile = new File(cacheDir, fileName);
            try (FileOutputStream fos = new FileOutputStream(shareFile)) {
                fos.write(fileBytes);
                fos.flush();
            }

            Uri contentUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                shareFile
            );

            // 3. Jika openFile = true, buka chooser untuk melihat / membagikan file
            if (openFile) {
                Intent viewIntent = new Intent(Intent.ACTION_VIEW);
                viewIntent.setDataAndType(contentUri, mimeType);
                viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                Intent chooser = Intent.createChooser(viewIntent, "Buka atau Bagikan: " + fileName);
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(chooser);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("fileName", fileName);
            ret.put("savedLocation", savedLocation);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Gagal menyimpan file ke perangkat: " + e.getMessage());
        }
    }

    private void stopMedia() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
    }
}
