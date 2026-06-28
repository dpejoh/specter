package com.dpejoh.specter.attestation;

import java.util.List;

class Asn1Utils {

    static int getIntegerFromAsn1(MinimalAsn1.Tlv tlv) {
        return MinimalAsn1.getInt(tlv);
    }

    static long getLongFromAsn1(MinimalAsn1.Tlv tlv) {
        return MinimalAsn1.getLong(tlv);
    }

    static byte[] getByteArrayFromAsn1(MinimalAsn1.Tlv tlv) {
        return MinimalAsn1.getOctetString(tlv);
    }

    static boolean getBooleanFromAsn1(MinimalAsn1.Tlv tlv) {
        return MinimalAsn1.getBoolean(tlv);
    }

    static List<MinimalAsn1.Tlv> getAsn1SequenceFromBytes(byte[] bytes) {
        return MinimalAsn1.unwrapSequence(bytes);
    }

    static MinimalAsn1.Tlv getAsn1EncodableFromBytes(byte[] bytes) {
        return MinimalAsn1.unwrapOctetStringTlv(bytes);
    }
}
