import { Component } from "./Component.ts";

/** 标记可由 Viewer 以插件方式挂载的组件。 */
export class Plugin extends Component {
    isPlugin = true;
}
