# Contributing

Thanks for improving Locket.

## Workflow

1. Fork / clone the repo  
2. Use Node 20+  
3. `npm install`  
4. `npm run dev` for UI + API  
5. Keep PRs focused and small  

## Checks before a PR

```bash
npm run build
npm run lint
# with API up:
npm run test:ext
```

## Guidelines

- User-facing copy is **English**
- Do not commit `data/` or secrets
- Prefer fixing / hardening over adding attack helpers
- Match existing TypeScript + React style

## Feature ideas

Issues tagged `enhancement` are a good place to start. For large changes, open a discussion first.
