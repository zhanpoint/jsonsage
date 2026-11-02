const english: Record<string, string> = {
  '代码': 'Code', '树形': 'Tree', '表格': 'Table', '节点图': 'Graph',
  'JSON 层级节点图': 'JSON hierarchy graph', '演示视图': 'Demo views', 'JSON 示例': 'JSON example', 'JSON 树形视图': 'JSON tree view',
  '对象数组': 'Object array', '2 行 · 2 列': '2 rows · 2 columns', '展开深度': 'Expansion depth', '6 个节点': '6 nodes', '自动保存': 'Autosaved', '8 行': '8 lines', '字符': 'characters',
  '不止于 JSON': 'More than JSON', '数据里的文档、表格与媒体链接，就地打开预览': 'Preview documents, spreadsheets and media links alongside your data',
  '示意：发现 JSON 语法错误并修复': 'Illustration: finding and repairing a JSON syntax error', '发现语法问题': 'Syntax issue found', '正在修复语法…': 'Repairing syntax…', '语法校验通过': 'Syntax is valid',
  '结构对比示例：角色从 developer 变为 designer，年龄类型发生变化': 'Comparison example: role changes from developer to designer and age changes type', '结构对比': 'Structural comparison', '2 处差异': '2 differences', '类型': 'Type',
  '生成类型': 'Generate types', '已生成': 'Generated', '选择类型语言': 'Select type language', '类型示例': 'type example',
  '示意：在编辑器旁预览链接指向的文档': 'Illustration: previewing a linked document beside the editor', '数据': 'Data', '预览': 'Preview', '项目进展': 'Project progress', '产品与数据概览': 'Product and data overview', '使用指南': 'User guide', '快速开始': 'Getting started', '了解更多 →': 'Learn more →',
  '本地历史记录示意：按文件名查找已保存的文档': 'Local history: find saved documents by file name', '搜索文件名…': 'Search file names…', '最近使用': 'Recent', '已置顶': 'Pinned', '仅保存在此浏览器': 'Saved only in this browser',
  '诊断与修复': 'Diagnose and repair', '定位语法错误，一键修复数据。': 'Find syntax errors and repair data in one click.', '结构化对比，快速发现数据变化。': 'Compare structures and quickly find changes.', '类型生成': 'Type generation', '从 JSON 生成多语言类型，减少重复编码。': 'Generate types in multiple languages from JSON.', '字段预览': 'Field previews', '文档、图片与音视频，就在数据旁边打开。': 'Open documents, images and media alongside your data.', '本地历史': 'Local history', '保留的 JSON 文件留在当前浏览器，随时搜索找回。': 'Find saved JSON files in this browser whenever you need them.',
  '为真实工作流，把细节做好。': 'Built for real workflows.', '从修复语法到检查结构、生成类型与预览关联文件。每项能力都围绕处理数据时的实际步骤设计。': 'Repair syntax, inspect structures, generate types and preview linked files in one workspace.',
  '粘贴文本': 'Paste text', '快速开始处理数据': 'Get started quickly', '本地文件': 'Local file', '选择或拖入文件': 'Select or drop a file', 'URL 导入': 'Import URL', '读取远程 JSON': 'Load remote JSON', '格式化 / 压缩': 'Format / minify', '整理或精简 JSON': 'Format or compact JSON', '适配多种编程语言': 'For multiple languages', '复制与导出': 'Copy and export', '保存处理结果': 'Save your results',
  '校验 · 修复 · 查看': 'Validate · Repair · Explore', '浏览器本地处理': 'Processed in your browser', '一个工作区，完成数据处理': 'One workspace for your data',
  '单个文件 / URL 导入上限': 'Maximum file / URL import size', '节点': 'nodes', '常规语法树容量': 'Standard syntax tree capacity', '100 MiB 样本的校验与折叠索引': 'Validation and folding index for a 100 MiB sample', '上传到服务器的 JSON': 'JSON uploaded to servers', '为大文件而设计': 'Designed for large files',
  '记录仅存本机浏览器': 'Records stay in your browser', '保存在当前浏览器，不跨设备同步。重要内容请导出备份。': 'Saved in this browser and not synced across devices. Export important content for backup.', '缓存后可离线使用': 'Available offline after caching', '通过 HTTPS 或 localhost 安装并缓存后，本地编辑与处理可离线使用。': 'After installation and caching over HTTPS or localhost, local editing and processing work offline.', '远程请求不携带 Cookie': 'Remote requests omit cookies', 'URL 导入与远程预览需要联网，请求不携带 Cookie，也不发送来源页面地址。': 'URL imports and remote previews require a connection. Requests omit cookies and the referring page address.', '隐私保护，边界清晰': 'Privacy with clear boundaries', '浏览器存储': 'Browser storage', '离线': 'Offline', '无 Cookie': 'No cookies', '浏览器': 'Browser',
  '开源，也可自主部署': 'Open source and self-hosted', '在 GitHub 上查看源码': 'View source on GitHub', '复制命令': 'Copy commands', '已复制': 'Copied', '复制': 'Copy',
  '跳至主要内容': 'Skip to main content', 'JsonSage 首页': 'JsonSage home', '主导航': 'Main navigation', '功能': 'Features', '工作流': 'Workflow', '性能': 'Performance', '隐私': 'Privacy', '切换到深色主题': 'Switch to dark theme', '切换到浅色主题': 'Switch to light theme', 'GitHub 仓库': 'GitHub repository', '打开工作区': 'Open workspace', '关闭导航': 'Close navigation', '打开导航': 'Open navigation',
  '看清 JSON，': 'Understand JSON,', '高效处理': 'work efficiently', '，': ',', '数据留在本地。': 'keep data local.', 'JsonSage 是一个运行在浏览器里的 JSON / JSONC 工作区。编辑、校验、结构对比、类型生成和文件预览，都不需要把数据交给服务器。': 'JsonSage is a browser-based JSON and JSONC workspace. Edit, validate, compare structures, generate types and preview files without sending your data to a server.', '查看源码': 'View source', '开始处理你的 JSON': 'Start working with JSON', '无需注册，打开即用。编辑与处理在浏览器中完成。': 'No sign-up required. Edit and process data in your browser.',
};

export function translateLanding(language: 'en' | 'zh', text: string) {
  return language === 'en' ? (english[text] ?? text) : text;
}
