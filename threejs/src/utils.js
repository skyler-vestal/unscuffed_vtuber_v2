/* 
 * Utilities functions
*/
import { Euler, Vector3, Quaternion } from 'three';

function getAngle2D(ax, ay, bx, by) {
    return Math.atan2(by - ay, bx - ax);
}

function normRadians(r) {
    if (r >= Math.PI / 2) {
        r -= Math.PI * 2;
    }
    if (r <= -Math.PI / 2) {
        r += Math.PI * 2
        r = Math.PI - r;
    }
    return r / Math.PI;
}

export function getAngleBetween3Points(a, b, c) {
    // a - b
    let v1 = (new Vector3()).copy(a).sub(b);

    // c - b
    let v2 = (new Vector3()).copy(c).sub(b);

    let dotProd = v1.normalize().dot(v2.normalize());
    let angle = Math.acos(dotProd);
    return normRadians(angle);
}


export function getRotationBetweenVec(a, b) {
    let euler = new Euler(
        normRadians(getAngle2D(a.z, a.x, b.z, b.x)),
        normRadians(getAngle2D(a.z, a.y, b.z, b.y)),
        normRadians(getAngle2D(a.x, a.y, b.x, b.y))
    );

    // euler.z = Math.max(Math.min(a.z, 0), -2.14);
    // euler.z *= -2.3; 
    
    // euler.x -= 0.3;
    // euler.x = Math.max(Math.min(euler.x, Math.PI), -0.5);
    return euler;
    // convert to human limits

}

export function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

export function slerpShort(q1, q2, time, dest) {
    if (!dest) {
        dest = new Quaternion();
    }
    if (time <= 0.0) {
        dest.xyzw = q1.xyzw;
        return dest;
    } else if (time >= 1.0) {
        dest.xyzw = q2.xyzw;
        return dest;
    }
    let cos = q1.dot(q2);
    const q2a = (new Quaternion()).copy(q2);
    if (cos < 0.0) {
        q2a.x = -q2a.x;
        q2a.y = -q2a.y;
        q2a.z = -q2a.z;
        q2a.w = -q2a.w;
        cos = -cos;
    }
    let k0;
    let k1;
    if (cos > 0.9999) {
        k0 = 1 - time;
        k1 = 0 + time;
    }
    else {
        const sin = Math.sqrt(1 - cos * cos);
        const angle = Math.atan2(sin, cos);
        const oneOverSin = 1 / sin;
        k0 = Math.sin((1 - time) * angle) * oneOverSin;
        k1 = Math.sin((0 + time) * angle) * oneOverSin;
    }
    dest.x = k0 * q1.x + k1 * q2a.x;
    dest.y = k0 * q1.y + k1 * q2a.y;
    dest.z = k0 * q1.z + k1 * q2a.z;
    dest.w = k0 * q1.w + k1 * q2a.w;
    return dest;
}

// negate the w component of a quaternion
// modify the quaternion in place and return
export function negateQuatW(q) {
    q.set(q.x, q.y, q.z, (-1) * q.w);
    return q;
}