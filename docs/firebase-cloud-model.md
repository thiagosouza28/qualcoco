# Modelo Cloud Firebase

O banco online oficial do app e `Firebase Authentication + Cloud Firestore`.

Arquivos de referencia:

- `src/core/firebaseClient.ts`
- `src/core/firebaseCloud.ts`
- `src/core/sync.ts`
- `firestore.rules`
- `firestore.indexes.json`
- `firebase.json`

## Colecoes remotas

As colecoes usadas pela sincronizacao seguem o mapeamento de `src/core/constants.ts`:

- `equipes`
- `colaboradores`
- `usuario_equipes`
- `parcelas`
- `avaliacoes`
- `avaliacao_colaboradores`
- `avaliacao_parcelas`
- `avaliacao_ruas`
- `avaliacao_retoques`
- `avaliacao_logs`
- `registros_coleta`
- `dispositivos`
- `tentativas_login`
- `configuracoes`
- `sync_logs`

## Estrutura esperada

Os documentos usam `snake_case` na nuvem. O app converte automaticamente para `camelCase` no armazenamento local.

Colecoes principais:

- `colaboradores`: `nome`, `primeiro_nome`, `matricula`, `pin_hash`, `pin_salt`, `ativo`, `perfil`, `auth_user_id`, `auth_email`
- `usuario_equipes`: `usuario_id`, `equipe_id`
- `avaliacoes`: dados da avaliacao original ou de retoque, com `tipo`, `avaliacao_original_id`, `equipe_id`, `responsavel_principal_id`, `inicio_em`, `fim_em`, `status`, `marcado_retoque_por_id`, `marcado_retoque_por_nome`, `retoque_designado_para_id` e `retoque_designado_para_nome`
- `avaliacao_colaboradores`: participantes da avaliacao com `papel`
- `avaliacao_retoques`: equipe e resultado do retoque, incluindo `quantidade_bags` e `quantidade_cargas`
- `avaliacao_logs`: trilha de auditoria por avaliacao/parcela
- `configuracoes`: documento global `default` com limites operacionais e liberacoes por perfil

No fluxo de retoque:

- `marcado_retoque_por_id` e `marcado_retoque_por_nome` registram o fiscal responsavel que enviou a parcela para retoque
- `retoque_designado_para_id` e `retoque_designado_para_nome` registram o colaborador ativo designado para executar o retoque

## Configuracoes globais

O documento `configuracoes/default` concentra as liberacoes administradas pelo perfil `administrador`.

Campos relevantes:

- `limite_cocos_chao`
- `limite_cachos_3_cocos`
- `permissoes_perfis`

Exemplo de `permissoes_perfis`:

```json
{
  "colaborador": {
    "verHistorico": true,
    "verRelatorios": true,
    "verSincronizacao": true,
    "iniciarAvaliacao": true,
    "editarAvaliacaoConcluida": true,
    "iniciarRetoque": true,
    "marcarRetoque": false,
    "visaoTotal": false,
    "editarLimitesOperacionais": false
  },
  "fiscal": {
    "verHistorico": true,
    "verRelatorios": true,
    "verSincronizacao": true,
    "iniciarAvaliacao": false,
    "editarAvaliacaoConcluida": false,
    "iniciarRetoque": false,
    "marcarRetoque": false,
    "visaoTotal": false,
    "editarLimitesOperacionais": false
  },
  "fiscal_chefe": {
    "verHistorico": true,
    "verRelatorios": true,
    "verSincronizacao": true,
    "iniciarAvaliacao": false,
    "editarAvaliacaoConcluida": false,
    "iniciarRetoque": true,
    "marcarRetoque": true,
    "visaoTotal": true,
    "editarLimitesOperacionais": false
  }
}
```

## Observacoes

- Nao existe dependencia de schema SQL para a nuvem atual.
- Alteracoes de colecao/campo devem ser refletidas em `remoteFieldsByStore` dentro de `src/core/sync.ts`.
- Se um campo novo precisar de consulta ordenada ou combinada no Firestore, atualize `firestore.indexes.json`.
