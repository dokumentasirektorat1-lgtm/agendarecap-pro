package com.agendarecap.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class FCMService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "[AgendaRecap][FCM]"
        const val CHANNEL_ID = "agendarecap_floating_reminders"
        const val CHANNEL_NAME = "Floating Background Reminders"
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "FCM Push Data Received: ${remoteMessage.data}")

        val data = remoteMessage.data
        val title = data["title"] ?: remoteMessage.notification?.title ?: "Pengingat AgendaRecap"
        val body = data["body"] ?: remoteMessage.notification?.body ?: "Waktu pengingat Anda telah tiba!"
        val reminderId = data["reminderId"] ?: ""
        val occurrenceId = data["occurrenceId"] ?: ""

        sendFloatingNotification(title, body, reminderId, occurrenceId)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM Device Token Generated: $token")
        // Token will be synced to backend during app authentication/sync
    }

    private fun sendFloatingNotification(title: String, body: String, reminderId: String, occurrenceId: String) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Configure IMPORTANCE_HIGH Notification Channel for Heads-up / Floating banners
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build()

            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifikasi pengingat mendesak dengan banner melayang (floating)"
                enableLights(true)
                lightColor = Color.BLUE
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500)
                setSound(soundUri, audioAttributes)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            }

            notificationManager.createNotificationChannel(channel)
        }

        // Tap action -> Open MainActivity
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("reminderId", reminderId)
            putExtra("occurrenceId", occurrenceId)
        }
        val pendingOpenIntent = PendingIntent.getActivity(
            this,
            (System.currentTimeMillis() % 10000).toInt(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Action CLOSE Intent
        val closeIntent = Intent(this, NotificationActionReceiver::class.java).apply {
            action = "com.agendarecap.app.ACTION_CLOSE"
            putExtra("reminderId", reminderId)
            putExtra("occurrenceId", occurrenceId)
        }
        val pendingCloseIntent = PendingIntent.getBroadcast(
            this,
            (System.currentTimeMillis() % 10000 + 1).toInt(),
            closeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Action SNOOZE 5 MIN Intent
        val snoozeIntent = Intent(this, NotificationActionReceiver::class.java).apply {
            action = "com.agendarecap.app.ACTION_SNOOZE_5"
            putExtra("reminderId", reminderId)
            putExtra("occurrenceId", occurrenceId)
        }
        val pendingSnoozeIntent = PendingIntent.getBroadcast(
            this,
            (System.currentTimeMillis() % 10000 + 2).toInt(),
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        // Build Floating / Heads-up Notification
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 500, 200, 500))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(pendingOpenIntent, true) // Triggers floating heads-up banner
            .setContentIntent(pendingOpenIntent)
            .addAction(0, "❌ SELESAI", pendingCloseIntent)
            .addAction(0, "⏱ TUNDA 5 MNT", pendingSnoozeIntent)

        val notificationId = (System.currentTimeMillis() % 100000).toInt()
        notificationManager.notify(notificationId, builder.build())
        Log.i(TAG, "Floating Heads-up Notification displayed successfully ID=$notificationId")
    }
}
