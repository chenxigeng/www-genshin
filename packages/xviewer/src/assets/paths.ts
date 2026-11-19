/** 返回最后一个点后的原始内容，保留大小写和 URL 后缀。 */
export function $ext(path: string) {
    const index = path.lastIndexOf(".");
    return index === -1 ? "" : path.slice(index + 1);
}

/** 返回最后一个斜杠之后的内容，可按原版规则移除扩展名。 */
export function $basename(path: string, ext?: string) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    return ext ? name.replace(ext, "").replace(".", "") : name;
}

/** 返回最后一个斜杠之前的目录。 */
export function $dirname(path: string) {
    const index = path.lastIndexOf("/");
    return index === -1 ? "" : path.slice(0, index);
}
