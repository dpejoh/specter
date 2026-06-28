package com.dpejoh.specter.attestation;

import java.security.cert.CertificateParsingException;
import java.security.cert.X509Certificate;
import java.util.List;

public class Asn1Attestation extends Attestation {
    private static final int ATTESTATION_VERSION_INDEX = 0;
    private static final int ATTESTATION_SECURITY_LEVEL_INDEX = 1;
    private static final int KEYMASTER_VERSION_INDEX = 2;
    private static final int KEYMASTER_SECURITY_LEVEL_INDEX = 3;
    private static final int ATTESTATION_CHALLENGE_INDEX = 4;
    private static final int UNIQUE_ID_INDEX = 5;
    private static final int SW_ENFORCED_INDEX = 6;
    private static final int TEE_ENFORCED_INDEX = 7;

    private int attestationSecurityLevel;

    public Asn1Attestation(X509Certificate cert) throws CertificateParsingException {
        super();
        byte[] extBytes = cert.getExtensionValue(Attestation.ASN1_OID);
        if (extBytes == null || extBytes.length == 0) {
            throw new CertificateParsingException("No ASN.1 attestation extension found");
        }
        List<MinimalAsn1.Tlv> seq = Asn1Utils.getAsn1SequenceFromBytes(extBytes);

        attestationVersion = Asn1Utils.getIntegerFromAsn1(seq.get(ATTESTATION_VERSION_INDEX));
        attestationSecurityLevel = Asn1Utils.getIntegerFromAsn1(seq.get(ATTESTATION_SECURITY_LEVEL_INDEX));
        keymasterVersion = Asn1Utils.getIntegerFromAsn1(seq.get(KEYMASTER_VERSION_INDEX));
        keymasterSecurityLevel = Asn1Utils.getIntegerFromAsn1(seq.get(KEYMASTER_SECURITY_LEVEL_INDEX));
        attestationChallenge = Asn1Utils.getByteArrayFromAsn1(seq.get(ATTESTATION_CHALLENGE_INDEX));
        uniqueId = Asn1Utils.getByteArrayFromAsn1(seq.get(UNIQUE_ID_INDEX));
        softwareEnforced = new AuthorizationList(seq.get(SW_ENFORCED_INDEX));
        teeEnforced = new AuthorizationList(seq.get(TEE_ENFORCED_INDEX));
    }

    @Override
    public int getAttestationSecurityLevel() {
        return attestationSecurityLevel;
    }

    @Override
    public RootOfTrust getRootOfTrust() {
        RootOfTrust rot = teeEnforced.getRootOfTrust();
        if (rot != null) return rot;
        return softwareEnforced.getRootOfTrust();
    }
}
