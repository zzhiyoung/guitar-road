# Windows 启动器与维护约定

## 日常使用

根目录 `launch-guitar-practice.bat` 检查 Node.js 22+，缺少 `node_modules` 时运行 `npm install`（遵循项目 `.npmrc`，跳过依赖安装脚本），缺少 `.next/BUILD_ID` 时运行生产构建，然后在 3000 端口启动服务。

```bat
launch-guitar-practice.bat
launch-guitar-practice.bat rebuild
```

第二条命令强制构建新版本。构建或安装失败时脚本会显示错误并停下。运行中保留控制台窗口，关闭它会停止服务。

使用默认 `.next` 输出目录，启动前清除终端中自定义的 `GUITAR_NEXT_DIST_DIR` 和 `PORT`。开发服务或其他占用 3000 的服务应先停止；不要在运行中的生产服务上直接重建。

## 手工创建桌面快捷方式

1. 右键 `launch-guitar-practice.bat`，选择“显示更多选项 → 发送到 → 桌面快捷方式”；不同 Windows 版本菜单可能略有区别。
2. 将名称改为 Guitar Road（已有 Guitar Practice 名称也可继续使用）。
3. 打开快捷方式属性，点“更改图标”，选择项目内 `assets/icon.ico`。
4. 如果移动项目目录，更新快捷方式的目标、起始位置和图标路径。

仓库不分发绑定到维护者绝对路径的 `.lnk` 文件。

## 图标

`assets/icon-source.png` 是桌面图标源图；`assets/icon.ico` 含 16、24、32、48、64、128、256 像素七种尺寸。日常启动不需要 Python。

需要重新导出桌面 ICO 时，准备一个正常的 Python 环境并安装 Pillow，在项目根目录执行：

```powershell
python -m pip install Pillow
python -c "from PIL import Image; Image.open('assets/icon-source.png').convert('RGBA').save('assets/icon.ico', format='ICO', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])"
```

`npm run icons` 使用标准库生成 `public/icons/` 下的 PWA PNG，和桌面 ICO 是两条独立流程。

## 已知限制

- 脚本检测到 3000 端口有监听时直接打开浏览器，不会核验它是否属于 Guitar Road。
- 浏览器固定延后 6 秒打开，没有 HTTP 就绪检查；慢机器上需要稍后刷新。
- Node.js 检查验证版本下限，不能保证 npm 或原生模块安装在所有环境中成功。
- 当前 `next start` 默认监听所有网络接口，应用没有认证。仅供本机使用时可改用 `npm run start -- --hostname 127.0.0.1`；公网部署需要另外设计访问控制。

## 必须同步维护的变化

修改下列任意项，必须检查并同步更新启动器：

1. `package.json` 的 `build` / `start` 脚本名或行为。
2. 服务端口（端口检测与浏览器 URL 当前固定为 3000）。
3. 构建输出目录或成功标记（当前为 `.next/BUILD_ID`）。
4. Node.js 版本要求。

更新后必须实际验证三条路径：

| 场景 | 起始状态 | 验收结果 |
|---|---|---|
| 首次构建 | 无 `.next/BUILD_ID` | 自动构建后启动，首页 HTTP 200 |
| 已有构建 | `.next/BUILD_ID` 存在 | 不重建，直接启动，首页 HTTP 200 |
| 强制重建 | 已有构建，传 `rebuild` | 执行构建后启动，首页 HTTP 200 |

测试应使用隔离项目副本和临时数据，3000 端口空闲。保留原构建与个人数据；如需无构建状态，可将测试副本的 `.next` 改名保留，不要清理真实项目来制造测试条件。构建输出、HTTP 返回和停止后的端口状态应分别核对。

## 公开版本检查记录

2026-10-01，在 Windows、Node.js 24.16.0、npm 11.13.0 的隔离副本中完成全新 `npm ci`。首次构建、已有构建与 `rebuild` 均按预期执行：首次和重建分支完成生产构建，已有构建分支直接启动；每次的首页、曲库、成长与导入页均返回 HTTP 200。检查后 3000 端口已释放。

当前界面截图来自同一隔离环境的原创演示曲谱与数据。该检查验证了启动与页面访问，没有把固定延迟打开浏览器的逻辑视为 HTTP 就绪检测，也没有替代真实设备音频试听。
