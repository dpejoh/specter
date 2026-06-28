package com.dpejoh.specter;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Log;

import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.ECGenParameterSpec;
import java.util.Date;

import javax.security.auth.x500.X500Principal;

import com.dpejoh.specter.attestation.Attestation;
import com.dpejoh.specter.attestation.RootOfTrust;

public class AttestationHelper {
    private static final String TAG = "Specter";
    private static final String ALIAS = "specter_key";

    private RootOfTrust rootOfTrust;
    private boolean attestationSuccess;

    public boolean doAttestation() {
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);

            if (keyStore.containsAlias(ALIAS)) {
                keyStore.deleteEntry(ALIAS);
            }

            KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                    ALIAS, KeyProperties.PURPOSE_SIGN)
                    .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setCertificateSubject(new X500Principal("CN=Specter"))
                    .setCertificateNotBefore(new Date())
                    .setAttestationChallenge(new Date().toString().getBytes())
                    .build();

            KeyPairGenerator kpg = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
            kpg.initialize(spec);
            kpg.generateKeyPair();

            java.security.cert.Certificate[] chain = keyStore.getCertificateChain(ALIAS);
            if (chain == null || chain.length == 0) {
                Log.e(TAG, "Empty certificate chain");
                return false;
            }

            X509Certificate leaf = (X509Certificate) chain[0];

            Attestation att = Attestation.loadFromCertificate(leaf);
            rootOfTrust = att.getRootOfTrust();
            attestationSuccess = true;
            return true;

        } catch (Exception e) {
            Log.e(TAG, "Attestation failed", e);
            attestationSuccess = false;
            rootOfTrust = null;
            return false;
        }
    }

    public boolean isAttestationNormal() {
        return attestationSuccess;
    }

    public String getVerifiedBootHashHex() {
        if (rootOfTrust == null) return null;
        return rootOfTrust.verifiedBootHashHex();
    }

    public String getVerifiedBootState() {
        if (rootOfTrust == null) return null;
        return RootOfTrust.verifiedBootStateToString(rootOfTrust.getVerifiedBootState());
    }

    public Boolean isDeviceLocked() {
        if (rootOfTrust == null) return null;
        return rootOfTrust.isDeviceLocked();
    }
}
