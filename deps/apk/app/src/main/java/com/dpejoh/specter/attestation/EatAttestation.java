package com.dpejoh.specter.attestation;

import android.util.Log;

import java.security.cert.CertificateParsingException;
import java.security.cert.X509Certificate;
import java.util.List;

public class EatAttestation extends Attestation {
    private static final String TAG = "EatAttestation";

    private final int attestationSecurityLevel;
    private final RootOfTrust rootOfTrust;

    public EatAttestation(X509Certificate cert) throws CertificateParsingException {
        super();
        MinimalCbor.CborMap extension = getEatExtension(cert);

        RootOfTrust.Builder rootOfTrustBuilder = new RootOfTrust.Builder();
        List<Boolean> bootState = null;
        boolean officialBuild = false;

        for (java.util.Map.Entry<Long, Object> entry : extension.getEntries()) {
            long key = entry.getKey();
            switch ((int) key) {
                default:
                    Log.w(TAG, "Unknown EAT tag: " + key);
                    continue;

                case EatClaim.ATTESTATION_VERSION:
                    attestationVersion = (int) extension.getInt(key);
                    break;
                case EatClaim.KEYMASTER_VERSION:
                    keymasterVersion = (int) extension.getInt(key);
                    break;
                case EatClaim.SECURITY_LEVEL:
                    keymasterSecurityLevel =
                            eatSecurityLevelToKeymintSecurityLevel(
                                    (int) extension.getInt(key));
                    break;
                case EatClaim.SUBMODS:
                    MinimalCbor.CborMap submods = extension.getMap(key);
                    if (submods != null) {
                        softwareEnforced = new AuthorizationList(submods.getMap(EatClaim.SUBMOD_SOFTWARE));
                        teeEnforced = new AuthorizationList(submods.getMap(EatClaim.SUBMOD_TEE));
                    }
                    break;
                case EatClaim.VERIFIED_BOOT_KEY:
                    rootOfTrustBuilder.setVerifiedBootKey(extension.getBytes(key));
                    break;
                case EatClaim.DEVICE_LOCKED:
                    rootOfTrustBuilder.setDeviceLocked(extension.getBoolean(key));
                    break;
                case EatClaim.BOOT_STATE:
                    bootState = extension.getBoolArray(key);
                    break;
                case EatClaim.OFFICIAL_BUILD:
                    officialBuild = extension.getBoolean(key);
                    break;
                case EatClaim.NONCE:
                    attestationChallenge = extension.getBytes(key);
                    break;
                case EatClaim.CTI:
                    uniqueId = extension.getBytes(key);
                    break;
                case EatClaim.VERIFIED_BOOT_HASH:
                    rootOfTrustBuilder.setVerifiedBootHash(extension.getBytes(key));
                    break;
            }
        }

        if (bootState != null) {
            rootOfTrustBuilder.setVerifiedBootState(
                    eatBootStateTypeToVerifiedBootState(bootState, officialBuild));
        }
        rootOfTrust = rootOfTrustBuilder.build();

        if (teeEnforced != null && teeEnforced.getAlgorithm() != null) {
            attestationSecurityLevel = keymasterSecurityLevel;
        } else if (softwareEnforced != null && softwareEnforced.getAlgorithm() != null) {
            attestationSecurityLevel = KM_SECURITY_LEVEL_SOFTWARE;
        } else {
            attestationSecurityLevel = -1;
        }
    }

    @Override
    public int getAttestationSecurityLevel() {
        return attestationSecurityLevel;
    }

    @Override
    public RootOfTrust getRootOfTrust() {
        return rootOfTrust;
    }

    private MinimalCbor.CborMap getEatExtension(X509Certificate cert) throws CertificateParsingException {
        byte[] extBytes = cert.getExtensionValue(Attestation.EAT_OID);
        if (extBytes == null || extBytes.length == 0) {
            throw new CertificateParsingException("No EAT extension found");
        }
        MinimalAsn1.Tlv asn1 = Asn1Utils.getAsn1EncodableFromBytes(extBytes);
        byte[] cborBytes = Asn1Utils.getByteArrayFromAsn1(asn1);
        return CborUtils.decodeCbor(cborBytes);
    }

    static int eatSecurityLevelToKeymintSecurityLevel(int eatSecurityLevel) {
        switch (eatSecurityLevel) {
            case EatClaim.SECURITY_LEVEL_UNRESTRICTED:
                return Attestation.KM_SECURITY_LEVEL_SOFTWARE;
            case EatClaim.SECURITY_LEVEL_SECURE_RESTRICTED:
                return Attestation.KM_SECURITY_LEVEL_TEE;
            case EatClaim.SECURITY_LEVEL_HARDWARE:
                return Attestation.KM_SECURITY_LEVEL_STRONG_BOX;
            default:
                throw new RuntimeException("Invalid EAT security level: " + eatSecurityLevel);
        }
    }

    static int eatBootStateTypeToVerifiedBootState(List<Boolean> bootState, Boolean officialBuild) {
        if (bootState.size() != 5) {
            throw new RuntimeException("Boot state map has unexpected size: " + bootState.size());
        }
        if (bootState.get(4)) {
            throw new RuntimeException("debug-permanent-disable must never be true");
        }
        boolean verifiedOrSelfSigned = bootState.get(0);
        if (officialBuild) {
            if (!verifiedOrSelfSigned) {
                throw new RuntimeException("Non-verified official build");
            }
            return RootOfTrust.KM_VERIFIED_BOOT_VERIFIED;
        } else {
            return verifiedOrSelfSigned
                    ? RootOfTrust.KM_VERIFIED_BOOT_SELF_SIGNED
                    : RootOfTrust.KM_VERIFIED_BOOT_UNVERIFIED;
        }
    }
}
