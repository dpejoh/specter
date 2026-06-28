package com.dpejoh.specter.attestation;

import java.util.Set;

public class AuthorizationList {
    public static final int KEYMASTER_TAG_TYPE_MASK = 0x0FFFFFFF;

    public static final int KM_TAG_PURPOSE = 1;
    public static final int KM_TAG_ALGORITHM = 2;
    public static final int KM_TAG_KEY_SIZE = 3;
    public static final int KM_TAG_BLOCK_MODE = 4;
    public static final int KM_TAG_DIGEST = 5;
    public static final int KM_TAG_PADDING = 6;
    public static final int KM_TAG_CALLER_NONCE = 7;
    public static final int KM_TAG_MIN_MAC_LENGTH = 8;
    public static final int KM_TAG_KDF = 9;
    public static final int KM_TAG_EC_CURVE = 10;
    public static final int KM_TAG_RSA_PUBLIC_EXPONENT = 200;
    public static final int KM_TAG_RSA_OAEP_MGF_DIGEST = 201;
    public static final int KM_TAG_ROLLBACK_RESISTANCE = 303;
    public static final int KM_TAG_EARLY_BOOT_ONLY = 304;
    public static final int KM_TAG_ACTIVE_DATETIME = 400;
    public static final int KM_TAG_ORIGINATION_EXPIRE_DATETIME = 401;
    public static final int KM_TAG_USAGE_EXPIRE_DATETIME = 402;
    public static final int KM_TAG_NO_AUTH_REQUIRED = 503;
    public static final int KM_TAG_USER_AUTH_TYPE = 504;
    public static final int KM_TAG_AUTH_TIMEOUT = 505;
    public static final int KM_TAG_ALLOW_WHILE_ON_BODY = 506;
    public static final int KM_TAG_TRUSTED_USER_PRESENCE_REQUIRED = 507;
    public static final int KM_TAG_TRUSTED_CONFIRMATION_REQUIRED = 508;
    public static final int KM_TAG_UNLOCKED_DEVICE_REQUIRED = 509;
    public static final int KM_TAG_APPLICATION_ID = 601;
    public static final int KM_TAG_ATTESTATION_APPLICATION_ID = 602;
    public static final int KM_TAG_ORIGIN = 702;
    public static final int KM_TAG_ROLLBACK_RESISTANT = 703;
    public static final int KM_TAG_ROOT_OF_TRUST = 704;
    public static final int KM_TAG_OS_VERSION = 705;
    public static final int KM_TAG_OS_PATCHLEVEL = 706;
    public static final int KM_TAG_ATTESTATION_ID_BRAND = 710;
    public static final int KM_TAG_ATTESTATION_ID_DEVICE = 711;
    public static final int KM_TAG_ATTESTATION_ID_PRODUCT = 712;
    public static final int KM_TAG_ATTESTATION_ID_SERIAL = 713;
    public static final int KM_TAG_ATTESTATION_ID_MEID = 714;
    public static final int KM_TAG_ATTESTATION_ID_MANUFACTURER = 715;
    public static final int KM_TAG_ATTESTATION_ID_MODEL = 716;
    public static final int KM_TAG_VENDOR_PATCHLEVEL = 718;
    public static final int KM_TAG_BOOT_PATCHLEVEL = 719;
    public static final int KM_TAG_DEVICE_UNIQUE_ATTESTATION = 780;
    public static final int KM_TAG_IDENTITY_CREDENTIAL_KEY = 781;

    private RootOfTrust rootOfTrust;
    private Integer algorithm;
    private Set<Integer> purpose;

    AuthorizationList(MinimalAsn1.Tlv seqTlv) {
        if (seqTlv.children == null) return;
        for (MinimalAsn1.Tlv child : seqTlv.children) {
            if (!child.isContextual()) continue;
            int tagNo = child.contextualTagNo();
            MinimalAsn1.Tlv inner = child.children != null && !child.children.isEmpty()
                    ? child.children.get(0) : null;
            if (inner == null) continue;

            switch (tagNo) {
                case KM_TAG_PURPOSE:
                    if (inner.children != null) {
                        java.util.LinkedHashSet<Integer> s = new java.util.LinkedHashSet<>();
                        for (MinimalAsn1.Tlv item : inner.children) {
                            s.add(MinimalAsn1.getInt(item));
                        }
                        purpose = s;
                    }
                    break;
                case KM_TAG_ALGORITHM:
                    algorithm = MinimalAsn1.getInt(inner);
                    break;
                case KM_TAG_ROOT_OF_TRUST:
                    rootOfTrust = new RootOfTrust(inner);
                    break;
            }
        }
    }

    AuthorizationList(MinimalCbor.CborMap map) {
        if (map == null) return;
        if (map.has(KM_TAG_ALGORITHM)) {
            algorithm = (int) map.getInt(KM_TAG_ALGORITHM);
        }
    }

    public RootOfTrust getRootOfTrust() {
        return rootOfTrust;
    }

    public Integer getAlgorithm() {
        return algorithm;
    }

    public Set<Integer> getPurpose() {
        return purpose;
    }
}
