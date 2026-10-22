package com.agendarecap.app;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Agenda7DaysWidgetService
 * Provides RemoteViewsFactory for the scrollable ListView in the Agenda 7 Days Widget.
 * All agenda items for the next 7 days are loaded from SharedPreferences (saved by NativeAlarmPlugin).
 */
public class Agenda7DaysWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Agenda7DaysRemoteViewsFactory(this.getApplicationContext());
    }

    /**
     * Holds the actual data for each ListView row.
     */
    static class AgendaItem {
        String dateLabel;
        String time;
        String title;

        AgendaItem(String dateLabel, String time, String title) {
            this.dateLabel = dateLabel;
            this.time = time;
            this.title = title;
        }
    }

    /**
     * Factory that produces RemoteViews rows for the scrollable widget ListView.
     */
    public static class Agenda7DaysRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory {

        private final Context mContext;
        private final List<AgendaItem> mItems = new ArrayList<>();

        public Agenda7DaysRemoteViewsFactory(Context context) {
            mContext = context;
        }

        @Override
        public void onCreate() {
            loadData();
        }

        @Override
        public void onDataSetChanged() {
            loadData();
        }

        @Override
        public void onDestroy() {
            mItems.clear();
        }

        @Override
        public int getCount() {
            return mItems.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews rv = new RemoteViews(mContext.getPackageName(), R.layout.agenda_7days_widget_item);
            if (position >= mItems.size()) return rv;

            AgendaItem item = mItems.get(position);
            rv.setTextViewText(R.id.agenda7_item_date, item.dateLabel);
            rv.setTextViewText(R.id.agenda7_item_time, item.time);
            rv.setTextViewText(R.id.agenda7_item_title, item.title);

            // Tap on item → open main app
            Bundle extras = new Bundle();
            extras.putInt("clickedItem", position);
            Intent fillInIntent = new Intent();
            fillInIntent.putExtras(extras);
            rv.setOnClickFillInIntent(R.id.agenda7_item_title, fillInIntent);

            return rv;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }

        private void loadData() {
            mItems.clear();

            try {
                String jsonStr = Agenda7DaysWidgetProvider.getAgendaData(mContext);
                JSONArray allItems = new JSONArray(jsonStr);

                SimpleDateFormat keyFmt = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault());
                SimpleDateFormat labelFmt = new SimpleDateFormat("d/M", Locale.getDefault());

                Calendar today = Calendar.getInstance();
                Calendar endDay = Calendar.getInstance();
                endDay.add(Calendar.DAY_OF_YEAR, 8);

                String todayKey = keyFmt.format(today.getTime());
                String endKey = keyFmt.format(endDay.getTime());

                for (int i = 0; i < allItems.length(); i++) {
                    JSONObject obj = allItems.getJSONObject(i);
                    String itemDate = obj.optString("date", "");

                    if (itemDate.compareTo(todayKey) >= 0 && itemDate.compareTo(endKey) <= 0) {
                        String time = obj.optString("time", "--:--");
                        String title = obj.optString("title", "Agenda");

                        String dateLabel;
                        if (todayKey.equals(itemDate)) {
                            dateLabel = "Hari\nini";
                        } else {
                            try {
                                java.util.Date d = keyFmt.parse(itemDate);
                                dateLabel = d != null ? labelFmt.format(d) : itemDate.substring(5);
                            } catch (Exception ex) {
                                dateLabel = itemDate.length() >= 10 ? itemDate.substring(5) : itemDate;
                            }
                        }

                        mItems.add(new AgendaItem(dateLabel, time, title));
                    }
                }
            } catch (Exception e) {
                // leave mItems empty; widget shows empty state
            }
        }
    }
}
