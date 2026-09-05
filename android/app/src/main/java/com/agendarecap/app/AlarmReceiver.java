package com.agendarecap.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public class AlarmReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "agendarecap_reminder_channel";
    public static final String CHANNEL_NAME = "AgendaRecap Reminder";

    @Override
    public void onReceive(Context context, Intent intent) {
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AgendaRecap:AlarmWakeLock");
            wakeLock.acquire(3000);
        }

        try {
            String reminderId = intent.getStringExtra("reminderId");
            String occurrenceId = intent.getStringExtra("occurrenceId");
            String title = intent.getStringExtra("title");
            String note = intent.getStringExtra("note");
            String scheduledTimeStr = intent.getStringExtra("scheduledTimeStr");

            if (title == null || title.trim().isEmpty()) {
                title = "Pengingat AgendaRecap Pro";
            }
            if (note == null || note.trim().isEmpty()) {
                note = "Waktu pengingat Anda telah tiba!";
            }

            createNotificationChannel(context);

            int notificationId = (occurrenceId != null) ? Math.abs(occurrenceId.hashCode()) : (int) System.currentTimeMillis();

            // Action: CLOSE
            Intent closeIntent = new Intent(context, NotificationActionReceiver.class);
            closeIntent.setAction("com.agendarecap.app.ACTION_CLOSE");
            closeIntent.putExtra("reminderId", reminderId);
            closeIntent.putExtra("occurrenceId", occurrenceId);
            closeIntent.putExtra("notificationId", notificationId);
            PendingIntent closePendingIntent = PendingIntent.getBroadcast(
                    context,
                    notificationId * 10 + 1,
                    closeIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Action: SNOOZE 5 MIN
            Intent snooze5Intent = new Intent(context, NotificationActionReceiver.class);
            snooze5Intent.setAction("com.agendarecap.app.ACTION_SNOOZE_5");
            snooze5Intent.putExtra("reminderId", reminderId);
            snooze5Intent.putExtra("occurrenceId", occurrenceId);
            snooze5Intent.putExtra("title", title);
            snooze5Intent.putExtra("note", note);
            snooze5Intent.putExtra("notificationId", notificationId);
            PendingIntent snooze5PendingIntent = PendingIntent.getBroadcast(
                    context,
                    notificationId * 10 + 2,
                    snooze5Intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Action: SNOOZE 15 MIN
            Intent snooze15Intent = new Intent(context, NotificationActionReceiver.class);
            snooze15Intent.setAction("com.agendarecap.app.ACTION_SNOOZE_15");
            snooze15Intent.putExtra("reminderId", reminderId);
            snooze15Intent.putExtra("occurrenceId", occurrenceId);
            snooze15Intent.putExtra("title", title);
            snooze15Intent.putExtra("note", note);
            snooze15Intent.putExtra("notificationId", notificationId);
            PendingIntent snooze15PendingIntent = PendingIntent.getBroadcast(
                    context,
                    notificationId * 10 + 3,
                    snooze15Intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Build High Priority Notification (STRICTLY NO OPEN ACTION)
            String contentText = note;
            if (scheduledTimeStr != null && !scheduledTimeStr.isEmpty()) {
                contentText = note + " (" + scheduledTimeStr + ")";
            }

            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (soundUri == null) {
                soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(contentText)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(contentText))
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setSound(soundUri)
                    .setVibrate(new long[]{0, 500, 200, 500, 200, 500})
                    .setOngoing(true)
                    .setAutoCancel(false)
                    .addAction(R.mipmap.ic_launcher, "❌ CLOSE", closePendingIntent)
                    .addAction(R.mipmap.ic_launcher, "⏱ 5 MIN", snooze5PendingIntent)
                    .addAction(R.mipmap.ic_launcher, "⏱ 15 MIN", snooze15PendingIntent);

            NotificationManagerCompat notificationManager = NotificationManagerCompat.from(context);
            notificationManager.notify(notificationId, builder.build());

        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        }
    }

    private void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                NotificationChannel existingChannel = manager.getNotificationChannel(CHANNEL_ID);
                if (existingChannel == null) {
                    Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                    if (soundUri == null) {
                        soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                    }
                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .build();

                    NotificationChannel channel = new NotificationChannel(
                            CHANNEL_ID,
                            CHANNEL_NAME,
                            NotificationManager.IMPORTANCE_HIGH
                    );
                    channel.setDescription("Pengingat & Alarm AgendaRecap Pro");
                    channel.enableLights(true);
                    channel.setLightColor(Color.BLUE);
                    channel.enableVibration(true);
                    channel.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
                    channel.setSound(soundUri, audioAttributes);

                    manager.createNotificationChannel(channel);
                }
            }
        }
    }
}
