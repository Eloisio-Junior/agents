# Bun `--compile` segfault (por que o deploy roda interpretado)

**Status:** contornado. O deploy roda o entrypoint TypeScript interpretado (`bun src/index.ts`), NÃO o binário standalone de `bun build --compile`.

## Sintoma

O binário gerado por `bun build --compile` (e qualquer bundle de `bun build`, mesmo sem `--compile`) dá **segfault no boot**, ~300ms depois de subir o servidor, com corrupção de heap (`panic ... Segmentation fault`, endereço variável).

## Causa

Executar o **`staticPlugin` do `@elysiajs/static`** dentro do app **bundlado** dispara um bug de corrupção de heap do **Bun**. O crash não estoura no `staticPlugin`: ele se manifesta na primeira alocação pesada seguinte (a primeira query Prisma), então parece ser do Prisma, quando o Prisma é só a vítima. O build **interpretado** (`bun src/index.ts`, sem bundler) é imune.

## Restrição operacional

**Não** troque o entrypoint do Dockerfile para `bun build --compile` nem bundle o backend enquanto o `@elysiajs/static` estiver montado em produção. O deploy interpretado roda saudável.

## Ao reinvestigar

1. Conferir se uma versão nova do Bun corrige o bug (recompilar e rodar; crash some?).
2. Repro do toggle: montar `staticPlugin({ assets: "dist" })` → crash; servir `dist` via `Bun.file` no catch-all → passa.
3. Se for aplicar o fix: servir estáticos pelo `serve.routes` nativo do Bun em produção e restringir o `staticPlugin` ao dev; validar serving de assets + headers de cache (ETag/304/Cache-Control), não só o boot.
