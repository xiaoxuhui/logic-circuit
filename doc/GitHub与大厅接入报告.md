# GitHub 与大厅接入报告

2026-10-18。用户已授权 xiaoxuhui/logic-circuit 公开来源仓库和现有公开大厅资源。

## 来源验收

版本 0.2.0，MIT，固定六文件 dist。全部 80 项核心/分发测试通过，完整 Chromium 桌面/手机/离线浏览器回归 81 项通过。分功能浏览器另验证延迟、查表、宽位宽、全局格式、门编辑级联及只读模式、框选复制整组移动、布线、数量、临时输入；大厅适配验证子路径、原生导出桥、文字存档和共享 origin 存储隔离。没有 Android 实机验收，不把 Chromium 视为 WebView 设备验收。

## 大厅发布

VERIFIED：公开来源为 https://github.com/xiaoxuhui/logic-circuit ，固定发行源码 4d986e4ec445a2de3ab872730f2fcc9f89e09163；[更新后完整 CI 成功](https://github.com/xiaoxuhui/logic-circuit/actions/runs/39087349678)，包含“延迟线清零”按钮改名。ID logic-circuit、资源合同 logic-circuit-dynamic-v1、版本0.2.0、contentCode1。

大厅独立清洁检出 f655d273a50eaafcf4ee162a311dcd5d47e2ac09，两轮资源生产完全一致；[大厅 CI 成功](https://github.com/xiaoxuhui/game-hub/actions/runs/39087427494)。公开签名目录 sequence15 / asset652152660 / SHA256 0eb07895d68c1a307571c726bd58158a80dc8bf3a030ecef93f2add1cac10f30；游戏 ZIP asset652150688 / 135904字节 / SHA256 63079c4dbd9686bc3f061bcf5edce845f94b1b6e3a09710653930a3dcf52feda。

匿名核验全部15份历史签名目录及16个累计资源成功。其他五游戏描述完全一致，旧目录保留，未移动固定标签。大厅“立即检查”→“游戏目录”→逻辑工坊→安装，无需更换 APK。[公开发行证据](https://github.com/xiaoxuhui/game-hub/blob/main/doc/evidence/n22-logic-workshop-release.md)。

## 0.2.3 后继更新（2026-10-18）
固定来源08f0ce588a580a2683fdedef424575817f0671a3，0.2.3/contentCode4，目录18，签名目录SHA256 b76d224955a64e56088bb2d00c433f0d9dd030e965be2916b967722c92419fb8。18份历史签名目录与19个累计资源匿名核验通过；完整证据在game-hub的doc/evidence/n23/sequence18，运行验证见0.2.3测试报告。

## 0.2.4（2026-10-18）
来源0a14f5ef5d585cb6df7db07cc799c64526862219，目录19/432b6bc2f4039584b6915c41655d8f622a20d4fc028ce190b81e572a31d085ba；19份历史目录与20个累计资源匿名验证通过。删除即时备份、恢复完整原电路与32层编辑修复交付，详见0.2.4测试报告。
