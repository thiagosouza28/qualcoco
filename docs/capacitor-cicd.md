# Capacitor CI/CD

Pipeline de release Android para este projeto Vite + Capacitor.

## O que o workflow faz

- roda em push para `main`
- instala dependências Node
- gera o build web com Vite
- sincroniza o projeto Android com `npx cap sync android`
- gera APK release assinado com Gradle
- publica o APK em uma release do GitHub
- envia uma cópia versionada para o Google Drive
- atualiza o `version.json`
- faz commit automático do `version.json`

## Versionamento automático

- `versionName`: `1.0.<github.run_number>`
- `versionCode`: `github.run_number`
- tag da release: `v1.0.<github.run_number>`
- nome no Google Drive: `appqualcoco1.0.<github.run_number>.apk`

O `versionCode` sempre cresce automaticamente, o que evita regressão de instalação no Android.

## Secrets obrigatórios no GitHub

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

## Secrets opcionais para Google Drive

- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`
  - JSON completo da service account
  - compartilhe a pasta de destino com o e-mail da service account como editora

## Variáveis opcionais no GitHub

- `APP_UPDATE_REQUIRED`
  - `true` para publicar `required: true` no `version.json`
  - `false` ou ausente para publicar `required: false`
- `GOOGLE_DRIVE_FOLDER_ID`
  - por padrão o workflow usa `1C0mtzoXTGKheEZIkDOEqjibvT4PZiI91`

## Manifesto de atualização no app

O app atual deve apontar `VITE_APP_UPDATE_MANIFEST_URL` para:

```env
https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/main/version.json
```

O manifesto gerado passa a publicar:

- `url`: URL principal do APK
- `urls`: lista com Google Drive e GitHub Releases
- `fileName`: nome versionado do APK

Se o upload no Google Drive estiver ativo, o app tenta o Drive primeiro e usa o GitHub Releases como fallback automático.

## Observações de assinatura

O workflow gera um APK release assinado a partir do keystore armazenado em secrets. Sem esses secrets o job falha cedo, antes de iniciar o build Android.

## Evitando loop de CI

O trigger ignora mudanças em `version.json`, então o commit automático do manifesto não dispara um novo workflow.
