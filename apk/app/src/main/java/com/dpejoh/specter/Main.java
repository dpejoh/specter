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

public class Main {

    private static final String TAG = "Specter";
    private static final String ALIAS = "specter_tee_check";
    private static final String ATTESTATION_OID = "1.3.6.1.4.1.11129.2.1.17";

    // ASN.1 tag constants matching TEESimulator's AttestationConstants
    private static final int KEY_DESCRIPTION_TEE_ENFORCED_INDEX = 7;
    private static final int ROOT_OF_TRUST_VERIFIED_BOOT_HASH_INDEX = 3;
    private static final int TAG_ROOT_OF_TRUST = 704;

    public static void main(String[] args) {
        String specterDir = "/data/adb/specter";
        if (args.length > 0) specterDir = args[0];

        prepareEnvironment();

        String hash = runAttestationCheck();

        boolean teeFunctional = hash != null;
        Log.i(TAG, "TEE status: " + (teeFunctional ? "normal" : "broken"));
        if (hash != null) Log.i(TAG, "Boot hash: " + hash);

        try {
            new File(specterDir).mkdirs();
            try (OutputStreamWriter w = new OutputStreamWriter(
                    new FileOutputStream(new File(specterDir, "tee_status")), StandardCharsets.UTF_8)) {
                w.write("tee_broken=" + !teeFunctional + "\n");
            }
            if (hash != null) {
                try (OutputStreamWriter w = new OutputStreamWriter(
                        new FileOutputStream(new File(specterDir, "tee_hash")), StandardCharsets.UTF_8)) {
                    w.write(hash + "\n");
                }
                File vbmeta = new File(specterDir, "vbmeta_digest");
                if (!vbmeta.exists()) {
                    try (OutputStreamWriter w = new OutputStreamWriter(
                            new FileOutputStream(vbmeta), StandardCharsets.UTF_8)) {
                        w.write(hash + "\n");
                    }
                }
            }
            Log.i(TAG, "Results written to " + specterDir);
        } catch (Exception e) {
            Log.e(TAG, "Failed to write status files", e);
        }
    }

    private static String runAttestationCheck() {
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
                return null;
            }

            byte[] ext = ((X509Certificate) chain[0]).getExtensionValue(ATTESTATION_OID);
            if (ext == null) {
                Log.w(TAG, "No attestation extension");
                return null;
            }

            return parseBootHash(ext);
        } catch (Exception e) {
            Log.w(TAG, "Full attestation failed", e);
            return null;
        }
    }

    private static String parseBootHash(byte[] ext) {
        try {
            DerReader r = new DerReader(ext);
            byte[] keyDesc = r.read().value;            // unwrap OCTET STRING
            byte[] fields = r.read(keyDesc).value;       // KeyDescription SEQUENCE

            r = new DerReader(fields);
            int idx = 0;
            while (true) {
                DerTlv f = r.read();
                if (f == null) break;
                if (idx == KEY_DESCRIPTION_TEE_ENFORCED_INDEX) {
                    DerReader tee = new DerReader(f.value);
                    while (true) {
                        DerTlv t = tee.read();
                        if (t == null) break;
                        if (t.tag == TAG_ROOT_OF_TRUST) {
                            byte[] rotSeq = tee.read(t.value).value;
                            DerReader rot = new DerReader(rotSeq);
                            for (int i = 0; i <= ROOT_OF_TRUST_VERIFIED_BOOT_HASH_INDEX; i++) {
                                DerTlv rf = rot.read();
                                if (rf == null) return null;
                                if (i == ROOT_OF_TRUST_VERIFIED_BOOT_HASH_INDEX) {
                                    return bytesToHex(rf.value);
                                }
                            }
                        }
                    }
                }
                idx++;
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to parse boot hash", e);
        }
        return null;
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes)
            sb.append("0123456789abcdef".charAt((b >> 4) & 0xf))
              .append("0123456789abcdef".charAt(b & 0xf));
        return sb.toString();
    }

    private static class DerTlv {
        final int tag;
        final byte[] value;
        DerTlv(int tag, byte[] value) { this.tag = tag; this.value = value; }
    }

    private static class DerReader {
        private final byte[] data;
        private int pos;

        DerReader(byte[] data) { this.data = data; }

        DerTlv read() {
            if (pos >= data.length) return null;
            int tag = data[pos++] & 0xFF;
            int tagNum = tag & 0x1F;
            if (tagNum == 0x1F) tagNum = readTagNumber();
            int len = readLength();
            if (len < 0 || pos + len > data.length) return null;
            byte[] val = new byte[len];
            System.arraycopy(data, pos, val, 0, len);
            pos += len;
            return new DerTlv(tagNum, val);
        }

        DerTlv read(byte[] value) { return new DerReader(value).read(); }

        private int readTagNumber() {
            int num = 0;
            while (pos < data.length) {
                int b = data[pos++] & 0xFF;
                num = (num << 7) | (b & 0x7F);
                if ((b & 0x80) == 0) break;
            }
            return num;
        }

        private int readLength() {
            if (pos >= data.length) return -1;
            int b = data[pos++] & 0xFF;
            if (b < 0x80) return b;
            int numBytes = b & 0x7F;
            if (numBytes == 0 || pos + numBytes > data.length) return -1;
            int len = 0;
            for (int i = 0; i < numBytes; i++)
                len = (len << 8) | (data[pos++] & 0xFF);
            return len;
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
