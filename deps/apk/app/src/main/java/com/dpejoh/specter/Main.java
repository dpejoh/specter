package com.dpejoh.specter;

import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;

import com.dpejoh.specter.attestation.Attestation;
import com.dpejoh.specter.attestation.RootOfTrust;

public class Main {

    private static final String TAG = "Specter";
    private static final String ALIAS = "specter_tee_check";

    public static void main(String[] args) {
        String specterDir = "/data/adb/specter";
        if (args.length > 0) specterDir = args[0];

        prepareEnvironment();
        runAttestationCheck(specterDir);
    }

    private static void runAttestationCheck(String specterDir) {
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (keyStore.containsAlias(ALIAS)) keyStore.deleteEntry(ALIAS);

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
            keyStore.deleteEntry(ALIAS);
            if (chain == null || chain.length == 0) {
                Log.w(TAG, "Empty certificate chain");
                writeFailure(specterDir);
                return;
            }

            X509Certificate leaf = (X509Certificate) chain[0];
            Attestation att = Attestation.loadFromCertificate(leaf);
            RootOfTrust root = att.getRootOfTrust();

            writeResults(specterDir, att, root, challenge);
        } catch (Exception e) {
            Log.w(TAG, "Full attestation failed", e);
            writeFailure(specterDir);
        }
    }

    private static void writeResults(
            String dir, Attestation att, RootOfTrust root, byte[] challenge
    ) {
        try {
            new File(dir).mkdirs();

            String hash = root != null ? root.verifiedBootHashHex() : null;
            int tier = att.getAttestationSecurityLevel();
            int keymasterVersion = att.getKeymasterVersion();
            boolean challengeVerified = challenge != null
                    && att.getAttestationChallenge() != null
                    && Arrays.equals(challenge, att.getAttestationChallenge());
            boolean teeBroken = hash == null;

            writeFile(new File(dir, "tee_status"),
                    "tee_broken=" + teeBroken + "\n" +
                    "challenge_verified=" + challengeVerified + "\n");

            if (hash != null) {
                writeFile(new File(dir, "tee_hash"), hash + "\n");
            }

            writeFile(new File(dir, "tee_tier"), tier + "\n");
            writeFile(new File(dir, "tee_keymaster_version"), keymasterVersion + "\n");
            writeFile(new File(dir, "tee_challenge"),
                    "challenge_verified=" + challengeVerified + "\n");

            File vbmeta = new File(dir, "vbmeta_digest");
            if (hash != null && !vbmeta.exists()) {
                writeFile(vbmeta, hash + "\n");
            }

            Log.i(TAG, "TEE status: " + (teeBroken ? "broken" : "normal") +
                    ", tier=" + tier +
                    ", kmVer=" + keymasterVersion +
                    ", challengeOk=" + challengeVerified);
            if (hash != null) Log.i(TAG, "Boot hash: " + hash);

        } catch (Exception e) {
            Log.e(TAG, "Failed to write status files", e);
        }
    }

    private static void writeFailure(String dir) {
        try {
            new File(dir).mkdirs();
            writeFile(new File(dir, "tee_status"),
                    "tee_broken=true\nchallenge_verified=false\n");
            Log.w(TAG, "TEE status: broken");
        } catch (Exception e) {
            Log.e(TAG, "Failed to write failure status", e);
        }
    }

    private static void writeFile(File file, String content) throws Exception {
        try (OutputStreamWriter w = new OutputStreamWriter(
                new FileOutputStream(file), StandardCharsets.UTF_8)) {
            w.write(content);
        }
    }

    private static void prepareEnvironment() {
        try {
            if (Looper.getMainLooper() == null) Looper.prepareMainLooper();
            Class<?> atClass = Class.forName("android.app.ActivityThread");
            Object at = atClass.getMethod("systemMain").invoke(null);
            Object ctx = atClass.getMethod("getSystemContext").invoke(at);
            Object app = Class.forName("android.app.Application").getDeclaredConstructor().newInstance();
            Method attach = Class.forName("android.content.ContextWrapper")
                    .getDeclaredMethod("attachBaseContext", Class.forName("android.content.Context"));
            attach.setAccessible(true);
            attach.invoke(app, ctx);
            Field f = atClass.getDeclaredField("mInitialApplication");
            f.setAccessible(true);
            f.set(at, app);
            Class.forName("android.security.keystore2.AndroidKeyStoreProvider")
                    .getMethod("install").invoke(null);
        } catch (Exception e) {
            Log.w(TAG, "Environment setup failed", e);
        }
    }
}
