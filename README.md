# JsonSage

React 19、Vite 和 CodeMirror 6 构建的本地 JSON / JSONC 工具。没有后台服务、数据上传或分析脚本。

```sh
npm install
npm run dev
npm test
npm run check:unused
npm run build
```

开发地址为 http://127.0.0.1:5174/。生产构建包含 PWA 离线资源；开发模式不启用 service worker。

## 操作与视图

- **代码**：按需组装 CM6，行号、语法高亮、折叠、括号匹配、原生查找替换、原生撤销重做。主编辑器默认 Ctrl/⌘ Enter 格式化，可自定义。2 空格、4 空格、Tab 设置同时作用于编辑器、格式化、修复和生成结果。
- **命令面板**：默认 Ctrl/⌘ K 打开，搜索操作/视图，方向键选择，Enter 执行，Escape 关闭。每个操作有唯一默认快捷键，集中在 src/lib/commands.ts；工具栏、菜单图标、色彩及操作共用同一配置。参考 21st properui 的 Command Menu，使用 cmdk 和项目已有 Lucide/CSS 主题实现。
- **快捷键设置**：从编辑器设置或命令面板打开，点击快捷键后按新组合键，自动保存至本地偏好；重复组合会提示冲突，可恢复默认。默认 Ctrl/⌘ + Alt + 1–8 依次切换代码、树形、表格、节点图、JSONPath、JQ、对比、类型生成，Ctrl/⌘ + Alt + B 切换双栏。输入普通文字、IME 组合输入和 AltGraph 保持原生行为；CM6 查找、撤销/重做保留标准编辑器键位。系统/浏览器保留键可能无法覆盖。
- **目标语言**：使用 Base UI Select 管理方向键、输入定位、焦点和弹出菜单；参考 [21st Select](https://21st.dev/@cnippet-dev/components/select)，菜单继承当前应用的明暗主题。
- **智能粘贴**：在编辑器正常粘贴时识别 URL、JWT、Base64 和转义 JSON。URL 直接请求目标地址；其他解码在本地 Worker 完成。JWT 只解码 payload，不验证签名；Base64 是解码而非加密解密。原文先插入，异步解码只在粘贴内容与光标未被用户继续修改时替换，避免覆盖后续输入。
- **双栏**：默认关闭。打开后左侧代码、右侧树形。代码光标定位对应节点并展开祖先；点击树节点选中并展开代码区间。编辑通过 CM6 的最小文本事务联动，保留原生撤销历史。
- **树形**：类型标记、层级线、展开/折叠、增删改。重复键数据只读，避免编辑路径歧义。数字展示、编辑和格式化使用原始 token 文本。
- **表格**：自动发现对象数组并提取字段表头，虚拟滚动；大文件使用分页，Worker 只返回当前页的值预览。
- **节点图**：本地 React Flow 层级图，深度选择、平移、缩放、适应视口。最多 300 节点，不推断业务关系。
- **路径**：状态栏展示当前路径；右键字段或点击状态栏路径可复制 JSONPath、JavaScript（res 根）、JQ、RFC 6901 JSON Pointer。菜单支持方向键。Pointer 对 ~ 和 / 正确转义。
- **JSONPath**：通配符、递归、数组切片；JSONPath Plus 禁止脚本求值。结果列表虚拟滚动，最多展示 5,000 节点，预览长度/深度有界。
- **JQ**：真正的 jq-web WASM 管道，支持投影、过滤、转换，结果可复制、导出或替换当前 JSON。多结果组合为数组，无结果为空数组。使用 raw 接口，避免 jq-web.json 的原生 JSON.parse 精度损失。
- **结构对比**：对象键顺序不影响相等性；数组按索引对比。区分新增、删除、值修改和类型变更。数字等值比较不使用浮点数，包括超大指数；差异总数完整，列表和高亮最多 5,000 项。
- **类型生成**：quicktype 本地推断 TypeScript、Python、Go、Rust，可复制/导出。只引入不含 NodeIO 或远程 schema 获取的包子路径。类型来自样本，不能代替业务约束；生成的 number 类型不意味着下游 JavaScript 可精确表示超大整数。源 JSON 不被修改。
- **脱敏**：密码、token、API key 等字段及其后代值，以及电话、邮箱、身份证、Luhn 校验通过的银行卡和 IPv4/IPv6。只替换命中的 token，也处理 JSONC 注释中的常见个人信息；其他原始值和数字保留。可通过 CM6 撤销。规则脱敏存在业务歧义，分享前仍需检查自定义字段。
- **导入导出**：文件选择、文件拖放、URL / GET cURL；最大 128 MiB。严格读取 UTF-8，拒绝损坏的编码；异步读取不会覆盖后续编辑。请求不带 cookie/referrer，无代理，受浏览器 CORS 约束。导出 .json、复制当前内容或按选定缩进复制格式化结果。

语法诊断带行列、精确红色波浪线、中文/英文说明和原生 Tooltip 修复按钮。操作通知在顶部中央显示 3 秒；问题列表点击定位不会清除诊断。修复使用 jsonrepair，处理单引号、未引号键、尾逗号、注释、BOM、字符串外的零宽字符等；有效字符串内部字符保持不变。修复可能推断缺失信息，请核对结果。

## 精度和性能机制

官方 jsonc-parser 提供语法访问接口，lossless-json 保存数字原文；所有对象键通过数据属性创建，避免原型 setter 造成字段丢失。日常解析的安全数字兼容普通 number，查询和对比始终使用无损数字。格式化、压缩、树编辑、查询结果与对比保留超大整数、长小数和指数写法。

JQ 投影保留未参与运算的数值原文，但 JQ 的数值运算仍遵循其 IEEE 754 浮点数语义；不要用算术运算处理要求精确的雪花 ID。工具不会把此限制描述为无损任意精度算术。

校验、转换、查询、对比、类型生成和数据索引均在 Worker 中。过期校验/转换/树构建/大文件视图请求被终止，查询可取消。诊断行列由 Worker 一次扫描计算，最多返回 100 条语法问题，避免问题列表重复扫描大文件。格式化大文本使用 token 流和 64 KiB 输出块，避免巨大编辑列表及每 token 一条拼接数组记录。

大文本输入直接更新 CM6 状态，300 ms 合并一次完整文本快照，避免每次按键都复制和传递百兆字符串。离开编辑器、点击工具栏或执行格式化快捷键时立即提交最新内容；输入会取消过期转换，异步智能粘贴也只在原插入范围和光标未变化时替换，防止覆盖后续编辑。

常规 AST 视图限于 200 万 UTF-16 字符、100,000 语法节点、256 层；超出时自动使用 Worker 分支浏览/分页表格/有界节点图，主线程不接收整棵大树。大文件树每页 300 个直接子节点，提供路径复制和代码定位，复杂增删改在代码中进行。常规树最多 50,000 展开行，表格最多 100 列，数组发现最多 100 个候选。大文件路径按需在 Worker 读取，计算时间与目标之前的内容量相关。

这些界限保证渲染量有界，不保证任意设备、任意大小输入都恒定 60 FPS 或零内存压力。大文件读取、解析、输出仍需要与数据量相关的时间和内存；后台处理避免占用主线程，但不是零耗时。

可复现实测：`npm run benchmark`，生成约 100 MiB / 470,213 条记录的合成样本，并记录校验、分支、表格、图、压缩和格式化耗时于 artifacts/benchmark-report.json。2026-10-03 本机 Node 24 实测分别约 1,817 / 1,266 / 1,064 / 3 / 4,569 / 5,045 ms，测试进程峰值 RSS 919 MiB。该测试测量 Node 中同一算法的耗时，不能当作浏览器 FPS 测试。

本机最新生产预览也成功打开、校验该样本（470,215 文本行），CM6 仅渲染可见窗口；分页表格保留完整行数及大整数，树形每页 300 项且只渲染可见节点，图形最多 300 节点。完整检查记录在 artifacts/acceptance-browser-checks.json。首次装载仍需要构建编辑器文本，测试不等同于恒定帧率保证。

## 验收与维护

`npm test` 覆盖 9 组功能与回归测试，`npm run check:unused` 检查无用文件、导出和依赖；CI 同时执行测试、无用代码检查及生产构建。`artifacts/` 是本机验收与性能报告目录，不提交到公开仓库。

## 生产部署

访问 [JsonSage](http://47.82.79.170)。推送到 `main` 后，GitHub Actions 自动检查、构建并更新服务器 Docker Compose 容器，健康检查失败自动回滚。配置与维护方法见 [DEPLOYMENT.md](DEPLOYMENT.md)，运行情况见 [GitHub Actions](https://github.com/zhanpoint/jsonsage/actions/workflows/deploy.yml)。

主编辑器和对比编辑器共用命令路由，格式化、查找、撤销与重做跟随最后聚焦的可编辑栏；隐藏或已卸载编辑器不接收操作。CodeMirror 的原生编辑历史和查找替换继续使用官方实现。

## 离线与隐私

生产构建缓存全部本地应用资源，包括懒加载模块、Worker、JQ WASM 和应用图标。首次通过 HTTPS / localhost 打开并完成缓存后，可断网重新访问；支持安装按钮（浏览器提供安装事件时）。构建前从已安装的 jq-web 生成本地 ESM 工厂和 WASM 资源，不使用 CDN；对应许可证随资源保留。

JSON 内容只保存在当前页面内存；localStorage 仅保存主题、语言、缩进和快捷键设置，缓存只保存应用资源。JSON 内容不发送至服务器。用户主动导入/粘贴 URL 时，浏览器只请求该 URL；外部文档链接仅在点击后导航。

## 工程参考

- [CodeMirror 6 配置](https://codemirror.net/examples/config/) · [样式](https://codemirror.net/examples/styling/) · [API](https://codemirror.net/docs/ref/)
- [jsonc-parser](https://github.com/microsoft/node-jsonc-parser) · [lossless-json](https://github.com/josdejong/lossless-json) · [jsonrepair](https://github.com/josdejong/jsonrepair)
- [JSONPath Plus](https://jsonpath-plus.github.io/JSONPath/docs/ts/) · [jq-web](https://github.com/fiatjaf/jq-web) · [quicktype](https://github.com/glideapps/quicktype)
- [cmdk](https://github.com/pacocoursey/cmdk) · [React Flow](https://reactflow.dev/) · [TanStack Virtual](https://tanstack.com/virtual/latest) · [Vite PWA](https://vite-pwa-org.netlify.app/guide/)
