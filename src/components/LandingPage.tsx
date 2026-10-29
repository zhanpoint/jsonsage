import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Brackets,
  CaseSensitive,
  ChevronsDown,
  ChevronsUp,
  Check,
  CircleAlert,
  ClipboardPaste,
  Code2,
  Copy,
  Cpu,
  Download,
  FileCode2,
  FileText,
  GitCompareArrows,
  Github,
  History,
  Hash,
  Link2,
  ListTree,
  Menu,
  Moon,
  Minus,
  PanelRight,
  Pin,
  Plus,
  Save,
  Search,
  Sun,
  Table2,
  ToggleRight,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import "./landing.css";
import { flushSync } from 'react-dom';
import { RainbowButton } from './ui/RainbowButton';
import { commandDefinitions } from '../lib/commands';
import { parseTree } from 'jsonc-parser';
import PathBreadcrumbs from './PathBreadcrumbs';

const repository = "https://github.com/zhanpoint/jsonsage";
const logo = `${import.meta.env.BASE_URL}jsonsage-mark.svg`;
const unsafeId = "18446744073709551615";
const demoInterval = 3000;

/* ------------------------------------------------------------------ hooks */

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useInView(ref: RefObject<Element | null>, threshold = 0.3) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}

/** Cycles through items while visible. */
function useAutoCycle(count: number, interval: number) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, 0.25);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % count),
      interval,
    );
    return () => window.clearInterval(timer);
  }, [inView, count, interval, index]);
  return { ref, index, select: setIndex, playing: inView };
}

function trackPointer(event: ReactPointerEvent<HTMLElement>) {
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  element.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  element.style.setProperty("--my", `${event.clientY - rect.top}px`);
}

const cssVars = (vars: Record<string, string | number>) =>
  vars as CSSProperties;

/* ---------------------------------------------------------- small pieces */

function NumberTicker({
  value,
  decimals = 0,
}: {
  value: number;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, 0.6);
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1800);
      setCurrent(t === 1 ? value : value * (1 - Math.pow(2, -10 * t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, value]);
  const format = (n: number) =>
    n.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  return (
    <span className="lp-ticker" ref={ref}>
      <span aria-hidden="true">{format(reduced ? value : current)}</span>
      <span className="lp-sr">{format(value)}</span>
    </span>
  );
}

function SectionHead({
  title,
  children,
  center,
}: {
  title: ReactNode;
  children?: ReactNode;
  center?: boolean;
}) {
  return (
    <header
      className={center ? "lp-head lp-head-center" : "lp-head"}
      data-reveal
    >
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </header>
  );
}

function highlight(line: string) {
  const parts: ReactNode[] = [];
  const pattern =
    /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) parts.push(line.slice(last, match.index));
    if (match[1]) {
      parts.push(
        <span key={match.index} className={match[2] ? "tk-key" : "tk-str"}>
          {match[1]}
        </span>,
      );
      if (match[2]) parts.push(match[2]);
    } else {
      parts.push(
        <span key={match.index} className={match[3] ? "tk-lit" : "tk-num"}>
          {match[3] ?? match[4]}
        </span>,
      );
    }
    last = pattern.lastIndex;
  }
  parts.push(line.slice(last));
  return parts;
}

/* ------------------------------------------------------- product window */

const source = [
  "{",
  `  "id": ${unsafeId},`,
  '  "users": [',
  '    { "name": "Ada", "role": "developer" },',
  '    { "name": "Lin", "role": "designer" }',
  "  ],",
  '  "active": true',
  "}",
];
const demoRoot = parseTree(source.join('\n'));

const demoViews = [
  { id: "code", label: "代码", icon: Code2, path: ['id'] },
  { id: "tree", label: "树形", icon: ListTree, path: ['users', 0, 'name'] },
  { id: "table", label: "表格", icon: Table2, path: ['users'] },
  { id: "graph", label: "节点图", icon: commandDefinitions.graph.icon, path: [] },
] as const;

const treeRows = [
  { depth: 0, name: "$", value: "{3}", type: "object", icon: Braces, expanded: true },
  { depth: 1, name: "id", value: unsafeId, type: "number", icon: Hash },
  { depth: 1, name: "users", value: "[2]", type: "array", icon: Brackets, expanded: true },
  { depth: 2, name: "[0]", value: "{2}", type: "object", icon: Braces, expanded: true },
  { depth: 3, name: "name", value: '"Ada"', type: "string", icon: CaseSensitive, selected: true },
  { depth: 3, name: "role", value: '"developer"', type: "string", icon: CaseSensitive },
  { depth: 2, name: "[1]", value: "{2}", type: "object", icon: Braces, expanded: false },
  { depth: 1, name: "active", value: "true", type: "boolean", icon: ToggleRight },
] as const;

const graphNodes = [
  { id: "root", x: 24, y: 112, label: "$ · object", value: "{3}" },
  { id: "id", x: 196, y: 28, label: "id · number", value: "1844…1615" },
  { id: "users", x: 196, y: 112, label: "users · array", value: "[2]" },
  { id: "active", x: 196, y: 196, label: "active · boolean", value: "true" },
  { id: "u0", x: 372, y: 70, label: "0 · object", value: "{2}" },
  { id: "u1", x: 372, y: 154, label: "1 · object", value: "{2}" },
] as const;
const graphEdges = [
  ["root", "id"],
  ["root", "users"],
  ["root", "active"],
  ["users", "u0"],
  ["users", "u1"],
] as const;
const NODE_W = 140;
const NODE_H = 48;

function GraphView() {
  const find = (id: string) => graphNodes.find((node) => node.id === id)!;
  return (
    <svg className="lp-graph" viewBox="0 0 540 264" role="img" aria-label="JSON 层级节点图">
      {graphEdges.map(([from, to], i) => {
        const a = find(from);
        const b = find(to);
        const x1 = a.x + NODE_W;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x;
        const y2 = b.y + NODE_H / 2;
        const mid = (x1 + x2) / 2;
        return (
          <path
            key={to}
            d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
            pathLength={1}
            style={cssVars({ "--d": `${i * 90}ms` })}
          />
        );
      })}
      {graphNodes.map((node, i) => (
        <g
          key={node.id}
          style={cssVars({ "--d": `${120 + i * 70}ms` })}
        >
          <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={3} />
          <text x={node.x + NODE_W / 2} y={node.y + 19} textAnchor="middle"><tspan>{node.label}</tspan><tspan x={node.x + NODE_W / 2} dy="16">{node.value}</tspan></text>
        </g>
      ))}
    </svg>
  );
}

function ProductWindow() {
  const { ref, index, select, playing } = useAutoCycle(demoViews.length, demoInterval);
  const view = demoViews[index];
  return (
    <div className="lp-window-stage" ref={ref}>
      <div className="lp-window">
        <span className="lp-beam" aria-hidden="true" />
        <div className="lp-window-bar">
          <div className="lp-window-tabs" aria-hidden="true">
            <span className="is-active">
              <FileCode2 size={14} /> users.json <X size={13} />
            </span>
          </div>
          <div className="lp-demo-tab-actions" aria-hidden="true"><Plus size={18} /><Save size={16} /><History size={16} /></div>
        </div>
        <div className="lp-window-toolbar">
          <div className="lp-switch" role="group" aria-label="演示视图">
            {demoViews.map(({ id, label, icon: Icon }, i) => (
              <button
                key={id}
                type="button"
                aria-pressed={i === index}
                onClick={() => select(i)}
              >
                <Icon size={14} />
                {label}
                {i === index && playing && (
                  <span className="lp-switch-progress" key={index} style={{ animationDuration: `${demoInterval}ms` }} />
                )}
              </button>
            ))}
          </div>
          <div className="lp-demo-tools" aria-hidden="true">
            <span className="lp-demo-mode"><i /> JSONC</span>
            {(['validate', 'repair', 'mask', 'format', 'minify', 'escape', 'unescape', 'undo', 'redo', 'search', 'copyRaw', 'copy', 'open', 'url', 'export'] as const).map(id => {
              const { icon: Icon, tone } = commandDefinitions[id];
              return <Icon key={id} size={15} data-tone={tone} />;
            })}
            <PanelRight size={15} data-tone="violet" />
          </div>
        </div>
        <div className="lp-window-body">
          <div className={`lp-window-main${view.id === 'tree' ? ' lp-demo-linked' : ''}`} key={view.id}>
            {(view.id === 'code' || view.id === 'tree') && <div className="lp-demo-fold" aria-hidden="true"><ChevronsDown size={15} /><ChevronsUp size={15} /></div>}
            {(view.id === "code" || view.id === "tree") && (
              <div className="lp-code" aria-label="JSON 示例">
                {source.map((line, i) => (
                  <div key={i} className={i === 1 ? "is-current" : undefined}>
                    <span className="lp-ln">{i + 1}</span>
                    <code>{highlight(line)}</code>
                  </div>
                ))}
              </div>
            )}
            {view.id === "tree" && (
              <ul className="lp-tree" aria-label="JSON 树形视图">
                {treeRows.map((row, i) => (
                  <li
                    key={i}
                    className={"selected" in row ? "is-selected" : undefined}
                    style={cssVars({ "--depth": row.depth, "--d": `${i * 45}ms` })}
                  >
                    {"expanded" in row ? <span className="lp-tree-toggle">{row.expanded ? <Minus size={11} /> : <Plus size={11} />}</span> : <span className="lp-tree-toggle-space" />}
                    <row.icon size={14} className={`lp-tree-${row.type}`} />
                    <span className="lp-tree-key">{row.name}</span>
                    <span className="lp-tree-colon">:</span>
                    <span className={`lp-tree-${row.type}`}>{row.value}</span>
                    <small>{row.type[0].toUpperCase() + row.type.slice(1)}</small>
                  </li>
                ))}
              </ul>
            )}
            {view.id === "table" && (
              <div className="lp-table-wrap">
                <div className="lp-demo-view-controls"><span>对象数组 <b>$.users</b></span><span>2 行 · 2 列</span></div>
                <table className="lp-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>name</th>
                      <th>role</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>0</td>
                      <td>"Ada"</td>
                      <td>"developer"</td>
                    </tr>
                    <tr>
                      <td>1</td>
                      <td>"Lin"</td>
                      <td>"designer"</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {view.id === "graph" && <><div className="lp-demo-view-controls"><span>展开深度 <b>3</b></span><span>6 个节点</span></div><GraphView /></>}
          </div>
        </div>
        <div className="lp-window-status">
          <span className="lp-demo-saved">自动保存</span>
          <span><Code2 size={13} /> UTF-8</span><span>8 行</span><span>{source.join('\n').length} 字符</span>
          <div className="lp-status-path" inert><PathBreadcrumbs path={[...view.path]} root={demoRoot} language="zh" onCopy={() => {}} onNavigate={() => {}} /></div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- formats */

const formats = [
  "JSON",
  "JSONC",
  "JSONL",
  "NDJSON",
  "Markdown",
  "KaTeX",
  "PDF",
  "PPTX",
  "DOCX",
  "XLSX",
  "PNG",
  "MP4",
];

function FormatMarquee() {
  return (
    <section className="lp-marquee" aria-labelledby="format-heading">
      <div className="lp-marquee-inner lp-container">
        <div className="lp-marquee-label">
          <h2 id="format-heading">不止于 JSON</h2>
          <p>数据里的文档、表格与媒体链接，就地打开预览</p>
        </div>
        <p className="lp-sr">{formats.join("、")}</p>
        <div className="lp-marquee-viewport" aria-hidden="true">
          <div className="lp-marquee-track">
            {[0, 1].map((copy) => (
              <div key={copy}>
                {formats.map((format) => <span key={format}>{format}</span>)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ bento */

function RepairArt() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, 0.25);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    const timer = window.setInterval(() => setStep(current => (current + 1) % 3), 2000);
    return () => window.clearInterval(timer);
  }, [inView, reduced]);
  const phase = reduced ? 2 : step;
  return (
    <div className="lp-repair" ref={ref} data-step={phase} role="img" aria-label="示意：发现 JSON 语法错误并修复">
      <div className="lp-repair-header"><span className="lp-repair-file"><FileCode2 size={14} /> sample.json</span><span className="lp-repair-mode">JSON</span></div>
      <div className="lp-repair-editor" aria-hidden="true">
        <span className="lp-repair-line">1</span>
        <code className="lp-repair-code is-before">{'{ '}<span>name</span>{": 'Ada', tags: ['dev',] }"}</code>
        <code className="lp-repair-code is-after">{highlight('{ "name": "Ada", "tags": ["dev"] }')}</code>
      </div>
      <div className="lp-repair-action" aria-hidden="true">
        <span className="lp-repair-dot" />
        <span>{phase === 0 ? "发现语法问题" : phase === 1 ? "正在修复语法…" : "语法校验通过"}</span>
        {phase === 2 && <Check size={14} />}
      </div>
    </div>
  );
}

function DiffArt() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, 0.25);
  return (
    <div className="lp-diff" ref={ref} data-playing={inView} role="img" aria-label="结构对比示例：角色从 developer 变为 designer，年龄类型发生变化">
      <div className="lp-diff-header"><span><GitCompareArrows size={14} /> 结构对比</span><span className="lp-diff-count">2 处差异</span></div>
      <div className="lp-diff-code" aria-hidden="true">
        <div className="lp-diff-context"><span>1</span><code>{'"name": "Ada",'}</code></div>
        <div className="lp-diff-row is-del"><span>−</span><code>{'"role": "developer"'}</code></div>
        <div className="lp-diff-row is-add"><span>+</span><code>{'"role": "designer"'}</code></div>
        <div className="lp-diff-row is-type"><span>~</span><code>{'"age": 36 → "36"'}</code><small>类型</small></div>
      </div>
    </div>
  );
}

const typeSamples = [
  ["TypeScript", "interface User {\n  name: string;\n  role: string;\n}"],
  ["Python", "class User(TypedDict):\n    name: str\n    role: str"],
  ["Go", 'type User struct {\n  Name string `json:"name"`\n  Role string `json:"role"`\n}'],
  ["Rust", "struct User {\n    name: String,\n    role: String,\n}"],
] as const;

function highlightTypeCode(line: string) {
  const token = /(`[^`]*`|"[^"]*"|'[^']*'|\b(?:interface|class|type|struct)\b|\b(?:string|str|String|TypedDict)\b)/g;
  return line.split(token).map((part, i) => {
    const kind = /^(?:interface|class|type|struct)$/.test(part) ? 'keyword'
      : /^(?:string|str|String|TypedDict)$/.test(part) ? 'type'
      : /^[`"']/.test(part) ? 'string' : '';
    return kind ? <span className={`lp-types-token-${kind}`} key={i}>{part}</span> : part;
  });
}

function TypesArt() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, 0.25);
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(false);
  useEffect(() => {
    if (!inView || reduced || selected) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % typeSamples.length), 2600);
    return () => window.clearInterval(timer);
  }, [inView, reduced, selected]);
  return (
    <div className="lp-types" ref={ref}>
      <div className="lp-types-header"><span><FileCode2 size={14} /> 生成类型</span><span className="lp-types-status"><i /> 已生成</span></div>
      <div className="lp-types-tabs" role="group" aria-label="选择类型语言">
        {typeSamples.map(([language], i) => (
          <button key={language} type="button" aria-pressed={i === index}
            onClick={() => { setIndex(i); setSelected(true); }}>
            {language}
          </button>
        ))}
      </div>
      <pre key={index} aria-label={`${typeSamples[index][0]} 类型示例`}><code>{typeSamples[index][1].split('\n').map((line, i) => <span className="lp-types-line" key={i}><span className="lp-types-line-number" aria-hidden="true">{i + 1}</span><span>{highlightTypeCode(line || ' ')}</span></span>)}</code></pre>
    </div>
  );
}

function PreviewArt() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, 0.25);
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % 2), 3500);
    return () => window.clearInterval(timer);
  }, [inView, reduced]);
  const pdf = index === 0;
  return (
    <div className="lp-preview-art" ref={ref} role="img" aria-label="示意：在编辑器旁预览链接指向的文档">
      <div className="lp-preview-source" aria-hidden="true">
        <span className="lp-preview-source-label">数据 <span>JSON</span></span>
        <code><span className="tk-key">"{pdf ? 'report' : 'readme'}"</span>: <span className="tk-str lp-link-cursor">"https://…/{pdf ? 'report.pdf' : 'guide.md'}"</span></code>
      </div>
      <div className="lp-preview-pane" aria-hidden="true">
        <div className="lp-preview-head"><FileText size={13} /> 预览 <span>{pdf ? 'report.pdf' : 'guide.md'}</span></div>
        <div className="lp-preview-document" key={index}>
          {pdf ? <div className="lp-preview-paper"><small>QUARTERLY REPORT</small><b>项目进展</b><p>产品与数据概览</p><i /><i /><i /></div>
            : <div className="lp-preview-markdown"><b>使用指南</b><p>快速开始</p><i /><i /><span>了解更多 →</span></div>}
        </div>
      </div>
    </div>
  );
}

function ProductivityArt() {
  return (
    <div className="lp-productivity-art" role="img" aria-label="本地历史记录示意：按文件名查找已保存的文档">
      <div className="lp-history-search" aria-hidden="true"><Search size={13} /> 搜索文件名…</div>
      <div className="lp-history-group">最近使用</div>
      <div className="lp-history-list" aria-hidden="true">
        <div><Pin size={13} /><span>orders.json</span><small>已置顶</small></div>
        <div><FileText size={13} /><span>settings.jsonc</span></div>
        <div><FileText size={13} /><span>events.jsonl</span></div>
      </div>
      <div className="lp-history-local">仅保存在此浏览器</div>
    </div>
  );
}

const features = [
  {
    icon: CircleAlert,
    title: "诊断与修复",
    text: "定位语法错误，一键修复数据。",
    art: <RepairArt />,
  },
  {
    icon: GitCompareArrows,
    title: "结构对比",
    text: "结构化对比，快速发现数据变化。",
    art: <DiffArt />,
  },
  {
    icon: FileCode2,
    title: "类型生成",
    text: "从 JSON 生成多语言类型，减少重复编码。",
    art: <TypesArt />,
  },
  {
    icon: PanelRight,
    title: "字段预览",
    text: "文档、图片与音视频，就在数据旁边打开。",
    art: <PreviewArt />,
  },
  {
    icon: History,
    title: "本地历史",
    text: "保留的 JSON 文件留在当前浏览器，随时搜索找回。",
    art: <ProductivityArt />,
  },
];

function Features() {
  return (
    <section className="lp-section lp-container lp-features" id="features">
      <SectionHead center title="为真实工作流，把细节做好。">
        从修复语法到检查结构、生成类型与预览关联文件。每项能力都围绕处理数据时的实际步骤设计。
      </SectionHead>
      <div className="lp-feature-grid">
        {features.map(({ icon: FeatureIcon, title, text, art }, i) => (
          <article className="lp-feature-card" data-feature={i + 1} key={title}>
            <div className="lp-feature-card-copy">
              <h3><FeatureIcon size={21} strokeWidth={1.8} aria-hidden="true" />{title}</h3>
              <p>{text}</p>
            </div>
            <div className="lp-feature-art">{art}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
/* -------------------------------------------------------------- flow */

const flowInputs = [
  { icon: ClipboardPaste, label: "粘贴文本", hint: "快速开始处理数据" },
  { icon: Upload, label: "本地文件", hint: "选择或拖入文件" },
  { icon: Link2, label: "URL 导入", hint: "读取远程 JSON" },
];
const flowOutputs = [
  { icon: Braces, label: "格式化 / 压缩", hint: "整理或精简 JSON" },
  { icon: FileCode2, label: "生成类型", hint: "适配多种编程语言" },
  { icon: Download, label: "复制与导出", hint: "保存处理结果" },
];

function FlowDiagram() {
  const container = useRef<HTMLDivElement>(null);
  const core = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const [geometry, setGeometry] = useState({ width: 0, height: 0, paths: [] as string[] });

  useEffect(() => {
    const box = container.current;
    if (!box || !core.current) return;
    const update = () => {
      const frame = box.getBoundingClientRect();
      const hub = core.current!.getBoundingClientRect();
      const point = (rect: DOMRect, side: "left" | "right") => ({
        x: (side === "left" ? rect.left : rect.right) - frame.left,
        y: rect.top + rect.height / 2 - frame.top,
      });
      const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        const mid = (a.x + b.x) / 2;
        return `M${a.x} ${a.y} C${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`;
      };
      const paths = nodes.current.flatMap((node, i) => {
        if (!node) return [];
        const rect = node.getBoundingClientRect();
        return i < flowInputs.length
          ? [curve(point(rect, "right"), point(hub, "left"))]
          : [curve(point(hub, "right"), point(rect, "left"))];
      });
      setGeometry({ width: frame.width, height: frame.height, paths });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const renderNode = (
    { icon: Icon, label, hint }: (typeof flowInputs)[number],
    index: number,
  ) => (
    <div
      className="lp-flow-node"
      key={label}
      ref={(element) => {
        nodes.current[index] = element;
      }}
    >
      <span>
        <Icon size={16} />
      </span>
      <div>
        <b>{label}</b>
        <small>{hint}</small>
      </div>
    </div>
  );

  return (
    <div className="lp-flow" ref={container} data-reveal>
      <svg
        className="lp-flow-lines"
        width={geometry.width}
        height={geometry.height}
        aria-hidden="true"
      >
        {geometry.paths.map((d, i) => (
          <g key={i}>
            <path d={d} className="lp-flow-base" />
            <path
              d={d}
              className="lp-flow-pulse"
              pathLength={1000}
              style={cssVars({ "--d": `${(i < flowInputs.length ? i : i + 1) * 0.42}s` })}
            />
          </g>
        ))}
      </svg>
      <div className="lp-flow-column">
        {flowInputs.map((node, i) => renderNode(node, i))}
      </div>
      <div className="lp-flow-core" ref={core}>
        <span className="lp-flow-ring" aria-hidden="true" />
        <img src={logo} alt="" width="44" height="44" />
        <b>JsonSage</b>
        <small>校验 · 修复 · 查看</small>
        <small className="lp-flow-worker">
          <Cpu size={11} /> 浏览器本地处理
        </small>
      </div>
      <div className="lp-flow-column">
        {flowOutputs.map((node, i) => renderNode(node, flowInputs.length + i))}
      </div>
    </div>
  );
}

function Workflow() {
  return (
    <section className="lp-section lp-container" id="flow">
      <SectionHead center title="一个工作区，完成数据处理" />
      <FlowDiagram />
    </section>
  );
}

/* ------------------------------------------------------- performance */

const stats = [
  { value: 128, unit: "MiB", label: "单个文件 / URL 导入上限" },
  { value: 100000, unit: "节点", label: "常规语法树容量" },
  { value: 2.96, decimals: 2, unit: "s", label: "100 MiB 样本的校验与折叠索引" },
  { value: 0, unit: "B", label: "上传到服务器的 JSON" },
];

function Performance() {
  return (
    <section className="lp-section lp-container" id="performance">
      <SectionHead center title="为大文件而设计" />
      <div className="lp-stats" data-reveal>
        {stats.map(({ value, decimals, unit, label }) => (
          <div key={label} className="lp-stat" onPointerMove={trackPointer}>
            <div className="lp-stat-value">
              <NumberTicker value={value} decimals={decimals} />
              <small>{unit}</small>
            </div>
            <b>{label}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- privacy */

const privacyFacts = [
  { title: "记录仅存本机浏览器", text: "保存在当前浏览器，不跨设备同步。重要内容请导出备份。" },
  { title: "缓存后可离线使用", text: "通过 HTTPS 或 localhost 安装并缓存后，本地编辑与处理可离线使用。" },
  { title: "远程请求不携带 Cookie", text: "URL 导入与远程预览需要联网，请求不携带 Cookie，也不发送来源页面地址。" },
];

function Privacy() {
  return (
    <section className="lp-dark" id="privacy">
      <div className="lp-dark-grid" aria-hidden="true" />
      <div className="lp-container lp-privacy-heading">
        <SectionHead center title="隐私保护，边界清晰" />
      </div>
      <div className="lp-container lp-facts">
        {privacyFacts.map(({ title, text }, i) => (
          <article key={title} data-reveal style={cssVars({ "--d": `${i * 80}ms` })}>
            <div className={`lp-privacy-visual lp-privacy-visual-${i}`} aria-hidden="true">
              {i === 0 ? (
                <div className="lp-privacy-browser">
                  <div className="lp-privacy-browser-bar"><i /><i /><i /></div>
                  <div className="lp-privacy-file"><FileText size={17} /><span>data.json<small>浏览器存储</small></span><History size={15} /></div>
                  <div className="lp-privacy-file is-muted"><FileText size={17} /><span>config.json<small>浏览器存储</small></span></div>
                </div>
              ) : i === 1 ? (
                <div className="lp-privacy-offline">
                  <span className="lp-privacy-orbit" />
                  <span className="lp-privacy-app"><img src={logo} alt="" width="32" height="32" /></span>
                  <span className="lp-privacy-offline-badge"><WifiOff size={14} /> 离线</span>
                </div>
              ) : (
                <div className="lp-privacy-network">
                  <span><Link2 size={20} /><small>URL</small></span>
                  <div className="lp-privacy-route"><i /><b>无 Cookie</b></div>
                  <span><img src={logo} alt="" width="24" height="24" /><small>浏览器</small></span>
                </div>
              )}
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------- open source */

const terminalLines = [
  { prompt: true, text: "git clone https://github.com/zhanpoint/jsonsage.git" },
  { prompt: true, text: "cd jsonsage && npm ci" },
  { prompt: true, text: "npm run dev" },
  { prompt: false, text: "➜  Local: http://127.0.0.1:5174/#workspace" },
];
const stack = ["React 19", "TypeScript", "CodeMirror 6", "Web Worker", "Vite", "PWA", "IndexedDB"];

function OpenSource() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const commands = terminalLines.filter((line) => line.prompt).map((line) => line.text);
    try {
      await navigator.clipboard.writeText(commands.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  let delay = 0.3;
  return (
    <section className="lp-section lp-container lp-open" id="open-source">
      <div>
        <SectionHead title="开源，也可自主部署" />
        <div className="lp-stack" data-reveal>
          {stack.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <a className="lp-link" href={repository} target="_blank" rel="noreferrer" data-reveal>
          <Github size={16} /> 在 GitHub 上查看源码 <ArrowUpRight size={14} />
        </a>
      </div>
      <div className="lp-terminal" data-reveal>
        <div className="lp-terminal-bar">
          <div className="lp-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <span>Terminal</span>
          <button type="button" onClick={copy} aria-label="复制命令">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <pre><code>
          {terminalLines.map(({ prompt, text }) => {
            const length = Array.from(text).length;
            const duration = prompt ? length * 0.028 : 0.01;
            const style = cssVars({
              "--chars": length,
              "--delay": `${delay}s`,
              "--dur": `${duration}s`,
            });
            delay += duration + 0.35;
            return (
              <span key={text} className={`lp-terminal-line ${prompt ? "is-cmd" : "is-out"}`} style={style}>
                {prompt && <span className="lp-prompt">$</span>}
                <span className="lp-type">{text}</span>
              </span>
            );
          })}
        </code></pre>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- page */

function CtaBeams() {
  const beams = [
    { y: 20, color: '#5087ff' },
    { y: 65, color: '#22c9b5' },
    { y: 105, color: '#73ba69' },
    { y: 190, color: '#a479f3' },
    { y: 235, color: '#ef8559' },
    { y: 280, color: '#ec6573' },
  ];
  return <svg className="lp-cta-beams" viewBox="0 0 1440 300" preserveAspectRatio="none" fill="none" aria-hidden="true">
    <defs>
      <filter id="cta-beam-glow" x="-30%" y="-100%" width="160%" height="300%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="3" /></filter>
    </defs>
    {[false, true].map(right => <g key={String(right)} transform={right ? 'translate(1440 0) scale(-1 1)' : undefined}>
      {beams.map(({ y, color }, index) => {
        const d = `M -40 ${y} C 180 ${y}, 270 150, 570 150 L 720 150`;
        return <g key={color} style={cssVars({ '--beam-color': color, '--beam-delay': `${-index * 1.3 - (right ? 2 : 0)}s`, '--beam-duration': `${5 + index * .4}s` })}>
          <path className="lp-cta-beam-track" d={d} />
          <path className="lp-cta-beam-glow" d={d} pathLength="1" filter="url(#cta-beam-glow)" />
          <path className="lp-cta-beam-light" d={d} pathLength="1" />
        </g>;
      })}
    </g>)}
  </svg>;
}

export default function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() =>
    localStorage.getItem("jsonsage-theme") === "light" ? "light" : "dark",
  );
  const themeTransition = useRef<ViewTransition | null>(null);

  function toggleTheme() {
    if (themeTransition.current) return;
    const update = () => flushSync(() => setTheme(current => current === 'light' ? 'dark' : 'light'));
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      update();
      return;
    }
    document.documentElement.setAttribute('data-theme-transition', '');
    const transition = document.startViewTransition(update);
    themeTransition.current = transition;
    void transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: ['circle(0px at 100% 0%)', `circle(${Math.hypot(innerWidth, innerHeight)}px at 100% 0%)`] },
        { duration: 600, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => { /* A skipped transition still applies the theme update. */ });
    void transition.finished.finally(() => {
      themeTransition.current = null;
      document.documentElement.removeAttribute('data-theme-transition');
    });
  }

  useEffect(() => () => { themeTransition.current?.skipTransition(); }, []);

  useEffect(() => {
    localStorage.setItem("jsonsage-theme", theme);
  }, [theme]);

  useEffect(() => {
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    document.title = "JsonSage — 看清 JSON，高效处理，数据留在本地";
    document.documentElement.lang = "zh-CN";
    const element = root.current!;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    element.querySelectorAll("[data-reveal]").forEach((node) => observer.observe(node));

    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      element.style.setProperty("--hero-p", Math.min(1, y / 520).toFixed(4));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
      document.title = previousTitle;
      document.documentElement.lang = previousLanguage;
    };
  }, []);

  return (
    <div className="lp" id="home" ref={root} data-theme={theme}>
      <a className="lp-skip" href="#main">
        跳至主要内容
      </a>
      <header className="lp-header">
        <div className="lp-container lp-nav">
          <a href="#home" className="lp-brand" aria-label="JsonSage 首页">
            <img src={logo} alt="" width="28" height="28" />
            JsonSage
          </a>
          <nav
            aria-label="主导航"
            id="landing-navigation"
            className={menuOpen ? "lp-links is-open" : "lp-links"}
            onClick={() => setMenuOpen(false)}
          >
            <a href="#features">功能</a>
            <a href="#flow">工作流</a>
            <a href="#performance">性能</a>
            <a href="#privacy">隐私</a>
          </nav>
          <div className="lp-nav-actions">
            <button
              type="button"
              className="lp-icon-link lp-theme-toggle"
              aria-label={theme === "light" ? "切换到深色主题" : "切换到浅色主题"}
              onClick={toggleTheme}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <a
              className="lp-icon-link"
              href={repository}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub 仓库"
            >
              <Github size={18} />
            </a>
            <a className="lp-btn lp-btn-sm" href="#workspace">
              打开工作区 <ArrowRight size={14} />
            </a>
            <button
              type="button"
              className="lp-menu"
              aria-label={menuOpen ? "关闭导航" : "打开导航"}
              aria-expanded={menuOpen}
              aria-controls="landing-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setMenuOpen(false);
              }}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="lp-hero">
          <div className="lp-hero-bg" aria-hidden="true" />
          <div className="lp-container lp-hero-copy">
            <h1>
              <span className="lp-line">看清 JSON，</span>
              <span className="lp-line">
                <em>
                  高效处理
                  <svg viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M3 11 C 70 3, 170 3, 297 9" pathLength={1} />
                  </svg>
                </em>
                ，
              </span>
              <span className="lp-line lp-line-muted">数据留在本地。</span>
            </h1>
            <p className="lp-lead">
              JsonSage 是一个运行在浏览器里的 JSON / JSONC 工作区。编辑、校验、结构对比、类型生成和文件预览，都不需要把数据交给服务器。
            </p>
            <div className="lp-actions">
              <RainbowButton href="#workspace">
                打开工作区 <ArrowRight size={16} />
              </RainbowButton>
              <RainbowButton variant="outline" href={repository} target="_blank" rel="noreferrer">
                <Github size={16} /> 查看源码
              </RainbowButton>
            </div>
          </div>
          <div className="lp-container lp-hero-product">
            <ProductWindow />
          </div>
        </section>

        <FormatMarquee />
        <Features />
        <Workflow />
        <Performance />
        <Privacy />
        <OpenSource />

        <section className="lp-cta" data-reveal>
          <div className="lp-cta-bg" aria-hidden="true"><CtaBeams /></div>
          <div className="lp-container">
            <img src={logo} alt="" width="52" height="52" />
            <h2>开始处理你的 JSON</h2>
            <p>无需注册，打开即用。编辑与处理在浏览器中完成。</p>
            <div className="lp-actions">
              <RainbowButton href="#workspace">
                打开工作区 <ArrowRight size={16} />
              </RainbowButton>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}
