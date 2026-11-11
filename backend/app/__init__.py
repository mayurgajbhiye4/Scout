# Backend application package
import sys

if sys.platform == "win32":
    # Verify TLS against the Windows certificate store. Antivirus HTTPS scanning (e.g. Norton) re-signs
    # traffic with a root only Windows trusts, which fails every Gemini and Tavily call against certifi.
    import truststore

    truststore.inject_into_ssl()
