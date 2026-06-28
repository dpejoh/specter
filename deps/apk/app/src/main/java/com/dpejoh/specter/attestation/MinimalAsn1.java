package com.dpejoh.specter.attestation;

import java.util.ArrayList;
import java.util.List;

class MinimalAsn1 {

    static final int TAG_SEQUENCE = 0x30;
    static final int TAG_INTEGER = 0x02;
    static final int TAG_OCTET_STRING = 0x04;
    static final int TAG_BOOLEAN = 0x01;
    static final int TAG_ENUMERATED = 0x0A;

    static class Tlv {
        final int firstByte;
        final int tagNumber;
        final byte[] value;
        final List<Tlv> children;

        Tlv(int firstByte, int tagNumber, byte[] value, List<Tlv> children) {
            this.firstByte = firstByte;
            this.tagNumber = tagNumber;
            this.value = value;
            this.children = children;
        }

        boolean isContextual() {
            return (firstByte & 0xC0) == 0x80;
        }

        int contextualTagNo() {
            return tagNumber;
        }
    }

    static List<Tlv> parseSequence(byte[] data) {
        Tlv outer = parse(data, 0);
        if (outer.firstByte != TAG_SEQUENCE) {
            throw new IllegalArgumentException("Expected SEQUENCE");
        }
        return outer.children;
    }

    static Tlv parse(byte[] data) {
        return parse(data, 0);
    }

    static Tlv parse(byte[] data, int offset) {
        int pos = offset;
        int firstByte = data[pos++] & 0xFF;
        int tagNumber;
        if ((firstByte & 0x1F) == 0x1F) {
            tagNumber = 0;
            int b;
            do {
                b = data[pos++] & 0xFF;
                tagNumber = (tagNumber << 7) | (b & 0x7F);
            } while ((b & 0x80) != 0);
        } else {
            tagNumber = firstByte & 0x1F;
        }

        int lenStart = pos;
        int len = readLength(data, pos);
        pos += lengthBytesConsumed(data, lenStart);
        if (len == -1) {
            throw new IllegalArgumentException("Indefinite length not supported");
        }
        int valueStart = pos;
        byte[] value = new byte[len];
        System.arraycopy(data, valueStart, value, 0, len);
        pos += len;

        List<Tlv> children = null;
        if ((firstByte & 0x20) != 0) {
            children = new ArrayList<>();
            int innerOff = 0;
            while (innerOff < len) {
                Tlv child = parse(value, innerOff);
                children.add(child);
                innerOff += totalEncodedLength(child);
            }
        }
        return new Tlv(firstByte, tagNumber, value, children);
    }

    private static int totalEncodedLength(Tlv tlv) {
        int size = 1; // first byte
        // tag bytes beyond first
        if ((tlv.firstByte & 0x1F) == 0x1F) {
            int tn = tlv.tagNumber;
            int extra = 0;
            do { tn >>= 7; extra++; } while (tn > 0);
            size += extra;
        }
        // length bytes
        int len = tlv.value.length;
        if (len < 0x80) {
            size += 1;
        } else {
            int lenBytes = 1;
            int tmp = len;
            while (tmp > 0) { tmp >>= 8; lenBytes++; }
            size += lenBytes;
        }
        size += len;
        return size;
    }

    private static int lengthBytesConsumed(byte[] data, int pos) {
        int b = data[pos] & 0xFF;
        if (b < 0x80) return 1;
        if (b == 0x80) return 1;
        return 1 + (b & 0x7F);
    }

    private static int readLength(byte[] data, int pos) {
        int b = data[pos] & 0xFF;
        if (b < 0x80) return b;
        if (b == 0x80) return -1; // indefinite
        int count = b & 0x7F;
        int len = 0;
        for (int i = 0; i < count; i++) {
            len = (len << 8) | (data[pos + 1 + i] & 0xFF);
        }
        return len;
    }

    static byte[] unwrapOctetStringBytes(byte[] data) {
        Tlv outer = parse(data, 0);
        return getOctetString(outer);
    }

    static List<Tlv> unwrapSequence(byte[] data) {
        byte[] inner = unwrapOctetStringBytes(data);
        return parseSequence(inner);
    }

    static Tlv unwrapOctetStringTlv(byte[] data) {
        return parse(data, 0);
    }

    static int getInt(Tlv tlv) {
        return (int) getLong(tlv);
    }

    static long getLong(Tlv tlv) {
        if ((tlv.firstByte & 0xDF) != 0x02 && (tlv.firstByte & 0xDF) != 0x0A) {
            throw new IllegalArgumentException("Expected INTEGER/ENUMERATED");
        }
        if (tlv.value.length == 0) return 0;
        long val = 0;
        for (byte b : tlv.value) {
            val = (val << 8) | (b & 0xFF);
        }
        return val;
    }

    static byte[] getOctetString(Tlv tlv) {
        if (tlv.firstByte != TAG_OCTET_STRING) {
            throw new IllegalArgumentException("Expected OCTET STRING");
        }
        return tlv.value;
    }

    static boolean getBoolean(Tlv tlv) {
        if (tlv.firstByte != TAG_BOOLEAN) {
            throw new IllegalArgumentException("Expected BOOLEAN");
        }
        return tlv.value[0] != 0;
    }
}
