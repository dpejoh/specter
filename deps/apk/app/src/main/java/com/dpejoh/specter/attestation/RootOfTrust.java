package com.dpejoh.specter.attestation;

import java.util.List;

public class RootOfTrust {
    public static final int KM_VERIFIED_BOOT_VERIFIED = 0;
    public static final int KM_VERIFIED_BOOT_SELF_SIGNED = 1;
    public static final int KM_VERIFIED_BOOT_UNVERIFIED = 2;
    public static final int KM_VERIFIED_BOOT_FAILED = 3;

    private final byte[] verifiedBootKey;
    private final boolean deviceLocked;
    private final int verifiedBootState;
    private final byte[] verifiedBootHash;

    private RootOfTrust(byte[] verifiedBootKey, boolean deviceLocked, int verifiedBootState, byte[] verifiedBootHash) {
        this.verifiedBootKey = verifiedBootKey;
        this.deviceLocked = deviceLocked;
        this.verifiedBootState = verifiedBootState;
        this.verifiedBootHash = verifiedBootHash;
    }

    RootOfTrust(MinimalAsn1.Tlv seqTlv) {
        List<MinimalAsn1.Tlv> fields = seqTlv.children;
        verifiedBootKey = Asn1Utils.getByteArrayFromAsn1(fields.get(0));
        deviceLocked = Asn1Utils.getBooleanFromAsn1(fields.get(1));
        verifiedBootState = Asn1Utils.getIntegerFromAsn1(fields.get(2));
        if (fields.size() > 3) {
            verifiedBootHash = Asn1Utils.getByteArrayFromAsn1(fields.get(3));
        } else {
            verifiedBootHash = null;
        }
    }

    public byte[] getVerifiedBootKey() { return verifiedBootKey; }
    public boolean isDeviceLocked() { return deviceLocked; }
    public int getVerifiedBootState() { return verifiedBootState; }
    public byte[] getVerifiedBootHash() { return verifiedBootHash; }

    public String verifiedBootHashHex() {
        if (verifiedBootHash == null) return null;
        StringBuilder sb = new StringBuilder(verifiedBootHash.length * 2);
        for (byte b : verifiedBootHash) {
            sb.append("0123456789abcdef".charAt((b >> 4) & 0xf));
            sb.append("0123456789abcdef".charAt(b & 0xf));
        }
        return sb.toString();
    }

    public static String verifiedBootStateToString(int state) {
        return switch (state) {
            case KM_VERIFIED_BOOT_VERIFIED -> "Verified";
            case KM_VERIFIED_BOOT_SELF_SIGNED -> "SelfSigned";
            case KM_VERIFIED_BOOT_UNVERIFIED -> "Unverified";
            case KM_VERIFIED_BOOT_FAILED -> "Failed";
            default -> "Unknown(" + state + ")";
        };
    }

    public static class Builder {
        private byte[] verifiedBootKey;
        private boolean deviceLocked;
        private int verifiedBootState;
        private byte[] verifiedBootHash;

        public Builder() {}

        public Builder setVerifiedBootKey(byte[] key) { this.verifiedBootKey = key; return this; }
        public Builder setDeviceLocked(boolean locked) { this.deviceLocked = locked; return this; }
        public Builder setVerifiedBootState(int state) { this.verifiedBootState = state; return this; }
        public Builder setVerifiedBootHash(byte[] hash) { this.verifiedBootHash = hash; return this; }

        public RootOfTrust build() {
            return new RootOfTrust(verifiedBootKey, deviceLocked, verifiedBootState, verifiedBootHash);
        }
    }
}
