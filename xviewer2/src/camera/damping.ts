import { MathUtils, Vector3 } from "three";
import type { Quaternion } from "three";

/** 平滑插值在调用方对象上保留的速度。 */
interface DampState {
    /** 最近一次估算出的速度，可跨帧保存。 */
    _velocity?: number;
}

const epsilon = 1e-6;
const vectorDelta = new Vector3();

/** 在给定时间内以指数衰减消除约 99% 的差值。 */
export function exponentialDamp(current: number, target: number, dampTime: number, dt: number) {
    return current + (target - current) * (1 - Math.exp(Math.log(0.01) / dampTime * dt));
}

/** 按剩余时间的四次方衰减。 */
export function quarticDamp(current: number, target: number, dampTime: number, dt: number) {
    const remaining = 1 - Math.min(dt, dampTime) / dampTime;
    const squared = remaining * remaining;
    return current + (target - current) * (1 - squared * squared);
}

/** 通过带速度状态的阻尼平滑逼近目标，并限制最大速度。 */
export function smoothDamp(state: DampState, current: number, target: number, smoothTime: number, maxSpeed: number, dt: number) {
    state._velocity ??= 0;
    smoothTime = Math.max(1e-4, smoothTime);
    const omega = 2 / smoothTime;
    const step = omega * dt;
    const decay = 1 / (1 + step + 0.48 * step * step + 0.235 * step * step * step);
    const maxChange = maxSpeed * smoothTime;
    const change = MathUtils.clamp(current - target, -maxChange, maxChange);
    const adjustedTarget = current - change;
    const impulse = (state._velocity + omega * change) * dt;
    state._velocity = (state._velocity - omega * impulse) * decay;
    const result = adjustedTarget + (change + impulse) * decay;
    if ((target - current > 0) === (result > target)) {
        state._velocity = (target - target) / dt;
        return target;
    }
    return result;
}

/** 按指数比率进行球面插值。 */
export function Quat_exponentialDamp(out: Quaternion, current: Quaternion, target: Quaternion, dampTime: number, dt: number) {
    return out.copy(current).slerp(target, exponentialDamp(0, 1, dampTime, dt));
}

/** 按四次衰减比率进行球面插值。 */
export function Quat_quarticDamp(out: Quaternion, current: Quaternion, target: Quaternion, dampTime: number, dt: number) {
    return out.copy(current).slerp(target, quarticDamp(0, 1, dampTime, dt));
}

/** 使用输出向量保存阻尼状态，默认就地更新。 */
export function Vec3_smoothDamp(current: Vector3, target: Vector3, dampTime: number, dt: number, out = current) {
    return out.copy(current).lerp(target, smoothDamp(out as Vector3 & DampState, 0, 1, dampTime, Infinity, dt));
}

/** 使用输出四元数保存阻尼状态，默认就地更新。 */
export function Quat_smoothDamp(current: Quaternion, target: Quaternion, dampTime: number, dt: number, out = current) {
    return out.copy(current).slerp(target, smoothDamp(out as Quaternion & DampState, 0, 1, dampTime, Infinity, dt));
}

/** 当速度为正时按时间比例插值，足够接近则吸附到目标。 */
export function FInterpTo(current: number, target: number, dt: number, speed: number) {
    const change = target - current;
    return speed <= 0 || Math.abs(change) < epsilon ? target : current + change * MathUtils.clamp(speed * dt, 0, 1);
}

/** 按每帧最大位移限制标量插值。 */
export function FInterpConstantTo(current: number, target: number, dt: number, speed: number) {
    const change = target - current;
    if (Math.abs(change) < epsilon) return target;
    const step = speed * dt;
    return current + MathUtils.clamp(change, -step, step);
}

/** 对向量差值做有界比例插值。 */
export function VInterpTo(current: Vector3, target: Vector3, dt: number, speed: number, out = current) {
    if (speed <= 0) return out.copy(target);
    const delta = vectorDelta.copy(target).sub(current);
    if (delta.lengthSq() < epsilon) return out.copy(target);
    return out.copy(current).add(delta.multiplyScalar(MathUtils.clamp(dt * speed, 0, 1)));
}

/** 超出步长时沿目标方向前进一个单位，沿用原版行为。 */
export function VInterpConstantTo(current: Vector3, target: Vector3, dt: number, speed: number, out = current) {
    const delta = vectorDelta.copy(target).sub(current);
    const length = delta.length();
    const step = speed * dt;
    if (length <= step) return out.copy(target);
    if (step > 0) return out.copy(current).add(delta.multiplyScalar(1 / length));
    return out.copy(current);
}

/** 分量基于相对误差和绝对误差比较。 */
function nearQuaternion(a: Quaternion, b: Quaternion) {
    return (["x", "y", "z", "w"] as const).every((key) => Math.abs(a[key] - b[key]) <= epsilon * Math.max(1, Math.abs(a[key]), Math.abs(b[key])));
}

/** 旋转插值，零速和足够接近时直接返回目标引用。 */
export function QInterpTo(current: Quaternion, target: Quaternion, dt: number, speed: number) {
    return speed <= 0 || nearQuaternion(current, target)
        ? target : current.slerp(target, MathUtils.clamp(speed * dt, 0, 1));
}

/** 按角距离限制球面插值。 */
export function QInterpConstantTo(current: Quaternion, target: Quaternion, dt: number, speed: number, out = current) {
    if (speed <= 0 || nearQuaternion(current, target)) return out.copy(target);
    const step = MathUtils.clamp(speed * dt, 0, 1);
    const dot = current.dot(target);
    const angle = Math.max(Math.acos(2 * dot * dot - 1), epsilon);
    return out.copy(current).slerp(target, MathUtils.clamp(step / angle, 0, 1));
}
