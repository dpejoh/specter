package com.dpejoh.specter.attestation;

import java.security.cert.CertificateParsingException;
import java.security.cert.X509Certificate;

public abstract class Attestation {
    public static final String ASN1_OID = "1.3.6.1.4.1.11129.2.1.17";
    public static final String EAT_OID = "1.3.6.1.4.1.11129.2.1.25";

    public static final int KM_SECURITY_LEVEL_SOFTWARE = 0;
    public static final int KM_SECURITY_LEVEL_TEE = 1;
    public static final int KM_SECURITY_LEVEL_STRONG_BOX = 2;

    int attestationVersion;
    int keymasterVersion;
    int keymasterSecurityLevel;
    byte[] attestationChallenge;
    byte[] uniqueId;
    AuthorizationList softwareEnforced;
    AuthorizationList teeEnforced;

    public static Attestation loadFromCertificate(X509Certificate cert) throws CertificateParsingException {
        byte[] asn1Ext = cert.getExtensionValue(ASN1_OID);
        byte[] eatExt = cert.getExtensionValue(EAT_OID);

        if (asn1Ext == null && eatExt == null) {
            throw new CertificateParsingException("No attestation extension found in certificate");
        }
        if (eatExt != null) {
            try {
                return new EatAttestation(cert);
            } catch (Exception e) {
                throw new CertificateParsingException("Failed to parse EAT attestation", e);
            }
        }
        return new Asn1Attestation(cert);
    }

    public abstract int getAttestationSecurityLevel();
    public abstract RootOfTrust getRootOfTrust();

    public int getAttestationVersion() { return attestationVersion; }
    public int getKeymasterVersion() { return keymasterVersion; }
    public int getKeymasterSecurityLevel() { return keymasterSecurityLevel; }
    public byte[] getAttestationChallenge() { return attestationChallenge; }
    public byte[] getUniqueId() { return uniqueId; }
    public AuthorizationList getSoftwareEnforced() { return softwareEnforced; }
    public AuthorizationList getTeeEnforced() { return teeEnforced; }
}
