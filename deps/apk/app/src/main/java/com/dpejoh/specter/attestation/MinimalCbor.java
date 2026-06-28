package com.dpejoh.specter.attestation;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

class MinimalCbor {

    static final int MT_UNSIGNED = 0;
    static final int MT_NEGATIVE = 1;
    static final int MT_BYTES = 2;
    static final int MT_TEXT = 3;
    static final int MT_ARRAY = 4;
    static final int MT_MAP = 5;
    static final int MT_SIMPLE = 7;

    private final byte[] data;
    private int offset;

    MinimalCbor(byte[] data) {
        this.data = data;
        this.offset = 0;
    }

    static CborMap parseMap(byte[] data) {
        MinimalCbor parser = new MinimalCbor(data);
        return parser.readMap();
    }

    private long readInt() {
        int ib = data[offset++] & 0xFF;
        int major = ib >> 5;
        int info = ib & 0x1F;
        long value = readArg(info);
        return major == MT_NEGATIVE ? -1 - value : value;
    }

    private long readArg(int info) {
        if (info <= 23) return info;
        long val = 0;
        int n = 1 << (info - 24);
        for (int i = 0; i < n; i++) {
            val = (val << 8) | (data[offset++] & 0xFF);
        }
        return val;
    }

    private byte[] readBytes() {
        int ib = data[offset++] & 0xFF;
        int major = ib >> 5;
        int info = ib & 0x1F;
        long len = readArg(info);
        byte[] bytes = new byte[(int) len];
        System.arraycopy(data, offset, bytes, 0, bytes.length);
        offset += bytes.length;
        return bytes;
    }

    private boolean readBool() {
        int ib = data[offset++] & 0xFF;
        if (ib == 0xF4) return false;
        if (ib == 0xF5) return true;
        throw new IllegalArgumentException("Expected boolean, got 0x" + Integer.toHexString(ib));
    }

    private List<Boolean> readBoolArray() {
        long count = readArrayHeader();
        List<Boolean> list = new ArrayList<>((int) count);
        for (int i = 0; i < count; i++) {
            list.add(readBool());
        }
        return list;
    }

    private long readArrayHeader() {
        int ib = data[offset++] & 0xFF;
        int info = ib & 0x1F;
        return readArg(info);
    }

    private Object readValue() {
        int ib = data[offset] & 0xFF;
        int major = ib >> 5;
        switch (major) {
            case MT_UNSIGNED:
            case MT_NEGATIVE:
                return readInt();
            case MT_BYTES:
            case MT_TEXT:
                return readBytes();
            case MT_ARRAY: {
                int saved = offset;
                long count = readArrayHeader();
                if (offset < data.length) {
                    int peek = data[offset] & 0xFF;
                    if ((peek >> 5) == MT_SIMPLE && (peek == 0xF4 || peek == 0xF5)) {
                        offset = saved;
                        return readBoolArray();
                    }
                }
                offset = saved;
                return readMap();
            }
            case MT_MAP:
                return readMap();
            case MT_SIMPLE:
                return readBool();
            default:
                throw new IllegalArgumentException("Unsupported major type " + major);
        }
    }

    CborMap readMap() {
        int ib = data[offset++] & 0xFF;
        int info = ib & 0x1F;
        long count = readArg(info);
        CborMap map = new CborMap();
        for (long i = 0; i < count; i++) {
            int keyStart = offset;
            Object key = readValue();
            Object val = readValue();
            if (key instanceof Long) {
                map.putLong((Long) key, val);
            } else if (key instanceof byte[]) {
                map.putString(new String((byte[]) key, java.nio.charset.StandardCharsets.UTF_8), val);
            }
        }
        return map;
    }

    static class CborMap {
        private final Map<Long, Object> longMap = new LinkedHashMap<>();
        private final Map<String, Object> strMap = new LinkedHashMap<>();

        void putLong(long key, Object val) { longMap.put(key, val); }
        void putString(String key, Object val) { strMap.put(key, val); }

        boolean has(long key) { return longMap.containsKey(key); }

        long getInt(long key) { return (Long) longMap.get(key); }
        byte[] getBytes(long key) { return (byte[]) longMap.get(key); }
        boolean getBoolean(long key) { return (Boolean) longMap.get(key); }
        @SuppressWarnings("unchecked")
        List<Boolean> getBoolArray(long key) { return (List<Boolean>) longMap.get(key); }
        CborMap getMap(long key) { return (CborMap) longMap.get(key); }

        CborMap getMap(String key) { return (CborMap) strMap.get(key); }

        Iterable<Map.Entry<Long, Object>> getEntries() {
            return longMap.entrySet();
        }
    }
}
