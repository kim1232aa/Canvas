# 操作事件记录（避免截图歧义）

这些记录只说明截图拍摄时刻与鼠标操作状态，不替代四段运行证据。

- `01-preset-picker.png` 是首次打开应用默认画布时的工作流预设卡片库状态。其上存在「历史记录读取失败 / Failed to fetch」toast，遮挡了部分卡片按钮；该次点击没有成功载入，截图中的 Hugging Face 画布不是 Civitai 验收运行。
- `02-civitai-preset-cards.png`：关闭 toast 并按 DOM 复核按钮位置后，在 Civitai 过滤结果中重新截图；截图中间为 `Civitai · 花饰人像` 卡片及 Civitai 底模/LoRA。
- `04-civitai-image-preset-canvas.png`：真实鼠标点击「仅载入」后关闭预设模态框的 Civitai 图片节点画布。其后 `05` 是实际输入图片请求参数后的截图；`06` 是真实点击「运行」后的提交中画面；`07/08` 是上游 400 和执行记录。
- `09-civitai-video-t2v-preset-loaded.png`：真实鼠标点击 T2V 卡片「仅载入」后的画布；`10` 是实际填写参数总控台截图（步骤、seed、CFG、sampler、scheduler）；`11` 是关闭总控台后、真实 UI 运行前的 T2V 画布。
- `12-civitai-video-run-result.png`：真实鼠标点击顶栏「运行：AI 视频 (Civitai)」后读取的执行结果；`13` 展开了 UI 执行日志中的 actualRequest。图像与视频两次运行都收到了 HTTP 400 `insufficientBuzz`，没有媒体产物。

任务“图生视频”未执行：该任务还需要用户提供一张合适的参考图；在没有合适真实输入素材时不伪造/随意选图。且本次同一账号 Civitai 上游已返回 Buzz 不足，继续尝试不会产生有效视频验收。
