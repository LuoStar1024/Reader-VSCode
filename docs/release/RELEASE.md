# Release Guide

## Local package

```bash
npm ci
npm run compile
npm run package
```

This creates a `.vsix` file in `dist/`, for example `dist/reader.vsix`.

## Publish to Visual Studio Marketplace

1. Create a publisher in the Visual Studio Marketplace management page.
2. Confirm `package.json` contains:

```json
{
  "publisher": "luostar1024"
}
```

3. If you want the fastest one-time publish flow, create an Azure DevOps PAT with:
   - `Organization`: `All accessible organizations`
   - `Scopes`: `Marketplace (Manage)`

4. Log in once with `vsce`:

```bash
npx @vscode/vsce login luostar1024
```

5. Publish directly from the working tree:

```bash
npm run publish:vsce -- -p <YOUR_VSCE_PAT>
```

6. Or publish an already-built package:

```bash
npx @vscode/vsce publish --packagePath dist/reader.vsix -p <YOUR_VSCE_PAT>
```

7. If the publish fails with `401` or `403`, re-check these two common causes:
   - the PAT was created for a specific organization instead of `All accessible organizations`
   - the PAT scope was not set to `Marketplace (Manage)`

For long-term automation, prefer Microsoft Entra ID instead of PATs.

## GitHub Release

1. Commit your changes.
2. Create and push a version tag:

```bash
git tag v0.0.1
git push origin v0.0.1
```

3. GitHub Actions will build the extension, create a GitHub Release, and upload the `.vsix` asset automatically.
4. If `package.json` contains `publisher` and the repo secret `VSCE_PAT` exists, the same workflow will also publish to the Visual Studio Marketplace.

## Manual GitHub Release

If you prefer to upload the asset yourself:

1. Push your code and tag.
2. Open:

```text
https://github.com/LuoStar1024/Reader-VSCode/releases/new
```

3. Choose tag `v0.0.1`
4. Release title:

```text
v0.0.1
```

5. Upload:

```text
dist/reader.vsix
```

## Required GitHub secret

- `VSCE_PAT`: optional, enables automatic publishing to the Visual Studio Marketplace from the release workflow.
