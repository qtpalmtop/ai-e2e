# 构建资源（buildResources）

electron-builder 在打包时会读取本目录下的图标：

- `icon.icns`：macOS dmg 安装包图标（建议 1024x1024 起，ICNS 格式）
- `icon.ico`：Windows NSIS 安装包图标（建议 256x256，ICO 格式）

如果留空，electron-builder 会回退到 electron 默认图标（不影响打包）。

## 临时生成一个 icon

可以用任意 1024x1024 PNG 作源，分别生成两种格式：

```bash
# macOS
sips -s format icns icon.png --out icon.icns

# Windows（需先安装 ImageMagick）
magick convert icon.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
```

生成后把 `icon.icns` / `icon.ico` 放到本目录即可，无需改 `electron-builder.yml`。
