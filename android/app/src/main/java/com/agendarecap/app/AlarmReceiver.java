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
    public static final String DEFAULT_CHANNEL_ID = "agendarecap_reminder_channel_default";
    public static final String DEFAULT_CHANNEL_NAME = "AgendaRecap Reminder";

    @Override
    public void onReceive(Context context, Intent intent) {
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AgendaRecap:AlarmWakeLock");
            wakeLock.acquire(5000);
        }

        try {
            String reminderId = intent.getStringExtra("reminderId");
            String occurrenceId = intent.getStringExtra("occurrenceId");
            String title = intent.getStringExtra("title");
            String note = intent.getStringExtra("note");
            String sound = intent.getStringExtra("sound");
            String scheduledTimeStr = intent.getStringExtra("scheduledTimeStr");

            if (title == null || title.trim().isEmpty()) {
                title = "Pengingat AgendaRecap Pro";
            }
            if (note == null || note.trim().isEmpty()) {
                note = "Waktu pengingat Anda telah tiba!";
            }
            if (sound == null || sound.trim().isEmpty()) {
                sound = "default";
            }

            // Generate Sound Uri and Channel Id
            SoundChannelInfo channelInfo = getSoundChannelInfo(context, sound);
            createNotificationChannel(context, channelInfo);

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
            snooze5Intent.putExtra("sound", sound);
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
            snooze15Intent.putExtra("sound", sound);
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

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelInfo.channelId)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(contentText)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(contentText))
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setSound(channelInfo.soundUri)
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

    public static class SoundChannelInfo {
        public String channelId;
        public String channelName;
        public Uri soundUri;

        public SoundChannelInfo(String channelId, String channelName, Uri soundUri) {
            this.channelId = channelId;
            this.channelName = channelName;
            this.soundUri = soundUri;
        }
    }

    public static SoundChannelInfo getSoundChannelInfo(Context context, String soundOption) {
        String cleanKey = "default";
        Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);

        if (soundOption != null && !soundOption.trim().isEmpty()) {
            String lower = soundOption.toLowerCase().trim();
            if (lower.startsWith("content://") || lower.startsWith("file://")) {
                cleanKey = "custom_" + Math.abs(soundOption.hashCode());
                soundUri = Uri.parse(soundOption);
            } else if (lower.equals("chime") || lower.equals("notification")) {
                cleanKey = "chime";
                soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            } else if (lower.equals("ringtone")) {
                cleanKey = "ringtone";
                soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            } else if (lower.equals("digital") || lower.equals("urgent")) {
                cleanKey = lower;
                soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            }
        }

        if (soundUri == null) {
            soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        }

        String channelId = "agendarecap_reminder_channel_" + cleanKey;
        String channelName = "AgendaRecap Reminder (" + cleanKey + ")";

        return new SoundChannelInfo(channelId, channelName, soundUri);
    }

    private void createNotificationChannel(Context context, SoundChannelInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                NotificationChannel existingChannel = manager.getNotificationChannel(info.channelId);
                if (existingChannel == null) {
                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .build();

                    NotificationChannel channel = new NotificationChannel(
                            info.channelId,
                            info.channelName,
                            NotificationManager.IMPORTANCE_HIGH
                    );
                    channel.setDescription("Pengingat & Alarm AgendaRecap Pro (" + info.channelId + ")");
                    channel.enableLights(true);
                    channel.setLightColor(Color.BLUE);
                    channel.enableVibration(true);
                    channel.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
                    channel.setSound(info.soundUri, audioAttributes);

                    manager.createNotificationChannel(channel);
                }
            }
        }
    }
}

