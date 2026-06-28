package com.dpejoh.specter.attestation;

import java.util.Date;
import java.util.List;
import java.util.Set;

class CborUtils {

    static int getInt(MinimalCbor.CborMap map, long key) {
        return (int) map.getInt(key);
    }

    static Set<Integer> getIntSet(MinimalCbor.CborMap map, long key) {
        throw new UnsupportedOperationException("CBOR int sets not used in current code path");
    }

    static boolean getBoolean(MinimalCbor.CborMap map, long key) {
        return map.getBoolean(key);
    }

    static List<Boolean> getBooleanList(MinimalCbor.CborMap map, long key) {
        return map.getBoolArray(key);
    }

    static byte[] getBytes(MinimalCbor.CborMap map, long key) {
        return map.getBytes(key);
    }

    static MinimalCbor.CborMap decodeCbor(byte[] encodedBytes) {
        return MinimalCbor.parseMap(encodedBytes);
    }
}
