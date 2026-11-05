package com.dpejoh.specter;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Looper;
import android.system.Os;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.zip.ZipFile;

/**
 * Prints installed apps that declare Xposed module markers.
 *
 * Output is one tab-separated line per app: package name, matched markers.
 * Runs through app_process; it does not stay resident.
 */
public class XposedProbe {
    private static final String[] XPOSED_KEYS = {
        "xposedmodule",
        "xposedminversion",
        "xposeddescription",
        "xposedscope",
        "xposedsharedprefs",
    };

    private static final String[] LIBXPOSED_MARKERS = {
        "META-INF/xposed/module.prop",
        "META-INF/xposed/java_init.list",
        "META-INF/xposed/scope.list",
    };

    private static final int MARKER_NONE = 0;
    private static final int MARKER_LEGACY = 1;
    private static final int MARKER_LIBXPOSED = 2;

    private static void appendKey(StringBuilder keys, String key) {
        if (keys.length() > 0) {
            keys.append(',');
        }
        keys.append(key);
    }

    private static int readMarkers(String apkPath) {
        int markers = MARKER_NONE;
        try (ZipFile zip = new ZipFile(new File(apkPath))) {
            for (String marker : LIBXPOSED_MARKERS) {
                if (zip.getEntry(marker) != null) {
                    markers |= MARKER_LIBXPOSED;
                    break;
                }
            }
            if (zip.getEntry("assets/xposed_init") != null) {
                markers |= MARKER_LEGACY;
            }
        } catch (Throwable ignored) {
            // Unreadable or non-APK paths are simply not modules.
        }
        return markers;
    }

    public static void main(String[] args) {
        try {
            if (Os.geteuid() == 0) {
                try { Os.seteuid(1000); } catch (Throwable ignored) {}
            }
            if (Looper.getMainLooper() == null) {
                Looper.prepareMainLooper();
            }

            Class<?> activityThreadClass = Class.forName("android.app.ActivityThread");
            Object activityThread = activityThreadClass.getMethod("systemMain").invoke(null);
            Context context = (Context) activityThreadClass
                .getMethod("getSystemContext")
                .invoke(activityThread);

            PackageManager pm = context.getPackageManager();
            List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);

            List<String> lines = new ArrayList<>();
            for (ApplicationInfo app : apps) {
                Bundle metadata = app.metaData;
                StringBuilder keys = new StringBuilder();

                if (metadata != null) {
                    for (String key : XPOSED_KEYS) {
                        if (metadata.containsKey(key)) {
                            appendKey(keys, key);
                        }
                    }
                }

                String apkPath = app.sourceDir;
                int markers = apkPath == null ? MARKER_NONE : readMarkers(apkPath);
                if ((markers & MARKER_LIBXPOSED) != 0) {
                    appendKey(keys, "libxposed");
                } else if (keys.length() == 0 && (markers & MARKER_LEGACY) != 0) {
                    keys.append("xposed_init");
                }

                if (keys.length() > 0) {
                    lines.add(app.packageName + "\t" + keys);
                }
            }

            Collections.sort(lines);
            for (String line : lines) {
                System.out.println(line);
            }
        } catch (Throwable t) {
            t.printStackTrace();
            System.exit(2);
        }
        System.exit(0);
    }
}
