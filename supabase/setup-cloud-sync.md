# Legado Supabase

Este diretório não participa do runtime atual do app nem do fluxo oficial de sincronização.

Hoje a nuvem do projeto é `Firebase Authentication + Cloud Firestore`, com a integração implementada em:

- `src/core/firebaseClient.ts`
- `src/core/firebaseCloud.ts`
- `firestore.rules`
- `firestore.indexes.json`
- `firebase.json`

Os arquivos SQL deste diretório foram mantidos apenas como histórico técnico de uma abordagem antiga. Novas mudanças de banco online devem ser feitas no modelo Firebase/Firestore.

Para a modelagem atual da nuvem, consulte `docs/firebase-cloud-model.md`.
