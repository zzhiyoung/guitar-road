import type * as AlphaTabNS from "@coderline/alphatab";

/**
 * SPEC §7.1：alphaTab 只作为 dependency 使用，不修改其源码。
 *
 * 加载方式说明（对应 SPEC §12 Q2 的决策）：
 * alphaTab 的 Web Worker / AudioWorklet 需要能按 URL 定位到"自己的脚本文件"。
 * 打包器（Turbopack/webpack）会把 ESM 入口拆成 chunk，导致 `import.meta.url` 指向的
 * worker 相对路径失效。因此这里**不做打包**，而是直接在页面注入官方 UMD 构建
 * （`public/alphatab/alphaTab.min.js`），由 alphaTab 自行探测 scriptFile / fontDirectory，
 * 这是 alphaTab 官方文档推荐的 bundler 集成方式，也避免我们改动其源码。
 *
 * 类型仍然来自 npm 包 `@coderline/alphatab`，保证版本锁定与类型安全。
 */
declare global {
  interface Window {
    alphaTab?: typeof AlphaTabNS;
  }
}

const SCRIPT_SRC = "/alphatab/alphaTab.min.js";
const SCRIPT_FLAG = "alphatabRuntime";

let pending: Promise<typeof AlphaTabNS> | null = null;

export function isAlphaTabLoaded(): boolean {
  return typeof window !== "undefined" && !!window.alphaTab;
}

export function loadAlphaTab(): Promise<typeof AlphaTabNS> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("alphaTab 只能在浏览器中加载"));
  }
  if (window.alphaTab) return Promise.resolve(window.alphaTab);
  if (pending) return pending;

  pending = new Promise<typeof AlphaTabNS>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-${SCRIPT_FLAG}]`,
    );
    const script = existing ?? document.createElement("script");

    const settle = () => {
      if (window.alphaTab) resolve(window.alphaTab);
      else reject(new Error("alphaTab 脚本已加载但未暴露全局对象"));
    };

    script.addEventListener("load", settle, { once: true });
    script.addEventListener(
      "error",
      () => {
        pending = null;
        reject(new Error("alphaTab 脚本加载失败，请检查 /alphatab/alphaTab.min.js"));
      },
      { once: true },
    );

    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.dataset[SCRIPT_FLAG] = "1";
      document.head.appendChild(script);
    }

    if (window.alphaTab) settle();
  });

  return pending;
}

/** 运行时需要的资源路径（相对），对外用 alphaTabAssets() 取绝对地址 */
export const ALPHATAB_ASSETS = {
  script: "/alphatab/alphaTab.min.js",
  fontDirectory: "/alphatab/font/",
  soundFont: "/alphatab/soundfont/sonivox.sf2",
} as const;

/**
 * 谱面上哪些元素不显示。
 *
 * 曲目名 / 艺术家 / 版权等已由页面头部承担，练习时把纵向空间全部让给小节。
 * `GuitarTuning`（调弦标注）与和弦图保留，对吉他练习有用。
 *
 * 注意：alphaTab 把 `notation.elements` 声明为 `Map<NotationElement, boolean>`，
 * 字符串键推导在 TS 下不可用，因此这里构造真正的 Map。
 */
const HIDDEN_NOTATION_ELEMENTS = [
  "ScoreTitle",
  "ScoreSubTitle",
  "ScoreArtist",
  "ScoreAlbum",
  "ScoreWords",
  "ScoreMusic",
  "ScoreCopyright",
  "TrackNames",
] as const;

export function practiceNotationSettings(
  alphaTab: typeof AlphaTabNS,
): { elements: Map<AlphaTabNS.NotationElement, boolean> } {
  const elements = new Map<AlphaTabNS.NotationElement, boolean>();
  for (const name of HIDDEN_NOTATION_ELEMENTS) {
    elements.set(alphaTab.NotationElement[name], false);
  }
  return { elements };
}

/**
 * 运行时的绝对 URL。
 *
 * 关键：alphaTab 用一个 Blob Worker + `importScripts(scriptFile)` 来跑渲染线程，
 * 而 **`importScripts` 只接受绝对 URL**（blob: 里没有可用的 base，根相对路径会直接报
 * "The URL '/...' is invalid"）。所以这里必须给出带 origin 的完整地址。
 */
export function alphaTabAssets(): {
  script: string;
  fontDirectory: string;
  soundFont: string;
} {
  const abs = (p: string) =>
    typeof window === "undefined" ? p : new URL(p, window.location.href).href;
  return {
    script: abs(ALPHATAB_ASSETS.script),
    fontDirectory: abs(ALPHATAB_ASSETS.fontDirectory),
    soundFont: abs(ALPHATAB_ASSETS.soundFont),
  };
}
