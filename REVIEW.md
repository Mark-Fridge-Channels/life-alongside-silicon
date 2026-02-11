# Code Review：图片展示效果

## ✅ Looks Good

- 背景层与内容层分离（#bg-layer / #app），z-index 清晰
- 上传接口校验 mimetype、限制 10MB，无敏感信息泄露
- 错误有 try/catch 与用户可见提示（alert/error 文案）

## ⚠️ Issues Found

- **[HIGH]** [client/main.css:14-24](#) - 使用 `background-size: cover` 时，在部分浏览器或视口比例下仍可能出现「看起来被拉变形」的渲染差异；且背景图无法用 `object-fit` 精确控制，易与预期不符。
  - Fix: 改用 **`<img>` 作为背景图**，容器固定视口大小，图片设 `object-fit: cover`（或 `contain`），由浏览器按比例缩放，**绝不拉伸**。

- **[MEDIUM]** [client/main.js:89](#) - `bgLayer` 在脚本顶部取 DOM，若脚本在 DOM 未就绪时执行可能为 null；当前 script 在 body 底且 type="module" 延迟执行，风险低但可加固。
  - Fix: 在 `initBackground()` 内再取一次 `document.getElementById('bg-layer')`，或保证在 DOMContentLoaded 后执行。

- **[LOW]** [server/index.js:56](#) - 使用 `console.error`，生产环境建议使用结构化 logger（带上下文）。
  - Fix: 可封装 logger，或暂时保留并注明仅开发/排查用。

## 📊 Summary

- Files reviewed: 4（client 3 + server 1）
- Critical issues: 0
- Warnings: 1 HIGH（图片展示方案）, 1 MEDIUM（DOM 时机）, 1 LOW（日志）

## 方案建议

**不作为背景图，改为视口内 `<img>` + `object-fit`**：  
固定视口容器内放一张 `<img src="...">`，CSS 设 `width/height: 100%`、`object-fit: cover`（或 `contain`），图片按比例填充/包含，**不会拉伸变形**；遮罩仍用一层叠在图片之上即可。
