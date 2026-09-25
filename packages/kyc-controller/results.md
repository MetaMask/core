Times are in **ms** across **5 runs**. **% of total** is each stage’s average divided by average `#createUkycSession total` (**3694.24 ms**). Nested stages overlap their parents, so those percents should not be added together.

### Session-level (mutually exclusive)

These five stages make up ~100% of `#createUkycSession`.

| Stage | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Average | % of total |
|---|---:|---:|---:|---:|---:|---:|---:|
| `#createUkycSession generateSessionKeypair` | 70.60 | 81.12 | 77.45 | 40.36 | 62.37 | 66.38 | 1.80% |
| `#createUkycSession KycService:createUkycSession` | 1467.42 | 1247.69 | 1191.46 | 1183.74 | 1274.88 | 1273.04 | 34.46% |
| `#verifyWrappingKeys total` | 832.67 | 852.28 | 825.29 | 813.98 | 916.42 | 848.13 | 22.96% |
| `#generateWrappedAuthorizations total` | 870.65 | 686.32 | 876.43 | 825.70 | 861.01 | 824.02 | 22.31% |
| `#createUkycSession KycService:setAuthorizations` | 645.04 | 721.59 | 606.50 | 691.54 | 729.30 | 678.79 | 18.37% |
| **`#createUkycSession total`** | **3892.62** | **3593.37** | **3580.83** | **3558.02** | **3846.34** | **3694.24** | **100%** |

### Nested stages (same % of session total)

| Stage | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Average | % of total |
|---|---:|---:|---:|---:|---:|---:|---:|
| `#verifyWrappingKeys fetchJwks` | 621.52 | 615.34 | 559.07 | 653.80 | 713.13 | 632.57 | 17.12% |
| `#verifyWrappingKeys assertAttestedServerPublicKey` | 210.37 | 235.99 | 265.42 | 159.44 | 202.40 | 214.72 | 5.81% |
| `#getOrCreateLocalUserSecret loadExisting` | 202.49 | 168.33 | 150.86 | 282.87 | 207.25 | 202.36 | 5.48% |
| `#getOrCreateLocalUserSecret generate` | 0.15 | 0.11 | 0.14 | 0.12 | 0.14 | 0.13 | 0.00% |
| `#getOrCreateLocalUserSecret persist` | 284.08 | 158.19 | 305.65 | 145.35 | 168.51 | 212.36 | 5.75% |
| `#getOrCreateLocalUserSecret reloadAfterPersist` | 227.55 | 198.45 | 208.76 | 168.45 | 244.24 | 209.49 | 5.67% |
| `#getOrCreateLocalUserSecret total` | 717.02 | 527.43 | 667.47 | 598.55 | 622.08 | 626.51 | 16.96% |
| `#generateWrappedAuthorizations getOrCreateLocalUserSecret` | 717.63 | 528.09 | 668.16 | 598.90 | 622.35 | 627.03 | 16.97% |
| `#generateWrappedAuthorizations deriveClientMaterial` | 60.87 | 55.20 | 87.52 | 111.17 | 96.58 | 82.27 | 2.23% |
| `#generateWrappedAuthorizations wrapEncryptionDataKey` | 37.57 | 41.15 | 47.65 | 40.96 | 45.51 | 42.57 | 1.15% |
| `#generateWrappedAuthorizations signStorageAccessToken` | 29.40 | 29.68 | 39.23 | 39.96 | 51.63 | 37.98 | 1.03% |
| `#generateWrappedAuthorizations wrapUkycCapabilityToken` | 23.61 | 30.65 | 32.13 | 33.09 | 43.38 | 32.57 | 0.88% |

Largest share is the `createUkycSession` network call (**34%**), then JWKS verify (**23%**), wrapping authorizations (**22%**), and `setAuthorizations` (**18%**). Local secret generation is negligible; almost all of `getOrCreateLocalUserSecret` is storage load/persist/reload.
