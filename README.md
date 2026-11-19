# 原神启动

> 免责声明：
本网站是一个纯粹的技术示例，旨在展示和分享我们的技术能力。网站的设计和内容受到《原神》的启发，并尽可能地复制了《原神》的登录界面。我们对此表示敬意，并强调这个项目不是官方的《原神》产品，也没有与《原神》或其母公司miHoYo有任何关联。我们没有，也无意从这个项目中获得任何经济利益。这个网站的所有内容仅供学习和研究目的，以便让更多的人了解和熟悉webgl开发技术。
如果miHoYo或任何有关方面认为这个项目侵犯了他们的权益，请联系我们，我们会立即采取行动。

## 简介
视频介绍：[【超还原！three.js复刻原神启动，网页就能玩】](https://www.bilibili.com/video/BV1E8411v7xy/?share_source=copy_web&vd_source=a8feede4d26d2a3cfa4e68803fdd2c94)

《原神启动》是一个基于xviewer.js开发的在线网站，本仓库包含了此项目的所有源码。前端开发我们也在摸索学习，不规范的地方欢迎大家指正。由于本网站与《原神》比较接近，大家切勿将本源码用于不正当用途！

由于网站访问量比较大，免费的托管服务都不让用，我自己的服务器也因为被攻击暂时没有对外了，如果有云服务商愿意赞助将不胜感激。我们也会制作更多有趣的项目开源给大家。

## 目录结构

本仓库使用 pnpm workspace 管理，渲染库与应用分开，方便库单独发布。

```
www-genshin
├─ apps/www-genshin  《原神启动》应用（Vite + React）
└─ packages/xviewer  @xviewer2/xviewer 渲染库，产物可独立发布到 npm
```

## 启动代码

```sh
pnpm install
pnpm dev
```

`pnpm dev` 会先构建渲染库，再并行启动 `tsdown --watch` 与 Vite 开发服务器（默认 http://127.0.0.1:5175）。只需跑应用时用 `pnpm start`。

常用命令：

```sh
pnpm build       # 按依赖顺序构建库与应用
pnpm typecheck   # 全部包类型检查
pnpm test        # 全部包测试
pnpm build:lib   # 只构建 @xviewer2/xviewer
pnpm publish:lib # 发布 @xviewer2/xviewer（需先登录 npm）
```

库的导出盘点、类型对照与浏览器对照脚本见 [packages/xviewer/README.md](packages/xviewer/README.md)。

## xviewer.js是什么
xviewer.js是一个基于three.js的插件式渲染框架，它对three.js做了一层简洁优雅的封装，包含了大量实用的组件和插件，目标是让前端开发者能更简单地应用webgl技术。xviewer.js也会在近期开源，我们也在制作更多有趣的演示案例，欢迎大家关注我的b站账号。[【three.js实现水墨杭州迎亚运】](https://www.bilibili.com/video/BV1yG411Z7sw/?share_source=copy_web&vd_source=a8feede4d26d2a3cfa4e68803fdd2c94)也是基于xviewer.js开发的。

## three.js教程
制作教程是一件非常费时费力的事，所以我对所有愿意制作教程的博主给予敬意，以下是我比较推荐的内容

官网手册：[Three.js Fundamentals](https://threejs.org/manual/#en/fundamentals)

视频教程：[Three.js Journey](https://threejs-journey.com/)（b站有搬运）

shader教程：[The Book of Shaders by Patricio Gonzalez Vivo & Jen Lowe](https://thebookofshaders.com/?lan=ch)

## 交流群
暂无计划
