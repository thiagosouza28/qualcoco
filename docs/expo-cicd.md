# Expo CI/CD

Este pipeline foi preparado para um projeto Expo com EAS Build e GitHub Releases.

## O que ele faz

- Gera um APK Android no push para `main`
- Publica o APK em uma release do GitHub
- Atualiza o `version.json` automaticamente
- Faz commit do `version.json` de volta para `main`
- Usa `github.repository` para montar URLs sem hardcode de usuario/repositorio

## Secrets e variaveis do GitHub

- `EXPO_TOKEN`: obrigatorio
- `APP_UPDATE_REQUIRED`: opcional
  - `true` para gerar `required: true` no `version.json`
  - `false` ou ausente para manter `required: false`

## URL do manifesto no app Expo

Use no `.env` do app Expo:

```env
EXPO_PUBLIC_APP_UPDATE_MANIFEST_URL=https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/main/version.json
```

## Observacao importante sobre este workspace

O workspace atual nao e um projeto Expo. O `package.json` presente hoje e de Vite + Capacitor, entao o workflow foi criado como pipeline-alvo para uma app Expo/EAS, mas so vai executar com sucesso quando o repositorio tiver:

- `expo` no `package.json`
- `app.json`, `app.config.js` ou `app.config.ts`
- configuracao valida do projeto EAS/Expo

## Release e versionamento

- Tag da release: `v1.<run_number>`
- Versao do manifesto: `1.0.<run_number>`
- Asset publicado: `app.apk`

O trigger ignora mudancas em `version.json` para evitar loop infinito quando o workflow faz o commit automatico.
