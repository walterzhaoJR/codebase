# Things 3 Web

Things 3 风格的网页版任务管理应用。功能与 Electron 版一致，数据存储在浏览器 `localStorage` 中，无需服务器和安装。

## ✨ 功能

- 任务管理：新建、编辑、完成、删除，以及一层父子任务
- 子任务：可单独完成；点击父任务可折叠/展开全部子任务；完成父任务时会同时完成其全部子任务
- 子任务聚焦：父任务列表和详情只展示未完成子任务，完成项统一保留在“已完成”视图
- 项目分组：创建、编辑、删除项目
- 多视图：今天 / 近日 / 随时 / 有一天
- 日期与提醒：自定义截止日期和提醒时间
- 周期任务：支持每天、每周、每月、每年重复；提醒时显示重复属性和下一次提醒，完成本期后自动生成下一期并保留历史
- 标签、备注、本地通知
- 数据导入导出 JSON 备份
- 响应式布局，移动端侧边栏自动精简

## 🚀 使用方式

### 方式一：直接打开
用浏览器打开 `index.html` 即可使用。

### 方式二：启动本地服务（推荐）

在终端执行：

```bash
cd /Users/walterzhao/Desktop/code/codebase/things3-web
python3 -m http.server 8123 --bind 127.0.0.1
```

然后在浏览器打开：

```
http://127.0.0.1:8123/index.html
```

### 后台运行（当前本机部署方式）

使用 macOS 用户级进程管理器托管服务，关闭终端后仍然保持运行：

```bash
launchctl submit -l com.walterzhao.things3-web \
  -o /private/tmp/things3-web-server.log \
  -e /private/tmp/things3-web-server.log \
  -- "/Users/walterzhao/Library/Application Support/QClaw/python/bin/python3.11" \
  -m http.server 8123 \
  --directory /Users/walterzhao/Desktop/code/codebase/things3-web \
  --bind 127.0.0.1
```

停止服务：

```bash
launchctl remove com.walterzhao.things3-web
```

代码文件修改后服务会直接读取新版本，无需重启；浏览器需要刷新页面。该临时服务会持续到退出当前 macOS 登录会话，但不会在重启电脑后自动恢复。

### 固定使用
建议将页面固定在浏览器标签页，或通过 PWA 方式添加到主屏。

## 🔔 通知权限

首次设置提醒时浏览器会请求通知权限，请允许。否则提醒不会弹窗。

## 💾 数据备份

数据仅存在浏览器本地。建议定期点击侧边栏「导出数据」备份为 JSON 文件。换设备或清缓存后可用「导入数据」恢复。
