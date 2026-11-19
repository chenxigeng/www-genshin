import { Euler } from "three";

/** 属性路径遍历使用的可写对象。 */
type PropertyBag = Record<string, unknown>;

/** 按原版规则合并属性，支持用连字符访问嵌套字段。 */
export function $p<T extends object>(target: T, props: object, force = false): T {
    const source = props as PropertyBag;
    for (const key in source) {
        const value = source[key];
        if (value === undefined) continue;
        const path = key.split("-");
        let owner = target as PropertyBag;
        let current: unknown = owner;
        for (const [index, field] of path.entries()) {
            if (force || owner.hasOwnProperty(field)) {
                current = owner[field];
                if (index === path.length - 1) {
                    const copy = (current as { copy?: (value: unknown) => unknown } | undefined)?.copy;
                    if (copy) copy.call(current, value);
                    else if (current instanceof Object) Object.assign(current, value);
                    else owner[field] = value;
                }
                owner = current as PropertyBag;
            }
        }
    }
    return target;
}
/** 创建使用 Three.js 默认旋转顺序的欧拉角，单位为弧度。 */
export function $r(x?: number, y?: number, z?: number): Euler {
    return new Euler(x, y, z);
}

/** 装饰器接受的属性元数据，由调用方与检查器共同解释。 */
type PropertyOptions = Record<string, unknown>;

/** 原版在原型或构造器上维护的自有属性元数据表。 */
interface PropertyMetadata {
    /** 以被装饰属性名索引配置。 */
    __properties?: Record<PropertyKey, PropertyOptions>;
}

/** 标准成员装饰器提供的名字和初始化入口。 */
interface PropertyContext {
    /** 被装饰的成员名。 */
    name: PropertyKey;
    /** 在实例或类初始化时绑定元数据。 */
    addInitializer(initializer: (this: object) => void): void;
}

/** 支持旧式属性装饰器及 TypeScript 标准成员装饰器。 */
export function property(options: PropertyOptions = {}) {
    /** 首次写入时浅拷贝相邻原型的元数据。 */
    function register(target: object & PropertyMetadata, key: PropertyKey) {
        if (!target.hasOwnProperty("__properties")) {
            const parent = Object.getPrototypeOf(target) as PropertyMetadata;
            target.__properties = Object.assign({}, parent.__properties);
        }
        target.__properties![key] = options;
    }
    return (target: unknown, key: PropertyKey | PropertyContext) => {
        if (typeof key === "object") key.addInitializer(function () { register(this, key.name); });
        else register(target as object & PropertyMetadata, key);
    };
}
