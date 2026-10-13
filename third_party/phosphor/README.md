# Phosphor Icons

Source: [official Phosphor core](https://github.com/phosphor-icons/core), npm package `@phosphor-icons/core@2.1.1`, regular weight. The 16 SVG files here are unmodified official assets. Their MIT license is retained in `LICENSE`.

The HTML contains a generated symbol sprite using these icon bodies. The UI uses SVG `use` references and inherits colors through CSS; no CDN, icon font or additional server route is required.

To update/regenerate from the pinned official package:

```powershell
New-Item -ItemType Directory -Path build/ui-assets -Force
npm pack @phosphor-icons/core@2.1.1 --pack-destination build/ui-assets
python tools/vendor_phosphor.py build/ui-assets/phosphor-icons-core-2.1.1.tgz
```

The compiler and IDE do not need npm at runtime. Keep asset names in `tools/vendor_phosphor.py` synchronized with HTML references, and retain the package license.
