package com.dpejoh.specter;

import android.app.Application;
import android.app.Instrumentation;
import android.content.Context;
import android.os.Build;
import android.os.Looper;
import android.os.Process;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.system.Os;
import android.util.Log;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.security.spec.ECGenParameterSpec;

import com.dpejoh.specter.attestation.Attestation;
import com.dpejoh.specter.attestation.RootOfTrust;

public class Main {
    private static final String TAG = "Specter";
    private static final String ALIAS = "specter_tee_probe";

    public static void main(String[] args) {
        try {
            fixEnv();
            String hash = getTeeBootHash();
            if (hash != null && !isAllZero(hash) && hash.length() == 64) {
                System.out.println(hash);
                System.exit(0);
            } else {
                System.exit(1);
            }
        } catch (Throwable t) {
            System.exit(2);
        }
    }

    private static void fixEnv() {
        try {
            if (Os.geteuid() == Process.ROOT_UID) {
                try {
                    Os.seteuid(Process.SYSTEM_UID);
                } catch (Throwable ignored) {}
            }

            if (Looper.getMainLooper() == null) {
                Looper.prepareMainLooper();
            }

            Class<?> atClass = Class.forName("android.app.ActivityThread");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    atClass.getMethod("initializeMainlineModules").invoke(null);
                } catch (Throwable ignored) {}
            }

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    Class.forName("android.security.keystore2.AndroidKeyStoreProvider")
                            .getMethod("install").invoke(null);
                } else {
                    Class.forName("android.security.keystore.AndroidKeyStoreProvider")
                            .getMethod("install").invoke(null);
                }
            } catch (Throwable t) {
                try {
                    Class.forName("android.security.keystore.AndroidKeyStoreProvider")
                            .getMethod("install").invoke(null);
                } catch (Throwable ignored) {}
            }

            Object activityThread = atClass.getMethod("systemMain").invoke(null);
            Context systemContext = (Context) atClass.getMethod("getSystemContext").invoke(activityThread);

            try {
                String packageName = Os.geteuid() == Process.SYSTEM_UID ? "android" : "com.android.shell";
                int flags = Context.CONTEXT_INCLUDE_CODE | Context.CONTEXT_IGNORE_SECURITY;
                Context context = systemContext.createPackageContext(packageName, flags);
                Field mPackageInfo = context.getClass().getDeclaredField("mPackageInfo");
                mPackageInfo.setAccessible(true);
                Object loadedApk = mPackageInfo.get(context);
                Method makeApplication = loadedApk.getClass().getDeclaredMethod("makeApplication",
                        boolean.class, Instrumentation.class);
                Application application = (Application) makeApplication.invoke(loadedApk, true, null);
                Field mInitialApplication = atClass.getDeclaredField("mInitialApplication");
                mInitialApplication.setAccessible(true);
                mInitialApplication.set(activityThread, application);
            } catch (Throwable fallback) {
                Application app = (Application) Class.forName("android.app.Application")
                        .getDeclaredConstructor().newInstance();
                Method attach = Class.forName("android.content.ContextWrapper")
                        .getDeclaredMethod("attachBaseContext", Context.class);
                attach.setAccessible(true);
                attach.invoke(app, systemContext);
                Field f = atClass.getDeclaredField("mInitialApplication");
                f.setAccessible(true);
                f.set(activityThread, app);
            }
        } catch (Throwable ignored) {}
    }

    private static String getTeeBootHash() {
        KeyStore keyStore = null;
        try {
            keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (keyStore.containsAlias(ALIAS)) {
                keyStore.deleteEntry(ALIAS);
            }

            byte[] challenge = new byte[16];
            new SecureRandom().nextBytes(challenge);

            KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                    ALIAS, KeyProperties.PURPOSE_SIGN)
                    .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setAttestationChallenge(challenge)
                    .build();

            KeyPairGenerator kpg = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
            kpg.initialize(spec);
            kpg.generateKeyPair();

            Certificate[] chain = keyStore.getCertificateChain(ALIAS);
            if (chain == null || chain.length == 0) {
                return null;
            }

            X509Certificate leaf = (X509Certificate) chain[0];
            Attestation att = Attestation.loadFromCertificate(leaf);
            RootOfTrust rot = att.getRootOfTrust();
            if (rot != null) {
                return rot.verifiedBootHashHex();
            }
        } catch (Throwable ignored) {
        } finally {
            if (keyStore != null) {
                try {
                    if (keyStore.containsAlias(ALIAS)) {
                        keyStore.deleteEntry(ALIAS);
                    }
                } catch (Throwable ignored) {}
            }
        }
        return null;
    }

    private static boolean isAllZero(String hex) {
        if (hex == null || hex.isEmpty()) return true;
        for (int i = 0; i < hex.length(); i++) {
            if (hex.charAt(i) != '0') return false;
        }
        return true;
    }
}
