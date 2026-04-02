# Capacitor CI/CD

Pipeline de release Android para este projeto Vite + Capacitor.

## O que o workflow faz

- roda em push para `main`
- instala dependencias Node
- gera o build web com Vite
- sincroniza o projeto Android com `npx cap sync android`
- gera APK release assinado com Gradle
- publica o APK em uma release do GitHub
- atualiza o `version.json`
- faz commit automatico do `version.json`

## Versao automatica

- `versionName`: `1.0.<github.run_number>`
- `versionCode`: `github.run_number`
- tag da release: `v1.<github.run_number>`

O `versionCode` sempre cresce automaticamente, o que evita regressao de instalacao no Android.

## Secrets obrigatorios no GitHub

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

## Variaveis opcionais no GitHub

- `APP_UPDATE_REQUIRED`
  - `true` para publicar `required: true` no `version.json`
  - `false` ou ausente para publicar `required: false`

## Manifesto de atualizacao no app

O app atual deve apontar `VITE_APP_UPDATE_MANIFEST_URL` para:

```env
https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/main/version.json
```

## Observacoes de assinatura

O workflow gera um APK release assinado a partir do keystore armazenado em secrets. Sem esses secrets o job falha cedo, antes de iniciar o build Android.

## Evitando loop de CI

O trigger ignora mudancas em `version.json`, entao o commit automatico do manifesto nao dispara um novo workflow.
