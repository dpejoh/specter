package com.dpejoh.specter;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.system.Os;
import android.util.Log;

public class Provider extends ContentProvider {
    private static final String TAG = "Specter";
    private static final String AUTHORITY = "com.dpejoh.specter";

    private volatile AttestationHelper helper;
    private volatile boolean attested;

    @Override
    public boolean onCreate() {
        return true;
    }

    private synchronized void ensureAttested() {
        if (attested) return;

        if (Os.geteuid() < Process.FIRST_APPLICATION_UID) {
            Log.w(TAG, "Running as root/system, some keystore APIs may fail");
        }

        helper = new AttestationHelper();
        helper.doAttestation();
        attested = true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection,
                        String selection, String[] selectionArgs,
                        String sortOrder) {
        ensureAttested();

        String path = uri.getPath();
        MatrixCursor cursor = new MatrixCursor(new String[]{"status"});

        if ("/check".equals(path)) {
            String status = helper.isAttestationNormal() ? "normal" : "broken";
            cursor.addRow(new Object[]{status});
            return cursor;

        } else if ("/hash".equals(path)) {
            String hash = helper.getVerifiedBootHashHex();
            if (hash != null && hash.length() == 64) {
                MatrixCursor hc = new MatrixCursor(new String[]{"hash"});
                hc.addRow(new Object[]{hash});
                return hc;
            } else {
                MatrixCursor hc = new MatrixCursor(new String[]{"hash"});
                hc.addRow(new Object[]{"unavailable"});
                return hc;
            }
        }

        return cursor;
    }

    @Override
    public String getType(Uri uri) {
        return "text/plain";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
